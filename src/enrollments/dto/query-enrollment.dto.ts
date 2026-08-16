import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  SORT_ORDERS,
  type SortOrder,
} from 'src/common/dto/pagination-query.dto';

export class QueryEnrollmentDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder = 'desc';
}
