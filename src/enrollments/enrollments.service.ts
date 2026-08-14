import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CoursesService } from 'src/courses/courses.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { MESSAGES } from 'src/common/messages';
import { QueryEnrollmentDto } from './dto/query-enrollment.dto';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from 'src/common/constants';
import { buildPaginatedResult } from 'src/common/utils/pagination.util';
import { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';
import { Role } from 'generated/prisma/enums';

const ENROLLMENT_COURSE_SELECT = {
  id: true,
  enrolledAt: true,
  course: {
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      price: true,
      currency: true,
    },
  },
};

const ENROLLMENT_STUDENT_SELECT = {
  id: true,
  enrolledAt: true,
  student: { select: { id: true, fullName: true, email: true } },
};

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coursesService: CoursesService,
  ) {}

  async create(studentId: string, dto: CreateEnrollmentDto) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      select: { id: true, price: true, instructorId: true },
    });

    if (!course) {
      throw new NotFoundException(MESSAGES.COURSE.NOT_FOUND);
    }

    if (course.instructorId === studentId) {
      throw new BadRequestException(
        MESSAGES.ENROLLMENT.INSTRUCTOR_CANNOT_ENROLL,
      );
    }

    if (course.price > 0) {
      throw new BadRequestException(MESSAGES.ENROLLMENT.REQUIRES_PAYMENT);
    }

    const existingEnrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: dto.courseId } },
      select: { id: true },
    });

    if (existingEnrollment) {
      throw new ConflictException(MESSAGES.ENROLLMENT.ALREADY_ENROLLED);
    }

    return this.prisma.enrollment.create({
      data: { studentId, courseId: dto.courseId },
      select: ENROLLMENT_COURSE_SELECT,
    });
  }

  async findMine(studentId: string, query: QueryEnrollmentDto) {
    const {
      page = DEFAULT_PAGE,
      limit = DEFAULT_PAGE_SIZE,
      sortOrder = 'desc',
    } = query;

    const where = { studentId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        select: ENROLLMENT_COURSE_SELECT,
        orderBy: [{ enrolledAt: sortOrder }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, limit);
  }

  async findByCourse(
    courseId: string,
    query: QueryEnrollmentDto,
    currentUser: AuthenticatedUser,
  ) {
    await this.coursesService.ensureCanModifyCourse(courseId, currentUser);

    const {
      page = DEFAULT_PAGE,
      limit = DEFAULT_PAGE_SIZE,
      sortOrder = 'desc',
    } = query;

    const where = { courseId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        select: ENROLLMENT_STUDENT_SELECT,
        orderBy: [{ enrolledAt: sortOrder }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, limit);
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      select: { id: true, studentId: true, paymentId: true },
    });

    if (!enrollment) {
      throw new NotFoundException(MESSAGES.ENROLLMENT.NOT_FOUND);
    }

    const isAdmin = currentUser.role === Role.ADMIN;

    if (!isAdmin && enrollment.studentId !== currentUser.id) {
      throw new ForbiddenException(MESSAGES.AUTH.FORBIDDEN);
    }

    if (!isAdmin && enrollment.paymentId) {
      throw new BadRequestException(MESSAGES.ENROLLMENT.CANNOT_CANCEL_PAID);
    }

    await this.prisma.enrollment.delete({ where: { id } });
  }

  async ensureEnrolled(studentId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: { id: true, enrolledAt: true },
    });

    if (!enrollment) {
      throw new ForbiddenException(MESSAGES.ENROLLMENT.NOT_ENROLLED);
    }

    return enrollment;
  }
}
