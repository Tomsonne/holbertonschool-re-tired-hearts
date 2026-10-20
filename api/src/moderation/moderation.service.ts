import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AppException } from '../common/app.exception';
import { Event, EventStatus } from '../events/event.entity';
import { EventsService } from '../events/events.service';
import { EventRegistration, RegistrationStatus } from '../events/event-registration.entity';
import { Interest } from '../interests/interest.entity';
import { ProfileInterest } from '../profiles/profile-interest.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { ModerationAction, ModerationActionType } from './moderation-action.entity';
import {
  ModerationActionsQueryDto,
  ModerationEventsQueryDto,
  ModerationProfilesQueryDto,
  ModerationUsersQueryDto,
  Page,
} from './moderation.dto';

const PAGE_SIZE = 20;

type ModerationProfile = {
  userId: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  status: ProfileStatus;
  displayName: string;
  bio: string | null;
  lookingFor: Profile['lookingFor'];
  interests: { id: number; slug: string; label: string }[];
  location: {
    cityName: string | null;
    departmentCode: string | null;
    postalCode: string | null;
    cityCode: string | null;
    verified: boolean;
  };
  discoverable: boolean;
  allowMessages: boolean;
  reviewedAt: Date | null;
  createdAt: Date;
};

type ModerationUser = {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  profileStatus: ProfileStatus | null;
  displayName: string | null;
  createdAt: Date;
};

