import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from 'src/common/constants';
import { MESSAGES } from 'src/common/messages';

export class ResetPasswordDto {
  @IsString({ message: MESSAGES.VALIDATION.TOKEN_REQUIRED })
  @IsNotEmpty({ message: MESSAGES.VALIDATION.TOKEN_REQUIRED })
  token!: string;

  @IsString({ message: MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: MESSAGES.VALIDATION.NEW_PASSWORD_MIN_LENGTH(PASSWORD_MIN_LENGTH),
  })
  newPassword!: string;
}
