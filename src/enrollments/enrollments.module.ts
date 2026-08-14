import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsController } from './enrollments.controller';
import { CoursesModule } from 'src/courses/courses.module';
import { CourseEnrollmentsController } from './course-enrollments.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [CoursesModule],
  controllers: [EnrollmentsController, CourseEnrollmentsController],
  providers: [EnrollmentsService, ProgressService],
  exports: [EnrollmentsService, ProgressService],
})
export class EnrollmentsModule {}
