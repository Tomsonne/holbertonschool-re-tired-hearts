import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AppException } from '../common/app.exception';
import { Interest } from '../interests/interest.entity';
import { User, UserRole } from '../users/user.entity';
import { OwnProfileDto, ProfileInputDto } from './profile.dto';
import { ProfileInterest } from './profile-interest.entity';
import { Profile, ProfileStatus } from './profile.entity';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    @InjectRepository(ProfileInterest)
    private readonly profileInterests: Repository<ProfileInterest>,
  ) {}

  async getOwn(user: User): Promise<OwnProfileDto> {
    const profile = await this.profiles.findOneBy({ userId: user.id });
    if (!profile) {
      throw this.notFound();
    }
    return this.toOwnProfile(user, profile, await this.loadInterests(user.id));
  }

  async updateOwn(user: User, input: ProfileInputDto): Promise<OwnProfileDto> {
    return this.dataSource.transaction(async (manager) => {
      const profiles = manager.getRepository(Profile);
      const profile = await profiles.findOne({
        where: { userId: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) {
        throw this.notFound();
      }
      // R-STATUS-2 : un profil bloqué est en lecture seule.
      if (profile.status === ProfileStatus.Blocked) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'PROFILE_BLOCKED',
          'Ce profil est bloqué : il ne peut plus être modifié.',
        );
      }
      // La base refuse un profil approuvé sans localisation (R-PROF-2).
      if (profile.status === ProfileStatus.Approved && !input.location) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          'Certaines informations sont manquantes ou invalides.',
          [{ field: 'location', messages: ['la localisation est requise pour un profil approuvé'] }],
        );
      }

      const interests = await this.resolveInterests(manager.getRepository(Interest), input.interestIds);

      profile.displayName = input.displayName;
      profile.bio = input.bio ? input.bio : null;
      profile.lookingFor = input.lookingFor;
      profile.discoverable = input.discoverable;
      profile.allowMessages = input.allowMessages;
      profile.cityName = input.location?.cityName ?? null;
      profile.departmentCode = input.location?.departmentCode ?? null;
      profile.postalCode = input.location?.postalCode ?? null;
      profile.cityCode = input.location?.cityCode ?? null;
      profile.locationVerified = input.location?.verified ?? false;
      await profiles.save(profile);

      const links = manager.getRepository(ProfileInterest);
      await links.delete({ profileId: user.id });
      if (interests.length > 0) {
        await links.insert(interests.map((interest) => ({ profileId: user.id, interestId: interest.id })));
      }
      return this.toOwnProfile(user, profile, interests);
    });
  }

  private async resolveInterests(repository: Repository<Interest>, ids: number[]): Promise<Interest[]> {
    if (ids.length === 0) {
      return [];
    }
    const found = await repository.find({ where: { id: In(ids) }, order: { label: 'ASC' } });
    if (found.length !== ids.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Certaines informations sont manquantes ou invalides.',
        [{ field: 'interestIds', messages: ['un centre d’intérêt est inconnu'] }],
      );
    }
    return found;
  }

  private async loadInterests(userId: string): Promise<Interest[]> {
    const links = await this.profileInterests.find({
      where: { profileId: userId },
      relations: { interest: true },
    });
    return links.map((link) => link.interest).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }

  private toOwnProfile(user: User, profile: Profile, interests: Interest[]): OwnProfileDto {
    const hasLocation = profile.cityName !== null && profile.departmentCode !== null;
    const missingForApproval: string[] = [];
    if (!profile.displayName?.trim()) {
      missingForApproval.push('displayName');
    }
    if (!hasLocation) {
      missingForApproval.push('location');
    }
    if (interests.length === 0) {
      missingForApproval.push('interests');
    }
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      bio: profile.bio,
      lookingFor: profile.lookingFor,
      interests: interests.map(({ id, slug, label }) => ({ id, slug, label })),
      location: hasLocation
        ? {
            cityName: profile.cityName as string,
            departmentCode: profile.departmentCode as string,
            postalCode: profile.postalCode,
            cityCode: profile.cityCode,
            verified: profile.locationVerified,
          }
        : null,
      isOrganizer: user.role === UserRole.Organizer,
      acceptsMessages: profile.allowMessages,
      memberSince: user.createdAt.toISOString().slice(0, 7),
      discoverable: profile.discoverable,
      allowMessages: profile.allowMessages,
      status: profile.status,
      isComplete: missingForApproval.length === 0,
      missingForApproval,
    };
  }

  private notFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', "Nous n'avons pas trouvé ce profil.");
  }
}
