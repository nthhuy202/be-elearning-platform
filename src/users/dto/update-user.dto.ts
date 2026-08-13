import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateUsersDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUsersDto, ['password']),
) {}
