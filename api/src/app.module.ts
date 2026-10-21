import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.config';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { InterestsModule } from './interests/interests.module';
import { AuthModule } from './auth/auth.module';
import { ProfilesModule } from './profiles/profiles.module';
import { MessagingModule } from './messaging/messaging.module';
import { ModerationModule } from './moderation/moderation.module';
import { CitiesModule } from './cities/cities.module';

@Module({
  imports: [
    // Les variables déjà présentes dans l'environnement (Docker, tests) priment sur les fichiers .env.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'], validate: validateEnv }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(process.env) }),
    HealthModule,
    InterestsModule,
    AuthModule,
    ProfilesModule,
    EventsModule,
    MessagingModule,
    ModerationModule,
    CitiesModule,
  ],
})
export class AppModule {}
