import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { VnpayService } from './vnpay.service';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, VnpayService],
})
export class PaymentsModule {}
