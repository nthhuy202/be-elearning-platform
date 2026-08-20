import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { VnpayService } from './vnpay.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    VnpayService,
    makeCounterProvider({
      name: 'payment_events_total',
      help: 'Sự kiện thanh toán theo kết quả',
      labelNames: ['provider', 'result'],
    }),
  ],
})
export class PaymentsModule {}
