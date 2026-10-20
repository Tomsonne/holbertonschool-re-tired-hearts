import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireAccess } from '../auth/auth.decorators';
import { User } from '../users/user.entity';
import {
  CancelEventDto,
  ChangeUserRoleDto,
  ModerationActionsQueryDto,
  ModerationEventsQueryDto,
  ModerationProfilesQueryDto,
  ModerationReasonDto,
  ModerationUsersQueryDto,
  RequiredModerationReasonDto,
} from './moderation.dto';
import { ModerationService } from './moderation.service';

@ApiTags('modération')
@Controller('moderation')
@RequireAccess('moderator')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('profiles')
  @ApiOkResponse()
  listProfiles(@Query() query: ModerationProfilesQueryDto) {
    return this.moderationService.listProfiles(query);
  }

  @Post('profiles/:userId/approve')
  @HttpCode(200)
  approveProfile(
    @CurrentUser() moderator: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: ModerationReasonDto,
  ) {
    return this.moderationService.approveProfile(moderator, userId, input.reason);
  }

  @Post('profiles/:userId/block')
  @HttpCode(200)
  blockProfile(
    @CurrentUser() moderator: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: RequiredModerationReasonDto,
  ) {
    return this.moderationService.blockProfile(moderator, userId, input.reason);
  }

  @Post('profiles/:userId/unblock')
  @HttpCode(200)
  unblockProfile(
    @CurrentUser() moderator: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: ModerationReasonDto,
  ) {
    return this.moderationService.unblockProfile(moderator, userId, input.reason);
  }

  @Get('users')
  listUsers(@Query() query: ModerationUsersQueryDto) {
    return this.moderationService.listUsers(query);
  }

  @Post('users/:userId/suspend')
  @HttpCode(200)
  suspendAccount(
    @CurrentUser() moderator: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: RequiredModerationReasonDto,
  ) {
    return this.moderationService.suspendAccount(moderator, userId, input.reason);
  }

  @Post('users/:userId/reactivate')
  @HttpCode(200)
  reactivateAccount(
    @CurrentUser() moderator: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: ModerationReasonDto,
  ) {
    return this.moderationService.reactivateAccount(moderator, userId, input.reason);
  }

  @Put('users/:userId/role')
  changeRole(
    @CurrentUser() moderator: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: ChangeUserRoleDto,
  ) {
    return this.moderationService.changeRole(moderator, userId, input.role, input.reason);
  }

  @Get('events')
  listEvents(@Query() query: ModerationEventsQueryDto) {
    return this.moderationService.listEvents(query);
  }

  @Post('events/:id/cancel')
  @HttpCode(200)
  cancelEvent(
    @CurrentUser() moderator: User,
    @Param('id', ParseUUIDPipe) eventId: string,
    @Body() input: CancelEventDto,
  ) {
    return this.moderationService.cancelEvent(moderator, eventId, input.reason);
  }

  @Get('actions')
  listActions(@Query() query: ModerationActionsQueryDto) {
    return this.moderationService.listActions(query);
  }
}
