import { ApiProperty } from '@nestjs/swagger';
import { Interest } from './interest.entity';

export class InterestDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'walking' })
  slug: string;

  @ApiProperty({ example: 'Marche et randonnée' })
  label: string;

  static fromEntity(interest: Interest): InterestDto {
    return { id: interest.id, slug: interest.slug, label: interest.label };
  }
}
