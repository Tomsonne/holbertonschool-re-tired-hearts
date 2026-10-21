import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource, Repository } from 'typeorm';
import { ACCESS_LEVEL_KEY } from '../../src/auth/auth.decorators';
import { AppException } from '../../src/common/app.exception';
import { validationExceptionFactory } from '../../src/common/validation';
import { Interest } from '../../src/interests/interest.entity';
import { ProfileInputDto } from '../../src/profiles/profile.dto';
import { ProfileInterest } from '../../src/profiles/profile-interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { ProfilesController } from '../../src/profiles/profiles.controller';
import { ProfilesService } from '../../src/profiles/profiles.service';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});
const metadata: ArgumentMetadata = { type: 'body', metatype: ProfileInputDto };

const validInput = {
  displayName: 'Camille',
  bio: 'Bonjour',
  lookingFor: ['friendship'],
  interestIds: [1, 2],
  location: { cityName: 'Villeurbanne', postalCode: '69100', departmentCode: '69', cityCode: '69266', verified: true },
  discoverable: true,
  allowMessages: true,
};

const user = Object.assign(new User(), {
  id: 'user-1',
  role: UserRole.Member,
  status: AccountStatus.Active,
  createdAt: new Date('2026-10-05T10:00:00Z'),
});

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return Object.assign(new Profile(), {
    userId: 'user-1',
    displayName: 'Camille',
    bio: null,
    lookingFor: [],
    cityName: null,
    departmentCode: null,
    postalCode: null,
    cityCode: null,
    locationVerified: false,
    discoverable: true,
    allowMessages: true,
    status: ProfileStatus.Pending,
    ...overrides,
  });
}

