import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { LoginDto, MeDto, RegisterDto } from './auth.dto';
import { PasswordService } from './password.service';

export interface AuthSession {
  me: MeDto;
  token: string;
}

export interface SessionTokenPayload {
  sub: string;
  sessionVersion: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(input: RegisterDto): Promise<AuthSession> {
    const passwordHash = await this.passwordService.hash(input.password);
    let me: MeDto;

    try {
      me = await this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(User);
        const profiles = manager.getRepository(Profile);
        const user = await users.save(
          users.create({
            email: input.email,
            passwordHash,
            role: UserRole.Member,
            status: AccountStatus.Active,
            sessionVersion: 0,
          }),
        );
        const profile = await profiles.save(
          profiles.create({
            userId: user.id,
            displayName: input.displayName,
            status: ProfileStatus.Pending,
          }),
        );
        return this.toMe(user, profile);
      });
    } catch (error) {
      if (this.isEmailConflict(error)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'EMAIL_ALREADY_USED',
          message: 'Cette adresse e-mail est déjà utilisée.',
        });
      }
      throw error;
    }

    return { me, token: await this.issueToken(me.id, 0) };
  }

  async login(input: LoginDto): Promise<AuthSession> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: input.email })
      .getOne();

    if (!user || !(await this.passwordService.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Adresse e-mail ou mot de passe incorrect.',
      });
    }

    if (user.status === AccountStatus.Suspended) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Ce compte est suspendu.',
      });
    }

    user.lastLoginAt = new Date();
    await this.users.save(user);
    const profile = await this.profiles.findOneBy({ userId: user.id });
    if (!profile) {
      throw new Error('Le profil associé au compte est introuvable.');
    }
    return {
      me: this.toMe(user, profile),
      token: await this.issueToken(user.id, user.sessionVersion),
    };
  }

  async getMe(user: User): Promise<MeDto> {
    const profile = await this.profiles.findOneBy({ userId: user.id });
    if (!profile) {
      throw new Error('Le profil associé au compte est introuvable.');
    }
    return this.toMe(user, profile);
  }

  private async issueToken(userId: string, sessionVersion: number): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, sessionVersion },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '2h',
        algorithm: 'HS256',
      },
    );
  }

  private toMe(user: User, profile: Profile): MeDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      accountStatus: user.status,
      profileStatus: profile.status,
      displayName: profile.displayName,
    };
  }

  private isEmailConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      driverError.code === '23505' &&
      'constraint' in driverError &&
      driverError.constraint === 'uq_users_email'
    );
  }
}
