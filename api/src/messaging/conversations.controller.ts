import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser, RequireAccess } from '../auth/auth.decorators';
import { User } from '../users/user.entity';
import { CreateConversationDto } from './create-conversation.dto';
import { ConversationsService } from './conversations.service';

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
}