describe('Issue #5 — consultation et édition de son propre profil', () => {
  describe('DTO ProfileInput', () => {
    it.each(['role', 'status', 'email'])('refuse le champ %s en 400', async (field) => {
      const error = await pipe.transform({ ...validInput, [field]: 'x' }, metadata).catch((e) => e);
      expect(error).toBeInstanceOf(AppException);
      expect(error.getStatus()).toBe(400);
      expect(JSON.stringify(error.getResponse())).toContain(field);
    });

    it('refuse un champ inconnu dans la localisation', async () => {
      const error = await pipe
        .transform({ ...validInput, location: { ...validInput.location, lat: 1 } }, metadata)
        .catch((e) => e);
      expect(error).toBeInstanceOf(AppException);
    });

    it('accepte une localisation sans code postal (absent ou null), mais pas une chaîne vide', async () => {
      const { postalCode: _absent, ...sansCodePostal } = validInput.location;
      await expect(pipe.transform({ ...validInput, location: sansCodePostal }, metadata)).resolves.toBeDefined();
      await expect(
        pipe.transform({ ...validInput, location: { ...validInput.location, postalCode: null } }, metadata),
      ).resolves.toBeDefined();
      const vide = await pipe
        .transform({ ...validInput, location: { ...validInput.location, postalCode: '' } }, metadata)
        .catch((e) => e);
      expect(vide).toBeInstanceOf(AppException);
    });

    it('accepte une entrée valide et une localisation nulle', async () => {
      await expect(pipe.transform(validInput, metadata)).resolves.toBeInstanceOf(ProfileInputDto);
      await expect(pipe.transform({ ...validInput, location: null, bio: null }, metadata)).resolves.toBeDefined();
    });

    it.each([
      ['nom trop court', { displayName: 'a' }],
      ['nom trop long', { displayName: 'a'.repeat(41) }],
      ['bio trop longue', { bio: 'a'.repeat(501) }],
      ['recherche inconnue', { lookingFor: ['marriage'] }],
      ['plus de 10 centres d’intérêt', { interestIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
      ['centres d’intérêt en double', { interestIds: [1, 1] }],
      ['code postal invalide', { location: { ...validInput.location, postalCode: '6910' } }],
      ['discoverable absent', { discoverable: undefined }],
      ['location en tableau', { location: [] }],
      ['location en chaîne', { location: 'Lyon' }],
      ['location en nombre', { location: 69 }],
    ])('refuse : %s', async (_label, patch) => {
      const error = await pipe.transform({ ...validInput, ...patch }, metadata).catch((e) => e);
      expect(error).toBeInstanceOf(AppException);
      expect(error.getStatus()).toBe(400);
    });
  });

  describe('ProfilesController', () => {
    it('protège GET et PUT par le niveau « active »', () => {
      const reflector = new Reflector();
      for (const method of [ProfilesController.prototype.getOwn, ProfilesController.prototype.updateOwn]) {
        expect(reflector.get(ACCESS_LEVEL_KEY, method)).toBe('active');
      }
    });
  });

  describe('ProfilesService', () => {
    const profileRepository = { findOneBy: jest.fn() };
    const linkRepository = { find: jest.fn() };
    const txProfiles = { findOne: jest.fn(), save: jest.fn() };
    const txLinks = { delete: jest.fn(), insert: jest.fn() };
    const txInterests = { find: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => Promise<unknown>) =>
        cb({
          getRepository: (entity: unknown) =>
            entity === Profile ? txProfiles : entity === ProfileInterest ? txLinks : txInterests,
        }),
      ),
    };
    let service: ProfilesService;

    const interests = [
      Object.assign(new Interest(), { id: 1, slug: 'cuisine', label: 'Cuisine' }),
      Object.assign(new Interest(), { id: 2, slug: 'jardinage', label: 'Jardinage' }),
    ];

    beforeEach(() => {
      jest.clearAllMocks();
      txProfiles.save.mockImplementation(async (p) => p);
      service = new ProfilesService(
        dataSource as unknown as DataSource,
        profileRepository as unknown as Repository<Profile>,
        linkRepository as unknown as Repository<ProfileInterest>,
      );
    });

    it('GET : indique ce qui manque pour être approuvé', async () => {
      profileRepository.findOneBy.mockResolvedValue(makeProfile());
      linkRepository.find.mockResolvedValue([]);
      const own = await service.getOwn(user);
      expect(own.isComplete).toBe(false);
      expect(own.missingForApproval).toEqual(['location', 'interests']);
      expect(own.status).toBe('pending');
      expect(own.memberSince).toBe('2026-10');
    });

    it('GET : profil complet → missingForApproval vide et localisation privée', async () => {
      profileRepository.findOneBy.mockResolvedValue(
        makeProfile({ cityName: 'Lyon', departmentCode: '69', postalCode: '69001', cityCode: '69123', locationVerified: true }),
      );
      linkRepository.find.mockResolvedValue([{ interest: interests[0] }]);
      const own = await service.getOwn(user);
      expect(own.isComplete).toBe(true);
      expect(own.missingForApproval).toEqual([]);
      expect(own.location).toEqual({
        cityName: 'Lyon',
        departmentCode: '69',
        postalCode: '69001',
        cityCode: '69123',
        verified: true,
      });
    });

    it('GET : un profil bloqué reste consultable', async () => {
      profileRepository.findOneBy.mockResolvedValue(makeProfile({ status: ProfileStatus.Blocked }));
      linkRepository.find.mockResolvedValue([]);
      await expect(service.getOwn(user)).resolves.toMatchObject({ status: 'blocked' });
    });

    it('PUT : enregistre le profil, remplace les centres d’intérêt et ne touche pas au statut', async () => {
      txProfiles.findOne.mockResolvedValue(makeProfile());
      txInterests.find.mockResolvedValue(interests);
      const own = await service.updateOwn(user, validInput as unknown as ProfileInputDto);
      expect(txProfiles.save).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Camille', cityName: 'Villeurbanne', status: ProfileStatus.Pending }),
      );
      expect(txLinks.delete).toHaveBeenCalledWith({ profileId: 'user-1' });
      expect(txLinks.insert).toHaveBeenCalledWith([
        { profileId: 'user-1', interestId: 1 },
        { profileId: 'user-1', interestId: 2 },
      ]);
      expect(own.isComplete).toBe(true);
      expect(own.status).toBe('pending');
    });

    it('PUT : un profil bloqué est en lecture seule (403 PROFILE_BLOCKED)', async () => {
      txProfiles.findOne.mockResolvedValue(makeProfile({ status: ProfileStatus.Blocked }));
      const error = await service.updateOwn(user, validInput as unknown as ProfileInputDto).catch((e) => e);
      expect(error.getStatus()).toBe(403);
      expect(error.getResponse()).toMatchObject({ code: 'PROFILE_BLOCKED' });
      expect(txProfiles.save).not.toHaveBeenCalled();
      expect(txLinks.delete).not.toHaveBeenCalled();
    });

    it('PUT : centre d’intérêt inconnu → 400', async () => {
      txProfiles.findOne.mockResolvedValue(makeProfile());
      txInterests.find.mockResolvedValue([interests[0]]);
      const error = await service.updateOwn(user, validInput as unknown as ProfileInputDto).catch((e) => e);
      expect(error.getStatus()).toBe(400);
      expect(txProfiles.save).not.toHaveBeenCalled();
    });

    it('PUT : un profil approuvé ne peut pas retirer sa localisation (400)', async () => {
      txProfiles.findOne.mockResolvedValue(makeProfile({ status: ProfileStatus.Approved, cityName: 'Lyon', departmentCode: '69' }));
      const error = await service
        .updateOwn(user, { ...validInput, location: null } as unknown as ProfileInputDto)
        .catch((e) => e);
      expect(error.getStatus()).toBe(400);
      expect(txProfiles.save).not.toHaveBeenCalled();
    });

    it('PUT : les champs facultatifs peuvent être vidés', async () => {
      txProfiles.findOne.mockResolvedValue(makeProfile({ bio: 'ancienne', cityName: 'Lyon', departmentCode: '69' }));
      const own = await service.updateOwn(user, {
        ...validInput,
        bio: null,
        location: null,
        interestIds: [],
      } as unknown as ProfileInputDto);
      expect(txProfiles.save).toHaveBeenCalledWith(expect.objectContaining({ bio: null, cityName: null, postalCode: null }));
      expect(txLinks.insert).not.toHaveBeenCalled();
      expect(own.location).toBeNull();
    });
  });
});
