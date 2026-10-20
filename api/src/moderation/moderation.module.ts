import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { Event } from '../events/event.entity';
import { EventRegistration } from '../events/event-registration.entity';
import { Interest } from '../interests/interest.entity';
import { ProfileInterest } from '../profiles/profile-interest.entity';
import { Profile } from '../profiles/profile.entity';
import { User } from '../users/user.entity';
import { ModerationAction } from './moderation-action.entity';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Profile,
      ProfileInterest,
      Event,
      EventRegistration,
      Interest,
      ModerationAction,
    ]),
    AuthModule,
    EventsModule,
  ],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
