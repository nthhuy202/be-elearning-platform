import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Ip,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { MESSAGES } from 'src/common/messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { SkipTransform } from 'src/common/decorators/skip-transform.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ResponseMessage(MESSAGES.PAYMENT.CREATE_SUCCESS)
  create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.paymentsService.create(user.id, dto, ipAddress);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage(MESSAGES.PAYMENT.LIST_SUCCESS)
  findMine(
    @Query() query: QueryPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.findMine(user.id, query);
  }

  @Get('vnpay/ipn')
  @SkipTransform()
  handleVnpayIpn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayIpn(query);
  }

  @Get('vnpay/return')
  @ResponseMessage(MESSAGES.PAYMENT.RETURN_SUCCESS)
  handleVnpayReturn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayReturn(query);
  }
}
