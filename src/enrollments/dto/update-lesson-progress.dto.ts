import { IsBoolean } from 'class-validator';
import { MESSAGES } from 'src/common/messages';

export class UpdateLessonProgressDto {
  @IsBoolean({ message: MESSAGES.VALIDATION.COMPLETED_INVALID })
  completed!: boolean;
}
