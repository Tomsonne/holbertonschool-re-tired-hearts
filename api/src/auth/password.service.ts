import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  // Dépense le même temps qu'une vraie vérification quand le compte n'existe pas,
  // pour que le délai de réponse ne révèle pas quels e-mails sont inscrits (R-AUTH-5).
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('mot-de-passe-factice-non-utilisable');
    await verify(await this.dummyHash, password);
  }
}
