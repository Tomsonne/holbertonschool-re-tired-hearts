import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireAccess } from '../auth/auth.decorators';
import { User } from '../users/user.entity';
import { OwnProfileDto, ProfileInputDto } from './profile.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profils')
@Controller('me/profile')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @RequireAccess('active')
  @ApiOkResponse({ type: OwnProfileDto })
  getOwn(@CurrentUser() user: User): Promise<OwnProfileDto> {
    return this.profilesService.getOwn(user);
  }

  @Put()
  @RequireAccess('active')
  @ApiOkResponse({ type: OwnProfileDto })
  updateOwn(@CurrentUser() user: User, @Body() input: ProfileInputDto): Promise<OwnProfileDto> {
    return this.profilesService.updateOwn(user, input);
  }
}
