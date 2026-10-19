import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/app.exception';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { DiscoveryQueryDto, ProfilePageDto, PublicProfileDto } from './profile.dto';
import { ProfileInterest } from './profile-interest.entity';
import { Profile, ProfileStatus } from './profile.entity';

export const DISCOVERY_PAGE_SIZE = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DiscoveryService {
  constructor(
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    @InjectRepository(ProfileInterest)
    private readonly profileInterests: Repository<ProfileInterest>,
  ) {}

  // R-PROF-3 : profils approuvés, découvrables, comptes actifs, hors visiteur.
  async list(viewer: User, query: DiscoveryQueryDto): Promise<ProfilePageDto> {
    const page = query.page ?? 1;
    const builder = this.visibleProfiles()
      .andWhere('profile.user_id <> :viewerId', { viewerId: viewer.id })
      .andWhere('profile.discoverable = true');

    if (query.departmentCode) {
      builder.andWhere('profile.department_code = :departmentCode', {
        departmentCode: query.departmentCode,
      });
    }
    if (query.interestId !== undefined) {
      builder.andWhere(
        'EXISTS (SELECT 1 FROM profile_interests pi WHERE pi.profile_id = profile.user_id AND pi.interest_id = :interestId)',
        { interestId: query.interestId },
      );
    }

    const [rows, total] = await builder
      .orderBy('profile.createdAt', 'DESC')
      .addOrderBy('profile.userId', 'ASC')
      .skip((page - 1) * DISCOVERY_PAGE_SIZE)
      .take(DISCOVERY_PAGE_SIZE)
      .getManyAndCount();

    const interests = await this.loadInterests(rows.map((row) => row.userId));
    return {
      items: rows.map((row) => this.toPublic(row, row.user, interests.get(row.userId) ?? [])),
      page,
      pageSize: DISCOVERY_PAGE_SIZE,
      total,
    };
  }

  // R-PROF-4 : tous les cas non autorisés renvoient exactement la même réponse.
  async getOne(viewer: User, userId: string): Promise<PublicProfileDto> {
    const unavailable = new AppException(
      HttpStatus.NOT_FOUND,
      'PROFILE_UNAVAILABLE',
      "Ce profil n'est pas disponible.",
    );
    if (!UUID_PATTERN.test(userId)) {
      throw unavailable;
    }
    const profile = await this.visibleProfiles()
      .andWhere('profile.user_id = :userId', { userId })
      .andWhere('profile.user_id <> :viewerId', { viewerId: viewer.id })
      .andWhere('profile.discoverable = true')
      .getOne();
    if (!profile) {
      throw unavailable;
    }
    const interests = await this.loadInterests([profile.userId]);
    return this.toPublic(profile, profile.user, interests.get(profile.userId) ?? []);
  }

  private visibleProfiles() {
    return this.profiles
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.user', 'account')
      .where('profile.status = :approved', { approved: ProfileStatus.Approved })
      .andWhere('account.status = :active', { active: AccountStatus.Active })
      .andWhere('profile.city_name IS NOT NULL');
  }

  private async loadInterests(userIds: string[]): Promise<Map<string, PublicProfileDto['interests']>> {
    const result = new Map<string, PublicProfileDto['interests']>();
    if (userIds.length === 0) {
      return result;
    }
    const links = await this.profileInterests
      .createQueryBuilder('link')
      .innerJoinAndSelect('link.interest', 'interest')
      .where('link.profile_id IN (:...userIds)', { userIds })
      .orderBy('interest.label', 'ASC')
      .getMany();
    for (const link of links) {
      const list = result.get(link.profileId) ?? [];
      list.push({ id: link.interest.id, slug: link.interest.slug, label: link.interest.label });
      result.set(link.profileId, list);
    }
    return result;
  }

  // Liste blanche explicite : aucune donnée privée ne peut fuiter par spread.
  private toPublic(profile: Profile, user: User, interests: PublicProfileDto['interests']): PublicProfileDto {
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      bio: profile.bio,
      lookingFor: profile.lookingFor,
      interests,
      location: {
        cityName: profile.cityName as string,
        departmentCode: profile.departmentCode as string,
      },
      isOrganizer: user.role === UserRole.Organizer,
      acceptsMessages: profile.allowMessages,
      memberSince: user.createdAt.toISOString().slice(0, 7),
    };
  }
}
