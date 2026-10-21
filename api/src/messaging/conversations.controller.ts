import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { CurrentUser, RequireAccess } from '../auth/auth.decorators';
import { AccountThrottlerGuard } from '../common/account-throttler.guard';
import { User } from '../users/user.entity';
import { CreateConversationDto } from './create-conversation.dto';
import { ConversationParticipantGuard } from './conversation-participant.guard';
import { ConversationsService } from './conversations.service';
import { MessageQueryDto, SendMessageDto } from './message.dto';

// R-MSG-8 : 30 envois par compte et par tranche de 10 minutes (429 TOO_MANY_REQUESTS).
export const SEND_MESSAGE_LIMIT = 30;
export const SEND_MESSAGE_WINDOW_MS = 600_000;

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

  // Le quota passe avant le contrôle de participation : chaque tentative compte, sinon
  // un envoi refusé en boucle échapperait à la limite. Le compteur suit le compte
  // connecté, donc un refus n'apprend rien à son auteur sur la conversation visée.
  @Post(':id/messages')
  @RequireAccess('active')
  @UseGuards(AccountThrottlerGuard, ConversationParticipantGuard)
  @Throttle({ default: { limit: SEND_MESSAGE_LIMIT, ttl: SEND_MESSAGE_WINDOW_MS } })
  send(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SendMessageDto,
  ) {
    return this.conversations.send(user.id, id, input.body);
  }
}
