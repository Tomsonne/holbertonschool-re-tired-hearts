import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CitiesController } from './cities.controller';
import { CitiesService } from './cities.service';

// AuthModule réexporte ThrottlerModule : le quota de recherche s'appuie sur la même
// configuration que les autres routes limitées.
@Module({ imports: [AuthModule], controllers: [CitiesController], providers: [CitiesService] })
export class CitiesModule {}
