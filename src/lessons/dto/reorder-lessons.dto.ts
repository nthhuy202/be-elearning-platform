import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { MESSAGES } from 'src/common/messages';

export class ReorderLessonItemDto {
  @IsUUID()
  id!: string;

  @IsInt({ message: MESSAGES.VALIDATION.ORDER_INDEX_INVALID })
  @Min(0, { message: MESSAGES.VALIDATION.ORDER_INDEX_INVALID })
  orderIndex!: number;
}

export class ReorderLessonsDto {
  @IsArray()
  @ArrayMinSize(1, { message: MESSAGES.VALIDATION.REORDER_ITEMS_REQUIRED })
  @ValidateNested({ each: true })
  @Type(() => ReorderLessonItemDto)
  items!: ReorderLessonItemDto[];
}
