import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { MESSAGES } from 'src/common/messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';
import { QueryEnrollmentDto } from './dto/query-enrollment.dto';

@Controller('enrollments')
@UseGuards(JwtAuthGuard)
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  @ResponseMessage(MESSAGES.ENROLLMENT.CREATE_SUCCESS)
  create(
    @Body() dto: CreateEnrollmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enrollmentsService.create(user.id, dto);
  }

  @Get('me')
  @ResponseMessage(MESSAGES.ENROLLMENT.LIST_SUCCESS)
  findMine(
    @Query() query: QueryEnrollmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enrollmentsService.findMine(user.id, query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.ENROLLMENT.DELETE_SUCCESS)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enrollmentsService.remove(id, user);
  }
}
