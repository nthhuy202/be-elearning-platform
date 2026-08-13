import { IsEmail, IsString } from 'class-validator';
import { MESSAGES } from 'src/common/messages';

export class LoginDto {
  @IsEmail({}, { message: MESSAGES.VALIDATION.EMAIL_INVALID })
  email!: string;

  @IsString({ message: MESSAGES.VALIDATION.PASSWORD_INVALID })
  password!: string;
}
