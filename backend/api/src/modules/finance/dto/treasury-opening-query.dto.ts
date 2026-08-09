import { IsDateString } from 'class-validator';

export class TreasuryOpeningQueryDto {
  @IsDateString()
  date!: string;
}
