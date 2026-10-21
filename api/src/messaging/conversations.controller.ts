import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser, RequireAccess } from '../auth/auth.decorators';
import { User } from '../users/user.entity';
import { CreateConversationDto } from './create-conversation.dto';
import { ConversationParticipantGuard } from './conversation-participant.guard';
import { ConversationsService } from './conversations.service';
import { MessageQueryDto, SendMessageDto } from './message.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @RequireAccess('approved')
  @HttpCode(201)
  async start(
    @CurrentUser() user: User,
    @Body() input: CreateConversationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.conversations.start(user.id, input.recipientId, input.eventId);
    response.status(result.created ? 201 : 200);
    return result.conversation;
  }

  @Get()
  @RequireAccess('active')
  list(@CurrentUser() user: User) {
    return this.conversations.list(user.id);
  }

  @Get(':id')
  @RequireAccess('active')
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.detail(user.id, id);
  }

  @Get(':id/messages')
  @RequireAccess('active')
  messages(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MessageQueryDto,
  ) {
    return this.conversations.messages(user.id, id, query.before, query.limit);
  }

  @Post(':id/messages')
  @RequireAccess('active')
  @UseGuards(ConversationParticipantGuard)
  send(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SendMessageDto,
  ) {
    return this.conversations.send(user.id, id, input.body);
  }
}
