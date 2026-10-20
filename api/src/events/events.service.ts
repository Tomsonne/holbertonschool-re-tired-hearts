import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { AppException } from '../common/app.exception';
import { Interest } from '../interests/interest.entity';
import { ModerationAction, ModerationActionType } from '../moderation/moderation-action.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { EventRegistration, RegistrationStatus } from './event-registration.entity';
import { Event, EventStatus } from './event.entity';
import { EventFiltersDto } from './event-filters.dto';
import { EventInputDto, UpdateEventDto } from './event-input.dto';
import { lockEvent } from './lock-event';

@Injectable()
export class EventsService {
  constructor(private readonly db: DataSource) {}

  private async actor(manager: EntityManager, userId: string): Promise<{ user: User; profile: Profile }> {
    const user = await manager.findOneBy(User, { id: userId });
    if (!user || user.status !== AccountStatus.Active) {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'Ce compte ne peut pas utiliser cette fonctionnalité.');
    }
    const profile = await manager.findOneBy(Profile, { userId });
    if (!profile || profile.status === ProfileStatus.Blocked) {
      throw new AppException(HttpStatus.FORBIDDEN, 'PROFILE_BLOCKED', 'Ce profil ne peut pas utiliser cette fonctionnalité.');
    }
    return { user, profile };
  }

  private requireOrganizer(actor: { user: User; profile: Profile }): void {
    if (actor.profile.status !== ProfileStatus.Approved) {
      throw new AppException(HttpStatus.FORBIDDEN, 'PROFILE_NOT_APPROVED', 'Votre profil doit être approuvé pour organiser une sortie.');
    }
    if (actor.user.role !== UserRole.Organizer) {
      throw new AppException(HttpStatus.FORBIDDEN, 'ROLE_REQUIRED', 'Seul un organisateur peut créer ou gérer ses sorties.');
    }
  }

  private requireOwner(event: Event, actor: { user: User; profile: Profile }): void {
    this.requireOrganizer(actor);
    if (event.organizerId !== actor.user.id) {
      throw new AppException(HttpStatus.FORBIDDEN, 'NOT_EVENT_OWNER', "Vous ne pouvez pas modifier la sortie d'un autre organisateur.");
    }
  }

  private async validateInterest(manager: EntityManager, interestId: number): Promise<void> {
    if (!(await manager.existsBy(Interest, { id: interestId }))) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', "Ce centre d'intérêt n'existe pas.");
    }
  }

  private validateDates(input: EventInputDto): void {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'La fin de la sortie doit suivre son début.');
    }
  }

  private assignInput(event: Event, input: EventInputDto): void {
    event.title = input.title.trim();
    event.description = input.description.trim();
    event.interestId = input.interestId;
    event.startsAt = new Date(input.startsAt);
    event.endsAt = new Date(input.endsAt);
    event.cityName = input.location.cityName.trim();
    event.departmentCode = input.location.departmentCode.trim();
    event.postalCode = input.location.postalCode;
    event.cityCode = input.location.cityCode ?? null;
    event.locationVerified = input.location.verified;
    event.areaHint = input.areaHint?.trim() || null;
    event.exactAddress = input.exactAddress.trim();
    event.capacity = input.capacity;
  }

  async create(actorId: string, input: EventInputDto): Promise<Event> {
    this.validateDates(input);
    return this.db.transaction(async (manager) => {
      const actor = await this.actor(manager, actorId);
      this.requireOrganizer(actor);
      await this.validateInterest(manager, input.interestId);
      const event = manager.create(Event, { organizerId: actorId, status: EventStatus.Draft });
      this.assignInput(event, input);
      return manager.save(event);
    });
  }

  async findVisible(actorId: string, id: string): Promise<Event> {
    const actor = await this.actor(this.db.manager, actorId);
    const event = await this.db.manager.findOneBy(Event, { id });
    if (!event) {
      throw new AppException(HttpStatus.NOT_FOUND, 'EVENT_NOT_FOUND', "Cette sortie n'est pas disponible.");
    }
    const privileged = event.organizerId === actorId || actor.user.role === UserRole.Moderator;
    if (event.status === EventStatus.Published || privileged) return event;
    const registration = await this.db.manager.findOneBy(EventRegistration, {
      eventId: id,
      userId: actorId,
      status: RegistrationStatus.Registered,
    });
    if (!registration || event.status === EventStatus.Draft) {
      throw new AppException(HttpStatus.NOT_FOUND, 'EVENT_NOT_FOUND', "Cette sortie n'est pas disponible.");
    }
    return event;
  }

  private canSeePrivateInfo(event: Event, user: User, registration: EventRegistration | null): boolean {
    return event.organizerId === user.id || user.role === UserRole.Moderator ||
      registration?.status === RegistrationStatus.Registered;
  }

  async listPublished(actorId: string, filters: EventFiltersDto) {
    await this.actor(this.db.manager, actorId);
    const page = filters.page ?? 1;
    const pageSize = 12;
    const requestedFrom = filters.from ? new Date(filters.from) : new Date();
    const from = requestedFrom > new Date() ? requestedFrom : new Date();
    const query = this.db.manager.createQueryBuilder(Event, 'event')
      .where('event.status = :status', { status: EventStatus.Published })
      .andWhere('event.starts_at > :from', { from });
    if (filters.interestId !== undefined) {
      query.andWhere('event.interest_id = :interestId', { interestId: filters.interestId });
    }
    if (filters.cityName) {
      const accented = 'àáâäãåçèéêëìíîïñòóôöõùúûüÿ';
      const plain = 'aaaaaaceeeeiiiinooooouuuuy';
      query.andWhere('TRANSLATE(LOWER(event.city_name), :accented, :plain) = :cityName', {
        accented,
        plain,
        cityName: filters.cityName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
      });
    }
    if (filters.cityCode) {
      query.andWhere('event.city_code = :cityCode', { cityCode: filters.cityCode });
    }
    if (filters.departmentCode) {
      query.andWhere('event.department_code = :departmentCode', { departmentCode: filters.departmentCode });
    }
    const [events, total] = await query.orderBy('event.starts_at', 'ASC')
      .addOrderBy('event.id', 'ASC').skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    if (events.length === 0) return { items: [], page, pageSize, total };

    const eventIds = events.map((event) => event.id);
    const organizerIds = [...new Set(events.map((event) => event.organizerId))];
    const interestIds = [...new Set(events.map((event) => event.interestId))];
    const [interests, organizers, profiles, registrations, counts] = await Promise.all([
      this.db.manager.findBy(Interest, { id: In(interestIds) }),
      this.db.manager.findBy(User, { id: In(organizerIds) }),
      this.db.manager.findBy(Profile, { userId: In(organizerIds) }),
      this.db.manager.findBy(EventRegistration, { eventId: In(eventIds), userId: actorId }),
      this.db.manager.createQueryBuilder(EventRegistration, 'registration')
        .select('registration.event_id', 'eventId')
        .addSelect('COUNT(*)', 'registeredCount')
        .where('registration.event_id IN (:...eventIds)', { eventIds })
        .andWhere('registration.status = :status', { status: RegistrationStatus.Registered })
        .groupBy('registration.event_id')
        .getRawMany<{ eventId: string; registeredCount: string }>(),
    ]);
    const interestById = new Map(interests.map((interest) => [interest.id, interest]));
    const organizerById = new Map(organizers.map((organizer) => [organizer.id, organizer]));
    const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));
    const registrationByEventId = new Map(registrations.map((registration) => [registration.eventId, registration]));
    const countByEventId = new Map(counts.map((row) => [row.eventId, Number(row.registeredCount)]));

    const items = events.map((event) => {
      const interest = interestById.get(event.interestId)!;
      const organizer = organizerById.get(event.organizerId)!;
      const organizerProfile = profileById.get(event.organizerId);
      const registeredCount = countByEventId.get(event.id) ?? 0;
      return {
        id: event.id,
        title: event.title,
        interest: { id: interest.id, slug: interest.slug, label: interest.label },
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        location: { cityName: event.cityName, departmentCode: event.departmentCode },
        status: event.status,
        isPast: false,
        capacity: event.capacity,
        availablePlaces: Math.max(0, event.capacity - registeredCount),
        organizer: {
          userId: organizer.id,
          displayName: organizer.status === AccountStatus.Active && organizerProfile?.status === ProfileStatus.Approved
            ? organizerProfile.displayName : 'Membre indisponible',
          isOrganizer: true,
        },
        myRegistration: registrationByEventId.get(event.id)?.status ?? null,
      };
    });
    return { items, page, pageSize, total };
  }

  // Projection explicite : aucune adresse privée ni code postal dans une réponse générale.
  async detail(actorId: string, id: string) {
    const event = await this.findVisible(actorId, id);
    const actor = await this.actor(this.db.manager, actorId);
    const interest = await this.db.manager.findOneByOrFail(Interest, { id: event.interestId });
    const organizer = await this.db.manager.findOneByOrFail(User, { id: event.organizerId });
    const organizerProfile = await this.db.manager.findOneBy(Profile, { userId: event.organizerId });
    const registeredCount = await this.db.manager.countBy(EventRegistration, {
      eventId: id,
      status: RegistrationStatus.Registered,
    });
    const myRegistration = await this.db.manager.findOneBy(EventRegistration, { eventId: id, userId: actorId });
    const isOrganizer = event.organizerId === actorId;
    const canSeeAddress = this.canSeePrivateInfo(event, actor.user, myRegistration);
    const availablePlaces = Math.max(0, event.capacity - registeredCount);
    const isFuture = event.startsAt > new Date();
    const canRegister = actor.profile.status === ProfileStatus.Approved &&
      event.status === EventStatus.Published && isFuture && !isOrganizer && availablePlaces > 0 &&
      myRegistration?.status !== RegistrationStatus.Registered;
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      interest: { id: interest.id, slug: interest.slug, label: interest.label },
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      location: { cityName: event.cityName, departmentCode: event.departmentCode },
      areaHint: event.areaHint,
      exactAddress: canSeeAddress ? event.exactAddress : null,
      capacity: event.capacity,
      availablePlaces,
      status: event.status,
      isPast: !isFuture,
      cancellationReason: event.cancellationReason,
      organizer: {
        userId: organizer.id,
        displayName: organizer.status === AccountStatus.Active && organizerProfile?.status === ProfileStatus.Approved
          ? organizerProfile.displayName : 'Membre indisponible',
        isOrganizer: true,
      },
      myRegistration: myRegistration?.status ?? null,
      canRegister,
      registrationBlockedReason: canRegister ? null :
        (isOrganizer ? 'Vous organisez cette sortie.' :
          event.status !== EventStatus.Published || !isFuture ? 'Cette sortie ne prend plus d’inscriptions.' :
            availablePlaces === 0 ? 'Cette sortie est complète.' :
              actor.profile.status !== ProfileStatus.Approved ? 'Votre profil doit être approuvé.' :
                myRegistration?.status === RegistrationStatus.Registered ? 'Vous êtes déjà inscrit.' : null),
      isOrganizer,
    };
  }

  async participants(actorId: string, id: string) {
    const event = await this.findVisible(actorId, id);
    const actor = await this.actor(this.db.manager, actorId);
    const registration = await this.db.manager.findOneBy(EventRegistration, { eventId: id, userId: actorId });
    if (!this.canSeePrivateInfo(event, actor.user, registration)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', "L'accès à la liste des participants n'est pas autorisé.");
    }

    const rows = await this.db.manager.createQueryBuilder(EventRegistration, 'registration')
      .innerJoin(User, 'participant', 'participant.id = registration.user_id')
      .innerJoin(Profile, 'profile', 'profile.user_id = participant.id')
      .select('participant.id', 'userId')
      .addSelect('profile.display_name', 'displayName')
      .where('registration.event_id = :eventId', { eventId: id })
      .andWhere('registration.status = :registered', { registered: RegistrationStatus.Registered })
      .andWhere('participant.status = :active', { active: AccountStatus.Active })
      .andWhere('profile.status = :approved', { approved: ProfileStatus.Approved })
      .orderBy('profile.display_name', 'ASC')
      .addOrderBy('participant.id', 'ASC')
      .getRawMany<{ userId: string; displayName: string }>();
    return rows.map(({ userId, displayName }) => ({
      userId,
      displayName,
      isOrganizer: userId === event.organizerId,
    }));
  }

  async update(actorId: string, id: string, input: UpdateEventDto): Promise<Event> {
    return this.db.transaction(async (manager) => {
      const actor = await this.actor(manager, actorId);
      const event = await lockEvent(manager, id);
      this.requireOwner(event, actor);
      if (event.status !== EventStatus.Draft && (event.status !== EventStatus.Published || event.startsAt <= new Date())) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_NOT_EDITABLE', "Cette sortie ne peut plus être modifiée.");
      }
      const merged: EventInputDto = {
        title: input.title ?? event.title,
        description: input.description ?? event.description,
        interestId: input.interestId ?? event.interestId,
        startsAt: input.startsAt ?? event.startsAt.toISOString(),
        endsAt: input.endsAt ?? event.endsAt.toISOString(),
        location: input.location ?? {
          cityName: event.cityName,
          postalCode: event.postalCode,
          departmentCode: event.departmentCode,
          cityCode: event.cityCode,
          verified: event.locationVerified,
        },
        areaHint: input.areaHint === undefined ? event.areaHint : input.areaHint,
        exactAddress: input.exactAddress ?? event.exactAddress,
        capacity: input.capacity ?? event.capacity,
      };
      this.validateDates(merged);
      if (event.status === EventStatus.Published && new Date(merged.startsAt) <= new Date()) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_IN_PAST', 'Une sortie publiée doit rester à venir.');
      }
      const count = await manager.countBy(EventRegistration, { eventId: id, status: RegistrationStatus.Registered });
      if (merged.capacity < count) {
        throw new AppException(HttpStatus.CONFLICT, 'CAPACITY_BELOW_REGISTRATIONS', 'La capacité ne peut pas être inférieure au nombre de participants inscrits.');
      }
      if (event.status === EventStatus.Published && count > 0 && (
        new Date(merged.startsAt).getTime() !== event.startsAt.getTime() ||
        new Date(merged.endsAt).getTime() !== event.endsAt.getTime() ||
        merged.interestId !== event.interestId ||
        merged.location.cityName.trim() !== event.cityName ||
        merged.location.departmentCode.trim() !== event.departmentCode ||
        merged.location.postalCode !== event.postalCode ||
        (merged.location.cityCode ?? null) !== event.cityCode ||
        (merged.areaHint?.trim() || null) !== event.areaHint ||
        merged.exactAddress.trim() !== event.exactAddress
      )) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_HAS_REGISTRATIONS',
          'La date, le lieu et le centre d’intérêt ne peuvent plus changer après une inscription.');
      }
      await this.validateInterest(manager, merged.interestId);
      this.assignInput(event, merged);
      return manager.save(event);
    });
  }

  async publish(actorId: string, id: string): Promise<Event> {
    return this.db.transaction(async (manager) => {
      const actor = await this.actor(manager, actorId);
      const event = await lockEvent(manager, id);
      this.requireOwner(event, actor);
      if (event.status !== EventStatus.Draft) {
        throw new AppException(HttpStatus.CONFLICT, 'INVALID_EVENT_TRANSITION', "Cette sortie n'est plus un brouillon.");
      }
      if (event.startsAt <= new Date()) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_IN_PAST', 'Une sortie passée ne peut pas être publiée.');
      }
      event.status = EventStatus.Published;
      event.publishedAt = new Date();
      return manager.save(event);
    });
  }

  async cancel(actorId: string, id: string, reason: string): Promise<Event> {
    return this.cancelInternal(actorId, id, reason, false);
  }

  // La route de modération de la tâche 4 utilisera cette méthode, qui écrit l'audit atomiquement.
  async cancelByModerator(actorId: string, id: string, reason: string): Promise<Event> {
    return this.cancelInternal(actorId, id, reason, true);
  }

  private async cancelInternal(actorId: string, id: string, reason: string, moderatorAction: boolean): Promise<Event> {
    const cleanReason = reason?.trim();
    if (!cleanReason || cleanReason.length < 5 || cleanReason.length > 300) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Indiquez un motif de 5 à 300 caractères.');
    }
    return this.db.transaction(async (manager) => {
      const actor = await this.actor(manager, actorId);
      const event = await lockEvent(manager, id);
      if (moderatorAction) {
        if (actor.user.role !== UserRole.Moderator) {
          throw new AppException(HttpStatus.FORBIDDEN, 'ROLE_REQUIRED', 'Seul un modérateur peut effectuer cette action.');
        }
      } else {
        this.requireOwner(event, actor);
      }
      if (event.status !== EventStatus.Published) {
        throw new AppException(HttpStatus.CONFLICT, 'INVALID_EVENT_TRANSITION', "Cette sortie ne peut pas être annulée.");
      }
      event.status = EventStatus.Cancelled;
      event.cancelledAt = new Date();
      event.cancellationReason = cleanReason;
      const saved = await manager.save(event);
      if (moderatorAction) {
        await manager.insert(ModerationAction, {
          moderatorId: actorId,
          action: ModerationActionType.CancelEvent,
          targetEventId: id,
          reason: cleanReason,
        });
      }
      return saved;
    });
  }

  async complete(actorId: string, id: string): Promise<Event> {
    return this.db.transaction(async (manager) => {
      const actor = await this.actor(manager, actorId);
      const event = await lockEvent(manager, id);
      this.requireOwner(event, actor);
      if (event.status !== EventStatus.Published) {
        throw new AppException(HttpStatus.CONFLICT, 'INVALID_EVENT_TRANSITION', "Cette sortie ne peut pas être clôturée.");
      }
      if (event.endsAt > new Date()) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_NOT_FINISHED', 'Attendez la fin de la sortie pour la clôturer.');
      }
      event.status = EventStatus.Completed;
      event.completedAt = new Date();
      return manager.save(event);
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.db.transaction(async (manager) => {
      const actor = await this.actor(manager, actorId);
      const event = await lockEvent(manager, id);
      this.requireOwner(event, actor);
      const registrations = await manager.countBy(EventRegistration, { eventId: id });
      if (event.status !== EventStatus.Draft || registrations > 0) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_NOT_DELETABLE', 'Seul un brouillon sans inscription peut être supprimé.');
      }
      await manager.remove(event);
    });
  }
}
