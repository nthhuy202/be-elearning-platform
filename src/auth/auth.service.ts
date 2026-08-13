import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUsersDto } from 'src/users/dto/create-user.dto';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import {
  BCRYPT_SALT_ROUNDS,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
} from 'src/common/constants';
import { PrismaService } from 'src/prisma/prisma.service';
import { MESSAGES } from 'src/common/messages';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  register(dto: CreateUsersDto) {
    return this.usersService.register(dto);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    const isPasswordValid =
      user && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!isPasswordValid) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user) {
      return MESSAGES.AUTH.FORGOT_PASSWORD_SENT;
    }

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: this.hashResetToken(rawToken),
          expiresAt,
        },
      }),
    ]);

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.warn(`[DEV ONLY] reset token cho ${user.email}: ${rawToken}`);
    }

    return MESSAGES.AUTH.FORGOT_PASSWORD_SENT;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: this.hashResetToken(dto.token) },
    });

    const isTokenValid =
      resetToken && !resetToken.usedAt && resetToken.expiresAt > new Date();

    if (!isTokenValid) {
      throw new BadRequestException(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return MESSAGES.AUTH.PASSWORD_RESET_SUCCESS;
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
