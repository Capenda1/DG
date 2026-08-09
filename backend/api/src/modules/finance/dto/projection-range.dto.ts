import { IsDateString } from 'class-validator';

export class ProjectionRangeDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
