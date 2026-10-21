import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../database/typeorm.config';
import { Interest } from '../interests/interest.entity';
import { ModerationAction } from '../moderation/moderation-action.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { Event, EventStatus } from './event.entity';
import { EventInputDto } from './event-input.dto';
import { EventsService } from './events.service';

// Utilise uniquement la base *_test ; la base de démonstration n'est jamais modifiée.
describe('EventsService (PostgreSQL)', () => {
  let db: DataSource;
  let service: EventsService;
  const userIds: string[] = [];
  const eventIds: string[] = [];
  let organizerId: string;
  let otherOrganizerId: string;
  let memberId: string;
  let moderatorId: string;
  let interestId: number;
  let cuisineInterestId: number;

  async function user(role: UserRole): Promise<string> {
    const account = await db.manager.save(
      db.manager.create(User, {
        email: `${randomUUID()}@example.test`,
        passwordHash: 'integration-test-only',
        role,
        status: AccountStatus.Active,
      }),
    );
    userIds.push(account.id);
    await db.manager.save(
      db.manager.create(Profile, {
        userId: account.id,
        displayName: 'Profil de test',
        cityName: 'Lyon',
        departmentCode: '69',
        status: ProfileStatus.Approved,
      }),
    );
    return account.id;
  }

  function input(): EventInputDto {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    return {
      title: 'Promenade de quartier',
      description: 'Une promenade conviviale de deux heures dans le quartier.',
      interestId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      location: {
        cityName: 'Lyon',
        postalCode: '69001',
        departmentCode: '69',
        verified: false,
      },
      exactAddress: 'Place des Terreaux, Lyon',
      capacity: 5,
    };
  }

  beforeAll(async () => {
    config({ path: ['.env', '../.env'] });
    db = new DataSource(
      buildDataSourceOptions({ ...process.env, DATABASE_NAME: 're_tired_hearts_test' }),
    );
    await db.initialize();
    await db.runMigrations();
    service = new EventsService(db);
    const interest = await db.manager.findOneByOrFail(Interest, { slug: 'marche' });
    interestId = interest.id;
    cuisineInterestId = (await db.manager.findOneByOrFail(Interest, { slug: 'cuisine' })).id;
    organizerId = await user(UserRole.Organizer);
    otherOrganizerId = await user(UserRole.Organizer);
    memberId = await user(UserRole.Member);
    moderatorId = await user(UserRole.Moderator);
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    for (const id of eventIds) {
      await db.manager.delete(ModerationAction, { targetEventId: id });
      await db.manager.delete(Event, { id });
    }
    for (const id of userIds) {
      await db.manager.delete(Profile, { userId: id });
      await db.manager.delete(User, { id });
    }
    await db.destroy();
  });

  it('crée un brouillon pour un organisateur approuvé et refuse un membre', async () => {
    const event = await service.create(organizerId, input());
    eventIds.push(event.id);
    expect(event.status).toBe(EventStatus.Draft);
    await expect(service.create(memberId, input())).rejects.toMatchObject({
      response: { code: 'ROLE_REQUIRED' },
    });
    await expect(service.findVisible(memberId, event.id)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_FOUND' },
    });
  });

  it("refuse qu'un autre organisateur modifie ou publie le brouillon", async () => {
    const event = await service.create(organizerId, input());
    eventIds.push(event.id);
    await expect(service.update(otherOrganizerId, event.id, { title: 'Autre titre' })).rejects.toMatchObject({
      response: { code: 'NOT_EVENT_OWNER' },
    });
    await expect(service.publish(otherOrganizerId, event.id)).rejects.toMatchObject({
      response: { code: 'NOT_EVENT_OWNER' },
    });
    await expect(service.update(memberId, event.id, { title: 'Titre interdit' })).rejects.toMatchObject({
      status: 403, response: { code: 'ROLE_REQUIRED' },
    });
    expect((await db.manager.findOneByOrFail(Event, { id: event.id })).title).toBe(input().title);
  });

  it('publie, puis annule avec un audit quand le modérateur agit', async () => {
    const event = await service.create(organizerId, input());
    eventIds.push(event.id);
    expect((await service.publish(organizerId, event.id)).status).toBe(EventStatus.Published);
    const memberView = await service.detail(memberId, event.id);
    expect(memberView.exactAddress).toBeNull();
    expect(memberView.location).toEqual({ cityName: 'Lyon', departmentCode: '69' });
    expect(memberView.canRegister).toBe(true);
    expect((await service.detail(organizerId, event.id)).exactAddress).toBe('Place des Terreaux, Lyon');
    await expect(service.remove(organizerId, event.id)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_DELETABLE' },
    });
    await expect(service.cancel(moderatorId, event.id, 'Sortie inappropriée')).rejects.toMatchObject({
      response: { code: 'ROLE_REQUIRED' },
    });
    const cancelled = await service.cancelByModerator(moderatorId, event.id, 'Sortie inappropriée');
    expect(cancelled.status).toBe(EventStatus.Cancelled);
    const audit = await db.manager.findOneBy(ModerationAction, { targetEventId: event.id });
    expect(audit).toMatchObject({ moderatorId, reason: 'Sortie inappropriée' });
    await expect(service.detail(memberId, event.id)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_FOUND' },
    });
  });

  it('combine les filtres intérêt et ville, y compris sans code INSEE', async () => {
    const cuisineLyon = await service.create(organizerId, { ...input(), interestId: cuisineInterestId });
    const cuisineVilleurbanne = await service.create(organizerId, {
      ...input(),
      interestId: cuisineInterestId,
      location: { cityName: 'Villeurbanne', postalCode: '69100', departmentCode: '69', verified: false },
    });
    const marcheLyon = await service.create(organizerId, input());
    eventIds.push(cuisineLyon.id, cuisineVilleurbanne.id, marcheLyon.id);
    await service.publish(organizerId, cuisineLyon.id);
    await service.publish(organizerId, cuisineVilleurbanne.id);
    await service.publish(organizerId, marcheLyon.id);

    const byInterest = await service.listPublished(memberId, { interestId: cuisineInterestId });
    expect(byInterest.items.map((event) => event.id)).toEqual(expect.arrayContaining([cuisineLyon.id, cuisineVilleurbanne.id]));
    const byCity = await service.listPublished(memberId, { cityName: 'lYoN' });
    expect(byCity.items.map((event) => event.id)).toContain(cuisineLyon.id);
    expect(byCity.items.map((event) => event.id)).not.toContain(cuisineVilleurbanne.id);
    const combined = await service.listPublished(memberId, { interestId: cuisineInterestId, cityName: 'Villeurbanne' });
    expect(combined.total).toBe(1);
    expect(combined.items[0].id).toBe(cuisineVilleurbanne.id);
    expect(combined.items[0].location).toEqual({ cityName: 'Villeurbanne', departmentCode: '69' });
    expect(JSON.stringify(combined)).not.toContain('69100');

    const saintEtienne = await service.create(organizerId, {
      ...input(),
      location: { cityName: 'Saint-Étienne', postalCode: '42000', departmentCode: '42', verified: false },
    });
    eventIds.push(saintEtienne.id);
    await service.publish(organizerId, saintEtienne.id);
    const withoutAccent = await service.listPublished(memberId, { cityName: 'Saint-Etienne' });
    expect(withoutAccent.items.map((event) => event.id)).toContain(saintEtienne.id);
  });

  it('pagine uniquement les sorties publiées à venir sans exposer l’adresse', async () => {
    const cityName = `Ville de test ${randomUUID()}`;
    const events: Event[] = [];
    for (let index = 0; index < 15; index += 1) {
      const event = await service.create(organizerId, {
        ...input(),
        location: { cityName, postalCode: '69001', departmentCode: '69', verified: false },
      });
      events.push(event);
      eventIds.push(event.id);
    }
    for (const event of events.slice(0, 14)) {
      await service.publish(organizerId, event.id);
    }
    const past = events[0];
    await db.manager.update(Event, past.id, {
      startsAt: new Date(Date.now() - 7200000),
      endsAt: new Date(Date.now() - 3600000),
    });

    const first = await service.listPublished(memberId, { cityName, page: 1 });
    const second = await service.listPublished(memberId, { cityName, page: 2 });
    expect(first).toMatchObject({ page: 1, pageSize: 12, total: 13 });
    expect(first.items).toHaveLength(12);
    expect(second.items).toHaveLength(1);
    const listedIds = [...first.items, ...second.items].map((event) => event.id);
    expect(listedIds).not.toContain(past.id);
    expect(listedIds).not.toContain(events[14].id);
    expect(JSON.stringify({ first, second })).not.toContain('Place des Terreaux');
  });
});
