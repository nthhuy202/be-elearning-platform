import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'generated/prisma/enums';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { MESSAGES } from 'src/common/messages';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';
import { QueryLessonDto } from './dto/query-lesson.dto';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto';
import { UpdateLessonProgressDto } from 'src/enrollments/dto/update-lesson-progress.dto';
import { ProgressService } from 'src/enrollments/progress.service';

@Controller('courses/:courseId/lessons')
export class LessonsController {
  constructor(
    private readonly lessonsService: LessonsService,
    private readonly progressService: ProgressService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ResponseMessage(MESSAGES.LESSON.CREATE_SUCCESS)
  create(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonsService.create(courseId, dto, user);
  }

  @Get()
  @ResponseMessage(MESSAGES.LESSON.LIST_SUCCESS)
  findAll(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: QueryLessonDto,
  ) {
    return this.lessonsService.findAll(courseId, query);
  }

  @Patch('reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ResponseMessage(MESSAGES.LESSON.REORDER_SUCCESS)
  reorder(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: ReorderLessonsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonsService.reorder(courseId, dto, user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage(MESSAGES.LESSON.DETAIL_SUCCESS)
  findOne(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonsService.findOne(courseId, id, user);
  }

  @Patch(':id/progress')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage(MESSAGES.ENROLLMENT.PROGRESS_UPDATE_SUCCESS)
  updateProgress(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progressService.setLessonProgress(courseId, id, user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @ResponseMessage(MESSAGES.LESSON.UPDATE_SUCCESS)
  update(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonsService.update(courseId, id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.LESSON.DELETE_SUCCESS)
  remove(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonsService.remove(courseId, id, user);
  }
}
