import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { ACCESS_LEVEL_KEY } from '../../src/auth/auth.decorators';
import { AppException } from '../../src/common/app.exception';
import { validationExceptionFactory } from '../../src/common/validation';
import { DiscoveryController } from '../../src/profiles/discovery.controller';
import { DISCOVERY_PAGE_SIZE, DiscoveryService } from '../../src/profiles/discovery.service';
import { DiscoveryQueryDto } from '../../src/profiles/profile.dto';
import { ProfileInterest } from '../../src/profiles/profile-interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});
const queryMetadata: ArgumentMetadata = { type: 'query', metatype: DiscoveryQueryDto };

const viewer = Object.assign(new User(), { id: 'viewer-1', role: UserRole.Member, status: AccountStatus.Active });
const OTHER_ID = '11111111-1111-4111-8111-111111111111';

function row(): Profile {
  const account = Object.assign(new User(), {
    id: OTHER_ID,
    email: 'secret@example.fr',
    passwordHash: 'hash',
    role: UserRole.Organizer,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  });
  return Object.assign(new Profile(), {
    userId: OTHER_ID,
    user: account,
    displayName: 'Alex',
    bio: 'Salut',
    lookingFor: ['friendship'],
    cityName: 'Lyon',
    departmentCode: '69',
    postalCode: '69001',
    cityCode: '69123',
    locationVerified: true,
    discoverable: true,
    allowMessages: false,
    status: ProfileStatus.Approved,
  });
}

function makeBuilder(result: { many?: [Profile[], number]; one?: Profile | null; links?: unknown[] }) {
  const wheres: string[] = [];
  const params: Record<string, unknown> = {};
  const builder: Record<string, jest.Mock> = {};
  const chain = ['innerJoinAndSelect', 'orderBy', 'addOrderBy', 'skip', 'take'];
  chain.forEach((name) => (builder[name] = jest.fn(() => builder)));
  for (const name of ['where', 'andWhere']) {
    builder[name] = jest.fn((sql: string, p?: Record<string, unknown>) => {
      wheres.push(sql);
      Object.assign(params, p);
      return builder;
    });
  }
  builder.getManyAndCount = jest.fn(async () => result.many ?? [[], 0]);
  builder.getOne = jest.fn(async () => result.one ?? null);
  builder.getMany = jest.fn(async () => result.links ?? []);
  return { builder, wheres, params };
}

