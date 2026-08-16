import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  PaginationQueryDto,
  SORT_ORDERS,
  type SortOrder,
} from 'src/common/dto/pagination-query.dto';

export const LESSON_SORT_FIELDS = ['orderIndex', 'createdAt', 'title'] as const;

export type LessonSortField = (typeof LESSON_SORT_FIELDS)[number];

export class QueryLessonDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(LESSON_SORT_FIELDS)
  sortBy?: LessonSortField = 'orderIndex';

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder = 'asc';
}
