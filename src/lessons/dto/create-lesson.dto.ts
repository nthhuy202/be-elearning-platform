import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { LESSON_TITLE_MAX_LENGTH } from 'src/common/constants';
import { MESSAGES } from 'src/common/messages';

export class CreateLessonDto {
  @IsString({ message: MESSAGES.VALIDATION.TITLE_REQUIRED })
  @IsNotEmpty({ message: MESSAGES.VALIDATION.TITLE_REQUIRED })
  @MaxLength(LESSON_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString({ message: MESSAGES.VALIDATION.CONTENT_INVALID })
  content?: string;

  @IsOptional()
  @IsInt({ message: MESSAGES.VALIDATION.ORDER_INDEX_INVALID })
  @Min(0, { message: MESSAGES.VALIDATION.ORDER_INDEX_INVALID })
  orderIndex?: number;
}
