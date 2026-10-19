import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { ACCESS_LEVEL_KEY } from '../../src/auth/auth.decorators';
import { validationExceptionFactory } from '../../src/common/validation';
import { Interest } from '../../src/interests/interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';
import { EventRegistration } from '../../src/events/event-registration.entity';
import { Event, EventStatus } from '../../src/events/event.entity';
import { EventInputDto, UpdateEventDto } from '../../src/events/event-input.dto';
import { EventsController } from '../../src/events/events.controller';
import { EventsService } from '../../src/events/events.service';

const dateAfter = (days: number) => new Date(Date.now() + days * 86_400_000);

function input(): EventInputDto {
  return {
    title: 'Promenade au parc',
    description: 'Une sortie conviviale dans le quartier.',
    interestId: 1,
    startsAt: dateAfter(2).toISOString(),
    endsAt: dateAfter(3).toISOString(),
    location: { cityName: 'Lyon', departmentCode: '69', postalCode: '69001', verified: true },
    exactAddress: '12 rue des Lilas, Lyon',
    capacity: 5,
  };
}

function fixture() {
  const user = Object.assign(new User(), { id: 'owner', role: UserRole.Organizer, status: AccountStatus.Active });
  const profile = Object.assign(new Profile(), { userId: 'owner', status: ProfileStatus.Approved });
  let event = Object.assign(new Event(), {
    id: 'event-1', organizerId: 'owner', status: EventStatus.Draft,
    startsAt: dateAfter(2), endsAt: dateAfter(3), capacity: 5,
  });
  let registrations = 0;
  const manager = {
    findOneBy: jest.fn(async (entity: unknown) =>
      entity === User ? user : entity === Profile ? profile : entity === Event ? event : null),
    findOne: jest.fn(async () => event),
    existsBy: jest.fn(async (entity: unknown) => entity === Interest),
    create: jest.fn((entity: new () => object, values: object) => Object.assign(new entity(), values)),
    save: jest.fn(async (value: Event) => value),
    countBy: jest.fn(async (entity: unknown) => entity === EventRegistration ? registrations : 0),
    remove: jest.fn(async () => undefined),
  };
  const db = {
    manager,
    transaction: jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
      callback(manager as unknown as EntityManager)),
  } as unknown as DataSource;
  return {
    service: new EventsService(db), user, profile, manager,
    get event() { return event; },
    set event(value: Event) { event = value; },
    set registrations(value: number) { registrations = value; },
  };
}

describe('Issue #12 — création et cycle de vie des événements', () => {
  it('valide les données d’entrée et refuse les champs non prévus', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true,
      exceptionFactory: validationExceptionFactory });
    const metadata: ArgumentMetadata = { type: 'body', metatype: EventInputDto };
    await expect(pipe.transform(input(), metadata)).resolves.toBeInstanceOf(EventInputDto);
    await expect(pipe.transform({ ...input(), organizerId: 'intrus' }, metadata)).rejects.toMatchObject({ status: 400 });
    await expect(pipe.transform({ ...input(), location: { ...input().location, postalCode: '69' } }, metadata))
      .rejects.toMatchObject({ status: 400 });
  });

  it('exige un objet location à la création et accepte son absence à la modification', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true,
      exceptionFactory: validationExceptionFactory });
    const createMetadata: ArgumentMetadata = { type: 'body', metatype: EventInputDto };
    const updateMetadata: ArgumentMetadata = { type: 'body', metatype: UpdateEventDto };
    const { location: _location, ...withoutLocation } = input();

    await expect(pipe.transform(withoutLocation, createMetadata)).rejects.toMatchObject({ status: 400 });
    await expect(pipe.transform({ ...input(), location: [] }, createMetadata)).rejects.toMatchObject({ status: 400 });
    await expect(pipe.transform({ location: [] }, updateMetadata)).rejects.toMatchObject({ status: 400 });
    await expect(pipe.transform({ title: 'Promenade modifiée' }, updateMetadata))
      .resolves.toBeInstanceOf(UpdateEventDto);
  });

  it('réserve les routes d’écriture aux organisateurs', () => {
    const reflector = new Reflector();
    for (const method of ['create', 'update', 'publish', 'cancel', 'complete', 'remove'] as const) {
      expect(reflector.get(ACCESS_LEVEL_KEY, EventsController.prototype[method])).toBe('organizer');
    }
  });

  it('crée un brouillon seulement pour un organisateur approuvé', async () => {
    const f = fixture();
    const created = await f.service.create('owner', input());
    expect(created).toMatchObject({ organizerId: 'owner', status: EventStatus.Draft, title: 'Promenade au parc' });
    expect(f.manager.save).toHaveBeenCalledTimes(1);

    f.user.role = UserRole.Member;
    await expect(f.service.create('owner', input())).rejects.toMatchObject({ response: { code: 'ROLE_REQUIRED' } });
    f.user.role = UserRole.Organizer;
    f.profile.status = ProfileStatus.Pending;
    await expect(f.service.create('owner', input())).rejects.toMatchObject({ response: { code: 'PROFILE_NOT_APPROVED' } });
    expect(f.manager.save).toHaveBeenCalledTimes(1);
  });

  it('cache les brouillons aux autres membres mais les montre aux modérateurs', async () => {
    const f = fixture();
    f.user.id = 'other';
    f.user.role = UserRole.Member;
    await expect(f.service.findVisible('other', 'event-1')).rejects.toMatchObject({
      response: { statusCode: 404, code: 'EVENT_NOT_FOUND' },
    });
    f.user.role = UserRole.Moderator;
    await expect(f.service.findVisible('other', 'event-1')).resolves.toBe(f.event);
  });

  it('accepte draft → published → cancelled et refuse une republication', async () => {
    const f = fixture();
    await expect(f.service.publish('owner', 'event-1')).resolves.toMatchObject({ status: EventStatus.Published });
    await expect(f.service.publish('owner', 'event-1')).rejects.toMatchObject({
      response: { code: 'INVALID_EVENT_TRANSITION' },
    });
    await expect(f.service.cancel('owner', 'event-1', 'Météo défavorable')).resolves.toMatchObject({
      status: EventStatus.Cancelled, cancellationReason: 'Météo défavorable',
    });
    await expect(f.service.complete('owner', 'event-1')).rejects.toMatchObject({
      response: { code: 'INVALID_EVENT_TRANSITION' },
    });
  });

  it('clôture une sortie publiée après sa fin', async () => {
    const f = fixture();
    f.event.status = EventStatus.Published;
    f.event.startsAt = dateAfter(-2);
    f.event.endsAt = dateAfter(-1);
    await expect(f.service.complete('owner', 'event-1')).resolves.toMatchObject({
      status: EventStatus.Completed,
      completedAt: expect.any(Date),
    });
    await expect(f.service.cancel('owner', 'event-1', 'Annulation tardive')).rejects.toMatchObject({
      response: { code: 'INVALID_EVENT_TRANSITION' },
    });
  });

  it('ne supprime qu’un brouillon sans inscription', async () => {
    const f = fixture();
    f.registrations = 1;
    await expect(f.service.remove('owner', 'event-1')).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_DELETABLE' },
    });
    f.registrations = 0;
    await f.service.remove('owner', 'event-1');
    expect(f.manager.remove).toHaveBeenCalledWith(f.event);
    f.event.status = EventStatus.Published;
    await expect(f.service.remove('owner', 'event-1')).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_DELETABLE' },
    });
  });
});
