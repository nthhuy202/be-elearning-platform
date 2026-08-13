import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUsersDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ChangePasswordDto } from 'src/auth/dto/change-password.dto';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { MESSAGES } from 'src/common/messages';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ResponseMessage(MESSAGES.USER.CREATE_SUCCESS)
  create(@Body() createUserDto: CreateUsersDto) {
    return this.usersService.register(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ResponseMessage(MESSAGES.USER.CHANGE_PASSWORD_SUCCESS)
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Get(':id')
  @ResponseMessage(MESSAGES.USER.DETAIL_SUCCESS)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage(MESSAGES.USER.UPDATE_SUCCESS)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ResponseMessage(MESSAGES.USER.DELETE_SUCCESS)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
