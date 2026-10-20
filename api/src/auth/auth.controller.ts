import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { LoginDto, MeDto, RegisterDto } from './auth.dto';
import { CurrentUser, Public, RequireAccess } from './auth.decorators';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const SESSION_COOKIE = 'rth_session';

@ApiTags('comptes et sessions')
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('auth/register')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiCreatedResponse({ type: MeDto })
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeDto> {
    const session = await this.authService.register(input);
    this.setCookie(response, session.token);
    return session.me;
  }

  @Post('auth/login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOkResponse({ type: MeDto })
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeDto> {
    const session = await this.authService.login(input);
    this.setCookie(response, session.token);
    return session.me;
  }

  @Post('auth/logout')
  @RequireAccess('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @RequireAccess('session')
  @ApiOkResponse({ type: MeDto })
  getMe(@CurrentUser() user: User): Promise<MeDto> {
    return this.authService.getMe(user);
  }

  private setCookie(response: Response, token: string): void {
    response.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: SESSION_TTL_MS,
    });
  }

  private cookieOptions(): {
    httpOnly: true;
    sameSite: 'strict';
    secure: boolean;
    path: string;
  } {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      path: '/api',
    };
  }
}
