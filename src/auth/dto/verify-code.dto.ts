import { IsString, Length, Matches } from 'class-validator';
import { VERIFICATION_CODE_LENGTH } from 'src/common/constants';
import { MESSAGES } from 'src/common/messages';

export class VerifyCodeDto {
  @IsString({ message: MESSAGES.VALIDATION.VERIFICATION_CODE_INVALID })
  @Length(VERIFICATION_CODE_LENGTH, VERIFICATION_CODE_LENGTH, {
    message: MESSAGES.VALIDATION.VERIFICATION_CODE_INVALID,
  })
  @Matches(/^\d+$/, {
    message: MESSAGES.VALIDATION.VERIFICATION_CODE_INVALID,
  })
  code!: string;
}
