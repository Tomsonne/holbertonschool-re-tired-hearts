import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser, RequireAccess } from '../auth/auth.decorators';
import { User } from '../users/user.entity';
import { DiscoveryService } from './discovery.service';
import { DiscoveryQueryDto, ProfilePageDto, PublicProfileDto } from './profile.dto';

@ApiTags('découverte des profils')
@Controller('profiles')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get()
  @RequireAccess('approved')
  @ApiOkResponse({ type: ProfilePageDto })
  list(@CurrentUser() viewer: User, @Query() query: DiscoveryQueryDto): Promise<ProfilePageDto> {
    return this.discoveryService.list(viewer, query);
  }

  @Get(':userId')
  @RequireAccess('approved')
  @ApiOkResponse({ type: PublicProfileDto })
  getOne(@CurrentUser() viewer: User, @Param('userId') userId: string): Promise<PublicProfileDto> {
    return this.discoveryService.getOne(viewer, userId);
  }
}
