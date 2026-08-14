import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { EnrollmentsService } from './enrollments.service';
import { ProgressService } from './progress.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'generated/prisma/enums';
import { MESSAGES } from 'src/common/messages';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { QueryEnrollmentDto } from './dto/query-enrollment.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';

@Controller('courses/:courseId/enrollments')
@UseGuards(JwtAuthGuard)
export class CourseEnrollmentsController {
  constructor(
    private readonly enrollmentsService: EnrollmentsService,
    private readonly progressService: ProgressService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ResponseMessage(MESSAGES.ENROLLMENT.LIST_SUCCESS)
  findByCourse(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: QueryEnrollmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enrollmentsService.findByCourse(courseId, query, user);
  }

  @Get('me')
  @ResponseMessage(MESSAGES.ENROLLMENT.PROGRESS_DETAIL_SUCCESS)
  findMyProgress(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progressService.getCourseProgress(courseId, user.id);
  }
}
