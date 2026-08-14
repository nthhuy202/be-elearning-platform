import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { QueryCourseDto } from './dto/query-course.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MESSAGES } from 'src/common/messages';
import { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';
import { Role } from 'generated/prisma/enums';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from 'src/common/constants';
import { Prisma } from 'generated/prisma/client';
import { buildPaginatedResult } from 'src/common/utils/pagination.util';

const COURSE_SELECT = {
  id: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  price: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  instructor: {
    select: { id: true, fullName: true, email: true },
  },
};

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  create(instructorId: string, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: { ...dto, instructorId },
      select: COURSE_SELECT,
    });
  }

  async findAll(query: QueryCourseDto) {
    const {
      page = DEFAULT_PAGE,
      limit = DEFAULT_PAGE_SIZE,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where = this.buildCourseFilter(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        select: COURSE_SELECT,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.course.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, limit);
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: COURSE_SELECT,
    });

    if (!course) {
      throw new NotFoundException(MESSAGES.COURSE.NOT_FOUND);
    }

    return course;
  }

  async update(
    id: string,
    dto: UpdateCourseDto,
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureCanModifyCourse(id, currentUser);

    return this.prisma.course.update({
      where: { id },
      data: dto,
      select: COURSE_SELECT,
    });
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    await this.ensureCanModifyCourse(id, currentUser);

    await this.prisma.course.delete({ where: { id } });
  }

  public async ensureCanModify(id: string, currentUser: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { instructorId: true },
    });

    if (!course) {
      throw new NotFoundException(MESSAGES.COURSE.NOT_FOUND);
    }

    if (
      currentUser.role !== Role.ADMIN &&
      course.instructorId !== currentUser.id
    ) {
      throw new ForbiddenException(MESSAGES.COURSE.NOT_OWNER);
    }
  }

  private buildCourseFilter(query: QueryCourseDto): Prisma.CourseWhereInput {
    const { search, instructorId, minPrice, maxPrice } = query;
    const where: Prisma.CourseWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (instructorId) {
      where.instructorId = instructorId;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {
        ...(minPrice !== undefined && { gte: minPrice }),
        ...(maxPrice !== undefined && { lte: maxPrice }),
      };
    }

    return where;
  }

  async ensureCourseExists(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException(MESSAGES.COURSE.NOT_FOUND);
    }
  }

  async ensureCanModifyCourse(id: string, currentUser: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { instructorId: true },
    });

    if (!course) {
      throw new NotFoundException(MESSAGES.COURSE.NOT_FOUND);
    }

    if (
      currentUser.role !== Role.ADMIN &&
      course.instructorId !== currentUser.id
    ) {
      throw new ForbiddenException(MESSAGES.COURSE.NOT_OWNER);
    }
  }
}
