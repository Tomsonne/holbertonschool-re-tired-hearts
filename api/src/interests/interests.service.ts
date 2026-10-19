import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterestDto } from './interest.dto';
import { Interest } from './interest.entity';

@Injectable()
export class InterestsService {
  constructor(
    @InjectRepository(Interest)
    private readonly interests: Repository<Interest>,
  ) {}

  async findAll(): Promise<InterestDto[]> {
    const interests = await this.interests.find({ order: { label: 'ASC' } });
    return interests.map(InterestDto.fromEntity);
  }
}
