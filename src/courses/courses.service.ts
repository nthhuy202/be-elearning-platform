import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MESSAGES } from 'src/common/messages';
import { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';
import { Role } from 'generated/prisma/enums';

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

  findAll() {
    return this.prisma.course.findMany({
      select: COURSE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
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
    await this.ensureCanModify(id, currentUser);

    return this.prisma.course.update({
      where: { id },
      data: dto,
      select: COURSE_SELECT,
    });
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    await this.ensureCanModify(id, currentUser);

    await this.prisma.course.delete({ where: { id } });
  }

  private async ensureCanModify(id: string, currentUser: AuthenticatedUser) {
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
