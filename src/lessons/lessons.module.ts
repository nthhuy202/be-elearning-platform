import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { CoursesModule } from 'src/courses/courses.module';

@Module({
  imports: [CoursesModule],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
