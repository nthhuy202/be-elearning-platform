import {
  Controller,
  Body,
  Post,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
} from '@nestjs/common';
import { CreateUsersDto } from 'src/users/dto/create-user.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { UsersService } from 'src/users/users.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { MESSAGES } from 'src/common/messages';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE } from 'src/common/constants';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { VerificationService } from './verification.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly verificationService: VerificationService,
  ) {}

  @Post('register')
  @Throttle({ default: THROTTLE.REGISTER })
  @ResponseMessage(MESSAGES.AUTH.REGISTER_SUCCESS)
  register(@Body() dto: CreateUsersDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: THROTTLE.LOGIN })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.AUTH.LOGIN_SUCCESS)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: THROTTLE.FORGOT_PASSWORD })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.AUTH.FORGOT_PASSWORD_SENT)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: THROTTLE.LOGIN })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.AUTH.RESET_PASSWORD_SUCCESS)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage(MESSAGES.AUTH.GET_PROFILE_SUCCESS)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findOne(user.id);
  }

  @Post('verify/email/request')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE.VERIFICATION_REQUEST })
  @ResponseMessage(MESSAGES.AUTH.VERIFICATION_CODE_SENT)
  requestEmailCode(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.requestEmailCode(user.id);
  }

  @Post('verify/email/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE.VERIFICATION_CONFIRM })
  @ResponseMessage(MESSAGES.AUTH.EMAIL_VERIFIED_SUCCESS)
  confirmEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyCodeDto,
  ) {
    return this.verificationService.confirmEmail(user.id, dto);
  }

  @Post('verify/phone/request')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE.VERIFICATION_REQUEST })
  @ResponseMessage(MESSAGES.AUTH.VERIFICATION_CODE_SENT)
  requestPhoneCode(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.requestPhoneCode(user.id);
  }

  @Post('verify/phone/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE.VERIFICATION_CONFIRM })
  @ResponseMessage(MESSAGES.AUTH.PHONE_VERIFIED_SUCCESS)
  confirmPhone(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyCodeDto,
  ) {
    return this.verificationService.confirmPhone(user.id, dto);
  }
}
