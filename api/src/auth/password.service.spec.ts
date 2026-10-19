import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('haché en Argon2id et vérifie un mot de passe sans le restituer', async () => {
    const password = 'mot-de-passe-long-123';
    const passwordHash = await service.hash(password);

    expect(passwordHash).not.toBe(password);
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'un-autre-mot-de-passe')).resolves.toBe(false);
  });
});
