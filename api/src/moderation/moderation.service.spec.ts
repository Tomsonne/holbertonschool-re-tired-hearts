import { Reflector } from '@nestjs/core';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ACCESS_LEVEL_KEY } from '../auth/auth.decorators';
import { Event, EventStatus } from '../events/event.entity';
import { EventsService } from '../events/events.service';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { ModerationAction, ModerationActionType } from './moderation-action.entity';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

describe('Issue #23 — modération et journal d’audit', () => {
  const moderator = Object.assign(new User(), {
    id: 'moderator-id',
    role: UserRole.Moderator,
    status: AccountStatus.Active,
  });
  const target: User = Object.assign(new User(), {
    id: 'member-id',
    email: 'membre@example.fr',
    role: UserRole.Member,
    status: AccountStatus.Active,
    sessionVersion: 4,
    suspendedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  });
  const profile: Profile = Object.assign(new Profile(), {
    userId: target.id,
    displayName: 'Camille',
    bio: null,
    lookingFor: [],
    cityName: 'Lyon',
    departmentCode: '69',
    postalCode: '69001',
    cityCode: '69381',
    locationVerified: true,
    discoverable: true,
    allowMessages: true,
    status: ProfileStatus.Pending,
    reviewedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    profileInterests: [
      { interest: { id: 1, slug: 'jardinage', label: 'Jardinage' } },
    ],
  });

  let service: ModerationService;
  let transactionManager: Record<string, Record<string, jest.Mock>>;
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let eventsRepository: { findOneOrFail: jest.Mock };
  let eventsService: { cancelByModerator: jest.Mock };

  beforeEach(() => {
    target.status = AccountStatus.Active;
    target.sessionVersion = 4;
    target.suspendedAt = null;
    profile.status = ProfileStatus.Pending;
    profile.reviewedAt = null;
    const userRepository = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === moderator.id ? moderator : target,
      ),
      save: jest.fn(async (user: User) => user),
    };
    const profileRepository = {
      findOne: jest.fn(async () => profile),
      findOneBy: jest.fn(async () => profile),
      save: jest.fn(async (value: Profile) => value),
    };
    const profileInterestRepository = {
      countBy: jest.fn(async () => 1),
      find: jest.fn(async () => profile.profileInterests),
    };
    const moderationActionRepository = { insert: jest.fn() };
    const eventRepository = { findOne: jest.fn(), save: jest.fn() };
    const interestRepository = { findOneByOrFail: jest.fn() };
    const registrationRepository = { countBy: jest.fn(async () => 0) };

    transactionManager = {
      [User.name]: userRepository,
      [Profile.name]: profileRepository,
      ProfileInterest: profileInterestRepository,
      [ModerationAction.name]: moderationActionRepository,
      [Event.name]: eventRepository,
      Interest: interestRepository,
      EventRegistration: registrationRepository,
    };
    const manager = {
      getRepository: (entity: { name: string }) =>
        transactionManager[entity.name === 'ProfileInterest' ? 'ProfileInterest' : entity.name],
    };
    dataSource = {
      transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
      ),
      getRepository: jest.fn(() => registrationRepository),
    };
    eventsRepository = { findOneOrFail: jest.fn() };
    eventsService = { cancelByModerator: jest.fn(async () => undefined) };
    service = new ModerationService(
      dataSource as unknown as DataSource,
      eventsService as unknown as EventsService,
      userRepository as unknown as Repository<User>,
      profileRepository as unknown as Repository<Profile>,
      eventsRepository as unknown as Repository<Event>,
      {} as Repository<ModerationAction>,
    );
  });

  it('protège toutes les routes de modération avec le rôle modérateur', () => {
    expect(new Reflector().get(ACCESS_LEVEL_KEY, ModerationController)).toBe('moderator');
  });

  it('approuve un profil complet et écrit le journal via le gestionnaire de la transaction', async () => {
    const result = await service.approveProfile(moderator, target.id, 'Profil vérifié');

    expect(result).toMatchObject({ userId: target.id, status: ProfileStatus.Approved });
    expect(transactionManager[Profile.name].save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ProfileStatus.Approved, reviewedAt: expect.any(Date) }),
    );
    expect(transactionManager[ModerationAction.name].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        moderatorId: moderator.id,
        targetUserId: target.id,
        targetEventId: null,
        action: ModerationActionType.ApproveProfile,
        reason: 'Profil vérifié',
      }),
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('refuse un modérateur cible sans changer le profil ni ajouter de journal', async () => {
    const otherModerator = Object.assign(new User(), {
      ...target,
      id: 'another-moderator',
      role: UserRole.Moderator,
    });
    transactionManager[User.name].findOne.mockImplementation(async ({ where }) =>
      where.id === moderator.id ? moderator : otherModerator,
    );

    await expect(service.blockProfile(moderator, otherModerator.id, 'Motif obligatoire')).rejects.toMatchObject({
      response: { statusCode: 403, code: 'CANNOT_MODERATE_MODERATOR' },
    });
    expect(transactionManager[Profile.name].save).not.toHaveBeenCalled();
    expect(transactionManager[ModerationAction.name].insert).not.toHaveBeenCalled();
  });

  it('bloque un profil et trace le motif obligatoire', async () => {
    const result = await service.blockProfile(moderator, target.id, 'Profil signalé');

    expect(result.status).toBe(ProfileStatus.Blocked);
    expect(transactionManager[ModerationAction.name].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ModerationActionType.BlockProfile,
        targetUserId: target.id,
        reason: 'Profil signalé',
      }),
    );
  });

  it('débloque un profil complet vers approved et trace l’action', async () => {
    profile.status = ProfileStatus.Blocked;

    const result = await service.unblockProfile(moderator, target.id, 'Examen terminé');

    expect(result.status).toBe(ProfileStatus.Approved);
    expect(transactionManager[ModerationAction.name].insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: ModerationActionType.UnblockProfile, targetUserId: target.id }),
    );
  });

  it('suspend le compte et invalide les sessions dans la même transaction que l’audit', async () => {
    const result = await service.suspendAccount(moderator, target.id, 'Compte signalé');

    expect(result.status).toBe(AccountStatus.Suspended);
    expect(target.sessionVersion).toBe(5);
    expect(target.suspendedAt).toBeInstanceOf(Date);
    expect(transactionManager[ModerationAction.name].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ModerationActionType.SuspendAccount,
        targetUserId: target.id,
        reason: 'Compte signalé',
      }),
    );
  });

  it('réactive un compte suspendu sans réutiliser sa version de session précédente', async () => {
    target.status = AccountStatus.Suspended;
    target.suspendedAt = new Date('2026-10-10T10:00:00Z');
    target.sessionVersion = 5;

    const result = await service.reactivateAccount(moderator, target.id);

    expect(result.status).toBe(AccountStatus.Active);
    expect(target.suspendedAt).toBeNull();
    expect(target.sessionVersion).toBe(5);
    expect(transactionManager[ModerationAction.name].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ModerationActionType.ReactivateAccount,
        targetUserId: target.id,
      }),
    );
  });

  it('délègue l’annulation d’un événement à EventsService et renvoie l’état à jour', async () => {
    const event = Object.assign(new Event(), {
      id: 'event-id',
      organizerId: target.id,
      interestId: 1,
      interest: { id: 1, slug: 'jardinage', label: 'Jardinage' },
      title: 'Sortie jardinage',
      status: EventStatus.Cancelled,
      startsAt: new Date('2027-01-01T10:00:00Z'),
      endsAt: new Date('2027-01-01T12:00:00Z'),
      capacity: 10,
    });
    eventsRepository.findOneOrFail.mockResolvedValue(event);

    const result = await service.cancelEvent(moderator, event.id, 'Événement signalé');

    expect(eventsService.cancelByModerator).toHaveBeenCalledWith(moderator.id, event.id, 'Événement signalé');
    expect(result).toMatchObject({ id: event.id, status: EventStatus.Cancelled });
  });
});
