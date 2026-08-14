import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { CoursesModule } from 'src/courses/courses.module';
import { EnrollmentsModule } from 'src/enrollments/enrollments.module';

@Module({
  imports: [CoursesModule, EnrollmentsModule],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
