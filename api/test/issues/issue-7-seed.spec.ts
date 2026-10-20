import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { assertDemoSeedAllowed, DEMO_ACCOUNTS, seedDemoAccounts } from '../../src/database/seed';
import { Interest } from '../../src/interests/interest.entity';
import { ProfileInterest } from '../../src/profiles/profile-interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

describe('Issue #7 — comptes de démonstration', () => {
  const password = 'MotDePasseDemo2026!';

  function database() {
    const users = new Map<string, User>();
    const profiles: Profile[] = [];
    const links: Array<{ profileId: string; interestId: number }> = [];
    const interests = ['lecture', 'marche', 'cuisine', 'jeux-de-societe'].map((slug, index) =>
      Object.assign(new Interest(), { id: index + 1, slug }),
    );
    const manager = {
      find: jest.fn(async (entity: unknown) => entity === Interest ? interests : []),
      findOneBy: jest.fn(async (entity: unknown, where: { email: string }) =>
        entity === User ? users.get(where.email) ?? null : null),
      create: jest.fn((entity: new () => object, values: object) => Object.assign(new entity(), values)),
      save: jest.fn(async (entity: User | Profile) => {
        if (entity instanceof User) {
          entity.id = `demo-${users.size + 1}`;
          users.set(entity.email, entity);
        } else {
          profiles.push(entity);
        }
        return entity;
      }),
      insert: jest.fn(async (entity: unknown, values: { profileId: string; interestId: number }) => {
        if (entity === ProfileInterest) links.push(values);
      }),
    };
    const db = {
      transaction: jest.fn(async (callback: (entityManager: EntityManager) => Promise<string[]>) =>
        callback(manager as unknown as EntityManager)),
    } as unknown as DataSource;
    return { db, manager, users, profiles, links };
  }

  it('crée un modérateur, un organisateur et deux membres avec profils approuvés', async () => {
    const { db, users, profiles, links } = database();
    const created = await seedDemoAccounts(db, password);

    expect(created).toEqual(DEMO_ACCOUNTS.map((account) => account.email));
    expect([...users.values()].map((user) => user.role)).toEqual([
      UserRole.Moderator, UserRole.Organizer, UserRole.Member, UserRole.Member,
    ]);
    expect([...users.values()].every((user) => user.status === AccountStatus.Active &&
      user.passwordHash.startsWith('$argon2id$') && !user.passwordHash.includes(password))).toBe(true);
    expect(profiles).toHaveLength(4);
    expect(profiles.every((profile) => profile.status === ProfileStatus.Approved)).toBe(true);
    expect(links).toHaveLength(DEMO_ACCOUNTS.reduce((sum, account) => sum + account.interestSlugs.length, 0));
  });

  it('peut être rejoué sans créer de doublons', async () => {
    const { db, manager, users, profiles, links } = database();
    await seedDemoAccounts(db, password);
    const secondRun = await seedDemoAccounts(db, password);

    expect(secondRun).toEqual([]);
    expect(users.size).toBe(4);
    expect(profiles).toHaveLength(4);
    expect(links).toHaveLength(7);
    expect(manager.save).toHaveBeenCalledTimes(8);
  });

  it('refuse un compte existant dont le rôle ne correspond pas', async () => {
    const { db, users, profiles } = database();
    users.set(DEMO_ACCOUNTS[0].email, Object.assign(new User(), {
      email: DEMO_ACCOUNTS[0].email,
      role: UserRole.Member,
      status: AccountStatus.Active,
    }));

    await expect(seedDemoAccounts(db, password)).rejects.toThrow('déjà présent avec un autre rôle');
    expect(users.size).toBe(1);
    expect(profiles).toHaveLength(0);
  });

  it('refuse le seed en production sans autorisation explicite', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production' })).toThrow('ALLOW_DEMO_SEED=true');
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' })).not.toThrow();
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('refuse un mot de passe trop court et documente les identifiants fictifs', async () => {
    const { db } = database();
    await expect(seedDemoAccounts(db, 'court')).rejects.toThrow('DEMO_PASSWORD');
    const readme = readFileSync(join(__dirname, '../../../README.md'), 'utf8');
    expect(readme).toContain('npm run seed');
    expect(readme).toContain('ReTiredDemo2026!');
    expect(readme).toContain('DEMO_PASSWORD');
    for (const account of DEMO_ACCOUNTS) expect(readme).toContain(account.email);
  });
});
