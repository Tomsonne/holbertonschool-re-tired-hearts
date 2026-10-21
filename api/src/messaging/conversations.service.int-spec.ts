import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../database/typeorm.config';
import { EventRegistration } from '../events/event-registration.entity';
import { EventInputDto } from '../events/event-input.dto';
import { Event, EventStatus } from '../events/event.entity';
import { EventsService } from '../events/events.service';
import { RegistrationsService } from '../events/registrations.service';
import { Interest } from '../interests/interest.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { Conversation } from './conversation.entity';
import { ConversationsService } from './conversations.service';
import { Message } from './message.entity';

describe('ConversationsService (PostgreSQL)', () => {
  let db: DataSource;
  let events: EventsService;
  let registrations: RegistrationsService;
  let conversations: ConversationsService;
  let interestId: number;
  const userIds: string[] = [];
  const eventIds: string[] = [];

  async function user(role = UserRole.Member): Promise<string> {
    const account = await db.manager.save(db.manager.create(User, {
      email: `${randomUUID()}@example.test`, passwordHash: 'integration-test-only',
      role, status: AccountStatus.Active,
    }));
    userIds.push(account.id);
    await db.manager.save(db.manager.create(Profile, {
      userId: account.id, displayName: 'Profil de test', cityName: 'Lyon',
      departmentCode: '69', status: ProfileStatus.Approved, allowMessages: true,
    }));
    return account.id;
  }

  async function event(organizerId: string): Promise<string> {
    const startsAt = new Date(Date.now() + 86400000);
    const input: EventInputDto = {
      title: 'Atelier partagé', description: 'Une rencontre conviviale pour tous les participants.',
      interestId, startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 7200000).toISOString(),
      location: { cityName: 'Lyon', postalCode: '69001', departmentCode: '69', verified: false },
      exactAddress: 'Place des Terreaux, Lyon', capacity: 5,
    };
    const created = await events.create(organizerId, input);
    eventIds.push(created.id);
    await events.publish(organizerId, created.id);
    return created.id;
  }

  beforeAll(async () => {
    config({ path: ['.env', '../.env'] });
    db = new DataSource(buildDataSourceOptions({ ...process.env, DATABASE_NAME: 're_tired_hearts_test' }));
    await db.initialize();
    await db.runMigrations();
    events = new EventsService(db);
    registrations = new RegistrationsService(db);
    conversations = new ConversationsService(db);
    interestId = (await db.manager.findOneByOrFail(Interest, { slug: 'cuisine' })).id;
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    for (const id of userIds) {
      await db.manager.delete(Conversation, { participantAId: id });
      await db.manager.delete(Conversation, { participantBId: id });
    }
    for (const id of eventIds) {
      await db.manager.delete(EventRegistration, { eventId: id });
      await db.manager.delete(Event, { id });
    }
    for (const id of userIds) {
      await db.manager.delete(Profile, { userId: id });
      await db.manager.delete(User, { id });
    }
    await db.destroy();
  });

  it('crée une paire unique pour deux inscrits et la renvoie dans les deux sens', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const eventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);

    const first = await conversations.start(a, b, eventId);
    expect(first.created).toBe(true);
    expect(first.conversation).toMatchObject({
      otherParticipant: { userId: b, available: true }, contextEvent: { id: eventId }, canSend: true,
    });
    const reverse = await conversations.start(b, a);
    expect(reverse.created).toBe(false);
    expect(reverse.conversation).toMatchObject({ id: (first.conversation as Conversation).id,
      otherParticipant: { userId: a } });
    expect(await db.manager.countBy(Conversation, {
      participantAId: [a, b].sort()[0], participantBId: [a, b].sort()[1],
    })).toBe(1);
  });

  it('autorise le contact avec l’organisateur, puis conserve une conversation existante après retrait', async () => {
    const organizer = await user(UserRole.Organizer);
    const member = await user();
    const eventId = await event(organizer);
    await registrations.register(member, eventId);
    const first = await conversations.start(member, organizer);
    expect(first.created).toBe(true);
    await registrations.withdraw(member, eventId);
    const again = await conversations.start(organizer, member);
    expect(again.created).toBe(false);
    expect(again.conversation).toMatchObject({ id: (first.conversation as Conversation).id });
  });

  it('sérialise deux créations simultanées dans les deux sens', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const eventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);
    const results = await Promise.all([
      conversations.start(a, b, eventId),
      conversations.start(b, a, eventId),
    ]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect((results[0].conversation as Conversation).id).toBe((results[1].conversation as Conversation).id);
    expect(await db.manager.countBy(Conversation, {
      participantAId: [a, b].sort()[0], participantBId: [a, b].sort()[1],
    })).toBe(1);
  });

  it('autorise un premier contact après la fin de la sortie si les inscriptions restent actives', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const eventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);
    await db.manager.update(Event, { id: eventId }, {
      startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000),
      status: EventStatus.Completed, completedAt: new Date(),
    });
    expect((await conversations.start(a, b, eventId)).created).toBe(true);
  });

  it('refuse un retrait, un mauvais contexte et un contact avec soi-même', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const eventId = await event(organizer);
    const otherEventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);
    await expect(conversations.start(a, b, otherEventId)).rejects.toMatchObject({
      status: 403, response: { code: 'NOT_ELIGIBLE' },
    });
    await registrations.withdraw(b, eventId);
    await expect(conversations.start(a, b, eventId)).rejects.toMatchObject({
      status: 403, response: { code: 'NOT_ELIGIBLE' },
    });
    await expect(conversations.start(a, a)).rejects.toMatchObject({ status: 400 });
    expect(await db.manager.countBy(Conversation, {
      participantAId: [a, b].sort()[0], participantBId: [a, b].sort()[1],
    })).toBe(0);
  });

  it('refuse les comptes indisponibles, profils non approuvés et messages désactivés', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const eventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);

    await db.manager.update(Profile, { userId: b }, { allowMessages: false });
    await expect(conversations.start(a, b)).rejects.toMatchObject({ status: 409, response: { code: 'MESSAGING_DISABLED' } });
    await db.manager.update(Profile, { userId: b }, { allowMessages: true, status: ProfileStatus.Pending });
    await expect(conversations.start(a, b)).rejects.toMatchObject({ status: 404, response: { code: 'PROFILE_UNAVAILABLE' } });
    await db.manager.update(Profile, { userId: b }, { status: ProfileStatus.Approved });
    await db.manager.update(User, { id: b }, { status: AccountStatus.Suspended, suspendedAt: new Date() });
    await expect(conversations.start(a, b)).rejects.toMatchObject({ status: 404, response: { code: 'PROFILE_UNAVAILABLE' } });
    expect(await db.manager.countBy(Conversation, {
      participantAId: [a, b].sort()[0], participantBId: [a, b].sort()[1],
    })).toBe(0);
  });

  it('nettoie le texte, attribue l’expéditeur à la session et refuse les bornes invalides', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const eventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);
    const { conversation } = await conversations.start(a, b);
    const id = (conversation as Conversation).id;
    const sent = await conversations.send(a, id, '  Bonjour \n   à tous  ') as Message;
    expect(sent).toMatchObject({ body: 'Bonjour à tous', sentByMe: true });
    expect(await db.manager.findOneByOrFail(Message, { id: sent.id })).toMatchObject({
      senderId: a, body: 'Bonjour à tous',
    });
    for (const body of ['', '  \t\n  ', 'x'.repeat(1001)]) {
      await expect(conversations.send(a, id, body)).rejects.toMatchObject({
        status: 400, response: { code: 'VALIDATION_FAILED' },
      });
    }
    expect(await db.manager.countBy(Message, { conversationId: id })).toBe(1);
  });

  it('pagine les messages du plus ancien au plus récent avec un curseur stable', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const eventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);
    const { conversation } = await conversations.start(a, b);
    const id = (conversation as Conversation).id;
    const first = await conversations.send(a, id, 'Premier') as Message;
    const second = await conversations.send(b, id, 'Deuxième') as Message;
    const third = await conversations.send(a, id, 'Troisième') as Message;
    const latest = await conversations.messages(a, id, undefined, 2);
    expect(latest.map((message) => (message as Message).id)).toEqual([second.id, third.id]);
    expect(latest[0]).toMatchObject({ sentByMe: false, body: 'Deuxième' });
    const older = await conversations.messages(a, id, second.id, 2);
    expect(older.map((message) => (message as Message).id)).toEqual([first.id]);
    expect(await conversations.list(a)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, lastMessage: expect.objectContaining({ body: 'Troisième', sentByMe: true }) }),
    ]));
  });

  it('refuse lecture et écriture aux tiers, modérateur compris, sans exposer le contenu', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const outsider = await user();
    const moderator = await user(UserRole.Moderator);
    const eventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);
    const { conversation } = await conversations.start(a, b);
    const id = (conversation as Conversation).id;
    await conversations.send(a, id, 'Contenu strictement privé');
    for (const stranger of [outsider, moderator]) {
      for (const request of [
        conversations.detail(stranger, id),
        conversations.messages(stranger, id),
        conversations.send(stranger, id, 'Tentative'),
      ]) {
        await expect(request).rejects.toMatchObject({
          status: 404, response: { code: 'CONVERSATION_NOT_FOUND' },
        });
      }
    }
    expect(await db.manager.countBy(Message, { conversationId: id })).toBe(1);
  });

  it('continue après désinscription et fin de sortie, puis bloque un destinataire indisponible', async () => {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const eventId = await event(organizer);
    await registrations.register(a, eventId);
    await registrations.register(b, eventId);
    const { conversation } = await conversations.start(a, b);
    const id = (conversation as Conversation).id;
    await registrations.withdraw(b, eventId);
    await db.manager.update(Event, { id: eventId }, {
      startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000),
    });
    expect(await conversations.send(a, id, 'Encore possible')).toMatchObject({ body: 'Encore possible' });
    await db.manager.update(Profile, { userId: b }, { allowMessages: false });
    await expect(conversations.send(a, id, 'Refus')).rejects.toMatchObject({
      status: 409, response: { code: 'MESSAGING_DISABLED' },
    });
    expect((await conversations.messages(a, id)).map((message) => (message as Message).body)).toEqual(['Encore possible']);
  });
});
