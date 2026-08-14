import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CoursesService } from 'src/courses/courses.service';
import { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';
import { QueryLessonDto } from './dto/query-lesson.dto';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from 'src/common/constants';
import { Prisma, Role } from 'generated/prisma/client';
import { buildPaginatedResult } from 'src/common/utils/pagination.util';
import { MESSAGES } from 'src/common/messages';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto';
import { EnrollmentsService } from 'src/enrollments/enrollments.service';

const LESSON_LIST_SELECT = {
  id: true,
  title: true,
  orderIndex: true,
  createdAt: true,
  updatedAt: true,
};

const LESSON_DETAIL_SELECT = {
  ...LESSON_LIST_SELECT,
  courseId: true,
  content: true,
};

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coursesService: CoursesService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  async create(
    courseId: string,
    dto: CreateLessonDto,
    currentUser: AuthenticatedUser,
  ) {
    await this.coursesService.ensureCanModifyCourse(courseId, currentUser);

    const orderIndex =
      dto.orderIndex ?? (await this.getNextOrderIndex(courseId));

    return this.prisma.lesson.create({
      data: { ...dto, courseId, orderIndex },
      select: LESSON_DETAIL_SELECT,
    });
  }

  async findAll(courseId: string, query: QueryLessonDto) {
    await this.coursesService.ensureCourseExists(courseId);

    const {
      page = DEFAULT_PAGE,
      limit = DEFAULT_PAGE_SIZE,
      sortBy = 'orderIndex',
      sortOrder = 'asc',
      search,
    } = query;

    const where: Prisma.LessonWhereInput = {
      courseId,
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lesson.findMany({
        where,
        select: LESSON_LIST_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lesson.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, limit);
  }

  async findOne(courseId: string, id: string, currentUser: AuthenticatedUser) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, courseId },
      select: {
        ...LESSON_DETAIL_SELECT,
        course: { select: { instructorId: true } },
      },
    });

    if (!lesson) {
      throw new NotFoundException(MESSAGES.LESSON.NOT_FOUND);
    }

    const { course, ...result } = lesson;
    const isCourseOwner = course.instructorId === currentUser.id;

    if (!isCourseOwner && currentUser.role !== Role.ADMIN) {
      await this.enrollmentsService.ensureEnrolled(currentUser.id, courseId);
    }

    return result;
  }

  async update(
    courseId: string,
    id: string,
    dto: UpdateLessonDto,
    currentUser: AuthenticatedUser,
  ) {
    await this.coursesService.ensureCanModifyCourse(courseId, currentUser);
    await this.ensureLessonInCourse(courseId, id);

    return this.prisma.lesson.update({
      where: { id },
      data: dto,
      select: LESSON_DETAIL_SELECT,
    });
  }

  async remove(courseId: string, id: string, currentUser: AuthenticatedUser) {
    await this.coursesService.ensureCanModifyCourse(courseId, currentUser);
    await this.ensureLessonInCourse(courseId, id);

    await this.prisma.lesson.delete({ where: { id } });
  }

  async reorder(
    courseId: string,
    dto: ReorderLessonsDto,
    currentUser: AuthenticatedUser,
  ) {
    await this.coursesService.ensureCanModifyCourse(courseId, currentUser);

    const lessonIds = dto.items.map((item) => item.id);
    const hasDuplicatedId = new Set(lessonIds).size !== lessonIds.length;

    const matchedCount = await this.prisma.lesson.count({
      where: { courseId, id: { in: lessonIds } },
    });

    if (hasDuplicatedId || matchedCount !== lessonIds.length) {
      throw new BadRequestException(MESSAGES.LESSON.REORDER_INVALID_ITEMS);
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.lesson.update({
          where: { id: item.id },
          data: { orderIndex: item.orderIndex },
        }),
      ),
    );

    return this.prisma.lesson.findMany({
      where: { courseId },
      select: LESSON_LIST_SELECT,
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async getNextOrderIndex(courseId: string) {
    const lastLesson = await this.prisma.lesson.findFirst({
      where: { courseId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    return lastLesson ? lastLesson.orderIndex + 1 : 0;
  }

  private async ensureLessonInCourse(courseId: string, id: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, courseId },
      select: { id: true },
    });

    if (!lesson) {
      throw new NotFoundException(MESSAGES.LESSON.NOT_FOUND);
    }
  }
}