@Injectable()
export class ModerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventsService: EventsService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(ModerationAction) private readonly actions: Repository<ModerationAction>,
  ) {}

  async listProfiles(query: ModerationProfilesQueryDto): Promise<Page<ModerationProfile>> {
    const builder = this.profiles
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .leftJoinAndSelect('profile.profileInterests', 'profileInterest')
      .leftJoinAndSelect('profileInterest.interest', 'interest');
    if (query.status) {
      builder.andWhere('profile.status = :status', { status: query.status });
    }
    const [profiles, total] = await builder
      .orderBy('profile.createdAt', 'ASC')
      .skip((query.page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE)
      .getManyAndCount();
    return this.page(
      profiles.map((profile) => this.toModerationProfile(profile.user, profile)),
      query.page,
      total,
    );
  }

  async listUsers(query: ModerationUsersQueryDto): Promise<Page<ModerationUser>> {
    const builder = this.users
      .createQueryBuilder('user')
      .leftJoin(Profile, 'profile', 'profile.user_id = user.id');
    if (query.status) {
      builder.andWhere('user.status = :status', { status: query.status });
    }
    if (query.q) {
      builder.andWhere(
        "(user.email ILIKE :query ESCAPE '\\' OR profile.display_name ILIKE :query ESCAPE '\\')",
        { query: `%${this.escapeLike(query.q)}%` },
      );
    }
    const [users, total] = await builder
      .orderBy('user.createdAt', 'DESC')
      .skip((query.page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE)
      .getManyAndCount();
    const profiles = users.length
      ? await this.profiles.findBy({ userId: In(users.map((user) => user.id)) })
      : [];
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    return this.page(
      users.map((user) => {
        const profile = profileByUserId.get(user.id);
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          profileStatus: profile?.status ?? null,
          displayName: profile?.displayName ?? null,
          createdAt: user.createdAt,
        };
      }),
      query.page,
      total,
    );
  }

  async listEvents(query: ModerationEventsQueryDto): Promise<Page<Record<string, unknown>>> {
    const builder = this.events
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.interest', 'interest')
      .leftJoinAndSelect('event.organizer', 'organizer');
    if (query.status) {
      builder.andWhere('event.status = :status', { status: query.status });
    }
    const [events, total] = await builder
      .orderBy('event.startsAt', 'DESC')
      .skip((query.page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE)
      .getManyAndCount();
    const ids = events.map((event) => event.id);
    const organizerIds = [...new Set(events.map((event) => event.organizerId))];
    const [organizerProfiles, counts] = events.length
      ? await Promise.all([
          this.profiles.findBy({ userId: In(organizerIds) }),
          this.dataSource
            .getRepository(EventRegistration)
            .createQueryBuilder('registration')
            .select('registration.event_id', 'eventId')
            .addSelect('COUNT(*)', 'count')
            .where('registration.event_id IN (:...ids)', { ids })
            .andWhere('registration.status = :status', { status: RegistrationStatus.Registered })
            .groupBy('registration.event_id')
            .getRawMany<{ eventId: string; count: string }>(),
        ])
      : [[], []];
    const names = new Map(organizerProfiles.map((profile) => [profile.userId, profile.displayName]));
    const registered = new Map(counts.map((row) => [row.eventId, Number(row.count)]));
    const items = await Promise.all(
      events.map((event) =>
        this.toEventDto(event, false, undefined, {
          displayName: names.get(event.organizerId) ?? '',
          registrations: registered.get(event.id) ?? 0,
        }),
      ),
    );
    return this.page(items, query.page, total);
  }

  async listActions(query: ModerationActionsQueryDto): Promise<Page<Record<string, unknown>>> {
    const [actions, total] = await this.actions.findAndCount({
      relations: { moderator: true, targetUser: true, targetEvent: true },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return this.page(
      actions.map((entry) => ({
        id: entry.id,
        moderator: { id: entry.moderatorId, email: entry.moderator.email },
        action: entry.action,
        targetUser: entry.targetUser
          ? { id: entry.targetUser.id, email: entry.targetUser.email }
          : null,
        targetEvent: entry.targetEvent
          ? { id: entry.targetEvent.id, title: entry.targetEvent.title }
          : null,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
      query.page,
      total,
    );
  }

  async approveProfile(moderator: User, targetId: string, reason?: string): Promise<ModerationProfile> {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.lockModerator(manager, moderator.id);
      const target = await this.lockTargetUser(manager, targetId, actor.id);
      const profile = await this.lockProfile(manager, targetId);
      if (profile.status !== ProfileStatus.Pending) {
        throw this.invalidTransition('Ce profil ne peut pas être approuvé dans son état actuel.');
      }
      await this.assertProfileComplete(manager, profile);
      profile.status = ProfileStatus.Approved;
      profile.reviewedAt = new Date();
      await manager.getRepository(Profile).save(profile);
      await this.logAction(manager, actor.id, ModerationActionType.ApproveProfile, target.id, null, reason);
      return this.toModerationProfile(target, profile);
    });
  }

  async blockProfile(moderator: User, targetId: string, reason: string): Promise<ModerationProfile> {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.lockModerator(manager, moderator.id);
      const target = await this.lockTargetUser(manager, targetId, actor.id);
      const profile = await this.lockProfile(manager, targetId);
      if (![ProfileStatus.Pending, ProfileStatus.Approved].includes(profile.status)) {
        throw this.invalidTransition('Ce profil ne peut pas être bloqué dans son état actuel.');
      }
      profile.status = ProfileStatus.Blocked;
      profile.reviewedAt = new Date();
      await manager.getRepository(Profile).save(profile);
      await this.logAction(manager, actor.id, ModerationActionType.BlockProfile, target.id, null, reason);
      return this.toModerationProfile(target, profile);
    });
  }

  async unblockProfile(moderator: User, targetId: string, reason?: string): Promise<ModerationProfile> {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.lockModerator(manager, moderator.id);
      const target = await this.lockTargetUser(manager, targetId, actor.id);
      const profile = await this.lockProfile(manager, targetId);
      if (profile.status !== ProfileStatus.Blocked) {
        throw this.invalidTransition('Seul un profil bloqué peut être débloqué.');
      }
      await this.assertProfileComplete(manager, profile);
      profile.status = ProfileStatus.Approved;
      profile.reviewedAt = new Date();
      await manager.getRepository(Profile).save(profile);
      await this.logAction(manager, actor.id, ModerationActionType.UnblockProfile, target.id, null, reason);
      return this.toModerationProfile(target, profile);
    });
  }

  async suspendAccount(moderator: User, targetId: string, reason: string): Promise<ModerationUser> {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.lockModerator(manager, moderator.id);
      const target = await this.lockTargetUser(manager, targetId, actor.id);
      if (target.status !== AccountStatus.Active) {
        throw this.invalidTransition('Seul un compte actif peut être suspendu.');
      }
      target.status = AccountStatus.Suspended;
      target.suspendedAt = new Date();
      target.sessionVersion += 1;
      await manager.getRepository(User).save(target);
      await this.logAction(manager, actor.id, ModerationActionType.SuspendAccount, target.id, null, reason);
      return this.toModerationUser(target, await this.loadProfile(manager, target.id));
    });
  }

  async reactivateAccount(moderator: User, targetId: string, reason?: string): Promise<ModerationUser> {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.lockModerator(manager, moderator.id);
      const target = await this.lockTargetUser(manager, targetId, actor.id);
      if (target.status !== AccountStatus.Suspended) {
        throw this.invalidTransition('Seul un compte suspendu peut être réactivé.');
      }
      target.status = AccountStatus.Active;
      target.suspendedAt = null;
      await manager.getRepository(User).save(target);
      await this.logAction(manager, actor.id, ModerationActionType.ReactivateAccount, target.id, null, reason);
      return this.toModerationUser(target, await this.loadProfile(manager, target.id));
    });
  }

  async changeRole(
    moderator: User,
    targetId: string,
    role: UserRole.Member | UserRole.Organizer,
    reason?: string,
  ): Promise<ModerationUser> {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.lockModerator(manager, moderator.id);
      const target = await this.lockTargetUser(manager, targetId, actor.id);
      if (target.role === role) {
        throw this.invalidTransition('Ce compte possède déjà ce rôle.');
      }
      target.role = role;
      await manager.getRepository(User).save(target);
      const action =
        role === UserRole.Organizer
          ? ModerationActionType.GrantOrganizer
          : ModerationActionType.RevokeOrganizer;
      await this.logAction(manager, actor.id, action, target.id, null, reason);
      return this.toModerationUser(target, await this.loadProfile(manager, target.id));
    });
  }

  async cancelEvent(moderator: User, eventId: string, reason: string): Promise<Record<string, unknown>> {
    // Verrou, transition, motif et audit sont portés par EventsService (une seule règle d'annulation).
    await this.eventsService.cancelByModerator(moderator.id, eventId, reason);
    const event = await this.events.findOneOrFail({ where: { id: eventId }, relations: { interest: true } });
    return this.toEventDto(event, true);
  }

  private async lockModerator(manager: EntityManager, moderatorId: string): Promise<User> {
    const actor = await manager.getRepository(User).findOne({
      where: { id: moderatorId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!actor || actor.role !== UserRole.Moderator || actor.status !== AccountStatus.Active) {
      throw new AppException(HttpStatus.FORBIDDEN, 'ROLE_REQUIRED', 'Un compte modérateur actif est requis.');
    }
    return actor;
  }

  private async lockTargetUser(manager: EntityManager, targetId: string, moderatorId: string): Promise<User> {
    const target = await manager.getRepository(User).findOne({
      where: { id: targetId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!target) {
      throw this.notFound('USER_NOT_FOUND', "Nous n'avons pas trouvé ce compte.");
    }
    if (target.id === moderatorId || target.role === UserRole.Moderator) {
      throw this.cannotModerateModerator();
    }
    return target;
  }

  private async lockProfile(manager: EntityManager, userId: string): Promise<Profile> {
    const profile = await manager.getRepository(Profile).findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!profile) {
      throw this.notFound('PROFILE_NOT_FOUND', "Nous n'avons pas trouvé ce profil.");
    }
    profile.profileInterests = await manager.getRepository(ProfileInterest).find({
      where: { profileId: userId },
      relations: { interest: true },
    });
    return profile;
  }

  private async assertProfileComplete(manager: EntityManager, profile: Profile): Promise<void> {
    const complete =
      Boolean(profile.displayName?.trim()) &&
      Boolean(profile.cityName?.trim()) &&
      Boolean(profile.departmentCode?.trim()) &&
      (await manager.getRepository(ProfileInterest).countBy({ profileId: profile.userId })) > 0;
    if (!complete) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PROFILE_INCOMPLETE',
        'Ce profil doit comporter un nom, une ville, un département et un centre d’intérêt.',
      );
    }
  }

  private async loadProfile(manager: EntityManager, userId: string): Promise<Profile | null> {
    return manager.getRepository(Profile).findOneBy({ userId });
  }

  private async logAction(
    manager: EntityManager,
    moderatorId: string,
    action: ModerationActionType,
    targetUserId: string | null,
    targetEventId: string | null,
    reason?: string,
  ): Promise<void> {
    await manager.getRepository(ModerationAction).insert({
      moderatorId,
      action,
      targetUserId,
      targetEventId,
      reason: reason ?? null,
    });
  }

  private toModerationProfile(user: User, profile: Profile): ModerationProfile {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      accountStatus: user.status,
      status: profile.status,
      displayName: profile.displayName,
      bio: profile.bio,
      lookingFor: profile.lookingFor,
      interests: (profile.profileInterests ?? [])
        .map(({ interest }) => ({ id: interest.id, slug: interest.slug, label: interest.label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
      location: {
        cityName: profile.cityName,
        departmentCode: profile.departmentCode,
        postalCode: profile.postalCode,
        cityCode: profile.cityCode,
        verified: profile.locationVerified,
      },
      discoverable: profile.discoverable,
      allowMessages: profile.allowMessages,
      reviewedAt: profile.reviewedAt,
      createdAt: profile.createdAt,
    };
  }

  private toModerationUser(user: User, profile: Profile | null): ModerationUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      profileStatus: profile?.status ?? null,
      displayName: profile?.displayName ?? null,
      createdAt: user.createdAt,
    };
  }

  private async toEventDto(
    event: Event,
    includeDetails: boolean,
    manager?: EntityManager,
    preloaded?: { displayName: string; registrations: number },
  ): Promise<Record<string, unknown>> {
    let displayName = preloaded?.displayName;
    let registrations = preloaded?.registrations;
    if (!preloaded) {
      const profiles = manager?.getRepository(Profile) ?? this.profiles;
      const registrationsRepository = manager?.getRepository(EventRegistration) ??
        this.dataSource.getRepository(EventRegistration);
      displayName = (await profiles.findOneBy({ userId: event.organizerId }))?.displayName ?? '';
      registrations = await registrationsRepository.countBy({
        eventId: event.id,
        status: RegistrationStatus.Registered,
      });
    }
    const summary: Record<string, unknown> = {
      id: event.id,
      title: event.title,
      interest: event.interest
        ? { id: event.interest.id, slug: event.interest.slug, label: event.interest.label }
        : null,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: {
        cityName: event.cityName,
        departmentCode: event.departmentCode,
        postalCode: event.postalCode,
        cityCode: event.cityCode,
      },
      status: event.status,
      isPast: event.endsAt.getTime() < Date.now(),
      capacity: event.capacity,
      availablePlaces: Math.max(0, event.capacity - (registrations ?? 0)),
      organizer: {
        userId: event.organizerId,
        displayName: displayName ?? '',
        isOrganizer: true,
      },
      myRegistration: null,
    };
    if (includeDetails) {
      summary.description = event.description;
      summary.areaHint = event.areaHint;
      summary.exactAddress = event.exactAddress;
      summary.cancellationReason = event.cancellationReason;
    }
    return summary;
  }

  private page<T>(items: T[], page: number, total: number): Page<T> {
    return { items, page, pageSize: PAGE_SIZE, total };
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  private invalidTransition(message: string, code = 'INVALID_STATUS_TRANSITION'): AppException {
    return new AppException(HttpStatus.CONFLICT, code, message);
  }

  private cannotModerateModerator(): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      'CANNOT_MODERATE_MODERATOR',
      'Un modérateur ne peut pas se modérer lui-même ni modérer un autre modérateur.',
    );
  }

  private notFound(code: string, message: string): AppException {
    return new AppException(HttpStatus.NOT_FOUND, code, message);
  }
}
