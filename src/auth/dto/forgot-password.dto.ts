import { IsEmail } from 'class-validator';
import { MESSAGES } from 'src/common/messages';

export class ForgotPasswordDto {
  @IsEmail({}, { message: MESSAGES.VALIDATION.EMAIL_INVALID })
  email!: string;
}
