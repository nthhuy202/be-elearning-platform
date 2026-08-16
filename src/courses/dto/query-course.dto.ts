import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  PaginationQueryDto,
  SORT_ORDERS,
  type SortOrder,
} from 'src/common/dto/pagination-query.dto';
import { MESSAGES } from 'src/common/messages';

export const COURSE_SORT_FIELDS = ['createdAt', 'price', 'title'] as const;

export type CourseSortField = (typeof COURSE_SORT_FIELDS)[number];

export class QueryCourseDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: MESSAGES.VALIDATION.PRICE_INVALID })
  @Min(0, { message: MESSAGES.VALIDATION.PRICE_INVALID })
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: MESSAGES.VALIDATION.PRICE_INVALID })
  @Min(0, { message: MESSAGES.VALIDATION.PRICE_INVALID })
  maxPrice?: number;

  @IsOptional()
  @IsIn(COURSE_SORT_FIELDS)
  sortBy?: CourseSortField = 'createdAt';

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder = 'desc';
}
