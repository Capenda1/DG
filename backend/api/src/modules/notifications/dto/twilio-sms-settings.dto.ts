import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class TwilioSmsSettingsUpdateDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  accountSid?: string;

  @IsOptional()
  @IsString()
  authToken?: string;

  @IsOptional()
  @IsString()
  smsFrom?: string;

  @IsOptional()
  @IsString()
  messageTemplate?: string;

  @IsOptional()
  @IsString()
  oneWayFooter?: string;

  @IsOptional()
  @IsIn(['manual', 'automatic'])
  sendMode?: 'manual' | 'automatic';
}
