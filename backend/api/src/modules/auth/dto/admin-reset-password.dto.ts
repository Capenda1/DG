import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
