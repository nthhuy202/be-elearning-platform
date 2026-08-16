import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  SORT_ORDERS,
  type SortOrder,
} from 'src/common/dto/pagination-query.dto';
import { PaymentStatus } from 'generated/prisma/enums';

export const PAYMENT_STATUSES = Object.values(PaymentStatus);

export class QueryPaymentDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: PaymentStatus;

  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder = 'desc';
}
