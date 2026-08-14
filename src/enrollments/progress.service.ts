import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EnrollmentsService } from './enrollments.service';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';
import { MESSAGES } from 'src/common/messages';

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  async setLessonProgress(
    courseId: string,
    lessonId: string,
    studentId: string,
    dto: UpdateLessonProgressDto,
  ) {
    const enrollment = await this.enrollmentsService.ensureEnrolled(
      studentId,
      courseId,
    );

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true },
    });

    if (!lesson) {
      throw new NotFoundException(MESSAGES.LESSON.NOT_FOUND);
    }

    const completedAt = dto.completed ? new Date() : null;

    return this.prisma.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId },
      },
      create: {
        enrollmentId: enrollment.id,
        lessonId,
        completed: dto.completed,
        completedAt,
      },
      update: { completed: dto.completed, completedAt },
      select: { lessonId: true, completed: true, completedAt: true },
    });
  }

  async getCourseProgress(courseId: string, studentId: string) {
    const enrollment = await this.enrollmentsService.ensureEnrolled(
      studentId,
      courseId,
    );

    const [lessons, progressRecords] = await this.prisma.$transaction([
      this.prisma.lesson.findMany({
        where: { courseId },
        select: { id: true, title: true, orderIndex: true },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.lessonProgress.findMany({
        where: { enrollmentId: enrollment.id },
        select: { lessonId: true, completed: true, completedAt: true },
      }),
    ]);

    const progressByLessonId = new Map(
      progressRecords.map((record) => [record.lessonId, record]),
    );

    const items = lessons.map((lesson) => {
      const progress = progressByLessonId.get(lesson.id);

      return {
        ...lesson,
        completed: progress?.completed ?? false,
        completedAt: progress?.completedAt ?? null,
      };
    });

    const completedLessons = items.filter((item) => item.completed).length;

    return {
      enrollmentId: enrollment.id,
      enrolledAt: enrollment.enrolledAt,
      totalLessons: items.length,
      completedLessons,
      percentage:
        items.length === 0
          ? 0
          : Math.round((completedLessons / items.length) * 100),
      lessons: items,
    };
  }
}
