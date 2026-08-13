import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { PASSWORD_MIN_LENGTH } from 'src/common/constants';
import { MESSAGES } from 'src/common/messages';

export class CreateUsersDto {
  @IsEmail({}, { message: MESSAGES.VALIDATION.EMAIL_INVALID })
  email!: string;

  @IsString({ message: MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH(PASSWORD_MIN_LENGTH),
  })
  password!: string;

  @IsString({ message: MESSAGES.VALIDATION.FULL_NAME_REQUIRED })
  @IsNotEmpty({ message: MESSAGES.VALIDATION.FULL_NAME_REQUIRED })
  fullName!: string;

  @IsOptional()
  @IsString({ message: MESSAGES.VALIDATION.PHONE_INVALID })
  phone?: string;
}
