import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProfileInterest } from './profile-interest.entity';
import { Profile } from './profile.entity';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

@Module({
  imports: [TypeOrmModule.forFeature([Profile, ProfileInterest]), AuthModule],
  controllers: [ProfilesController, DiscoveryController],
  providers: [ProfilesService, DiscoveryService],
})
export class ProfilesModule {}