describe('Issue #6 — découverte des profils approuvés', () => {
  describe('ProfilesQuery DTO', () => {
    it('accepte les filtres et convertit les nombres', async () => {
      const query = await pipe.transform({ interestId: '3', departmentCode: '69', page: '2' }, queryMetadata);
      expect(query).toMatchObject({ interestId: 3, departmentCode: '69', page: 2 });
    });

    it.each([
      ['page nulle', { page: '0' }],
      ['interestId non numérique', { interestId: 'abc' }],
      ['département invalide', { departmentCode: "69'; DROP" }],
      ['paramètre inconnu', { status: 'blocked' }],
    ])('refuse : %s', async (_label, query) => {
      const error = await pipe.transform(query, queryMetadata).catch((e) => e);
      expect(error).toBeInstanceOf(AppException);
      expect(error.getStatus()).toBe(400);
    });
  });

  describe('DiscoveryController', () => {
    it('exige un profil approuvé sur les deux routes', () => {
      const reflector = new Reflector();
      expect(reflector.get(ACCESS_LEVEL_KEY, DiscoveryController.prototype.list)).toBe('approved');
      expect(reflector.get(ACCESS_LEVEL_KEY, DiscoveryController.prototype.getOne)).toBe('approved');
    });
  });

  describe('DiscoveryService.list', () => {
    function build(result: Parameters<typeof makeBuilder>[0]) {
      const profiles = makeBuilder(result);
      const links = makeBuilder(result);
      const service = new DiscoveryService(
        { createQueryBuilder: jest.fn(() => profiles.builder) } as unknown as Repository<Profile>,
        { createQueryBuilder: jest.fn(() => links.builder) } as unknown as Repository<ProfileInterest>,
      );
      return { service, profiles };
    }

    it('ne liste que approved + discoverable + compte active, hors visiteur', async () => {
      const { service, profiles } = build({ many: [[], 0] });
      await service.list(viewer, {});
      const sql = profiles.wheres.join(' | ');
      expect(sql).toContain('profile.status = :approved');
      expect(sql).toContain('account.status = :active');
      expect(sql).toContain('profile.discoverable = true');
      expect(sql).toContain('profile.user_id <> :viewerId');
      expect(profiles.params).toMatchObject({ approved: 'approved', active: 'active', viewerId: 'viewer-1' });
    });

    it('applique les filtres et la pagination', async () => {
      const { service, profiles } = build({ many: [[], 0] });
      const page = await service.list(viewer, { interestId: 4, departmentCode: '69', page: 3 });
      expect(profiles.params).toMatchObject({ interestId: 4, departmentCode: '69' });
      expect(profiles.builder.skip).toHaveBeenCalledWith(2 * DISCOVERY_PAGE_SIZE);
      expect(profiles.builder.take).toHaveBeenCalledWith(DISCOVERY_PAGE_SIZE);
      expect(page).toEqual({ items: [], page: 3, pageSize: DISCOVERY_PAGE_SIZE, total: 0 });
    });

    it('n’expose aucune donnée privée', async () => {
      const { service } = build({
        many: [[row()], 1],
        links: [{ profileId: OTHER_ID, interest: { id: 1, slug: 'cuisine', label: 'Cuisine' } }],
      });
      const page = await service.list(viewer, {});
      expect(page.items[0]).toEqual({
        userId: OTHER_ID,
        displayName: 'Alex',
        bio: 'Salut',
        lookingFor: ['friendship'],
        interests: [{ id: 1, slug: 'cuisine', label: 'Cuisine' }],
        location: { cityName: 'Lyon', departmentCode: '69' },
        isOrganizer: true,
        acceptsMessages: false,
        memberSince: '2026-09',
      });
      const json = JSON.stringify(page);
      for (const secret of ['secret@example.fr', '69001', '69123', 'hash', 'email', 'postalCode', 'cityCode']) {
        expect(json).not.toContain(secret);
      }
    });
  });

  describe('DiscoveryService.getOne', () => {
    it('renvoie le profil visible', async () => {
      const profiles = makeBuilder({ one: row() });
      const links = makeBuilder({});
      const service = new DiscoveryService(
        { createQueryBuilder: () => profiles.builder } as unknown as Repository<Profile>,
        { createQueryBuilder: () => links.builder } as unknown as Repository<ProfileInterest>,
      );
      await expect(service.getOne(viewer, OTHER_ID)).resolves.toMatchObject({ userId: OTHER_ID });
      expect(profiles.wheres.join(' | ')).toContain('profile.discoverable = true');
    });

    it('même 404 PROFILE_UNAVAILABLE pour inconnu, non visible ou identifiant invalide', async () => {
      const profiles = makeBuilder({ one: null });
      const service = new DiscoveryService(
        { createQueryBuilder: () => profiles.builder } as unknown as Repository<Profile>,
        { createQueryBuilder: jest.fn() } as unknown as Repository<ProfileInterest>,
      );
      const errors = await Promise.all(
        [OTHER_ID, 'pas-un-uuid', '1 OR 1=1'].map((id) => service.getOne(viewer, id).catch((e) => e)),
      );
      const bodies = errors.map((e) => JSON.stringify(e.getResponse()));
      expect(errors.every((e) => e.getStatus() === 404)).toBe(true);
      expect(new Set(bodies).size).toBe(1);
      expect(bodies[0]).toContain('PROFILE_UNAVAILABLE');
    });

    it('filtre le statut du profil, le statut du compte et le visiteur lui-même', async () => {
      const profiles = makeBuilder({ one: null });
      const service = new DiscoveryService(
        { createQueryBuilder: () => profiles.builder } as unknown as Repository<Profile>,
        { createQueryBuilder: jest.fn() } as unknown as Repository<ProfileInterest>,
      );
      await service.getOne(viewer, OTHER_ID).catch(() => undefined);
      const sql = profiles.wheres.join(' | ');
      expect(sql).toContain('profile.status = :approved');
      expect(sql).toContain('account.status = :active');
      expect(sql).toContain('profile.user_id <> :viewerId');
    });
  });
});
