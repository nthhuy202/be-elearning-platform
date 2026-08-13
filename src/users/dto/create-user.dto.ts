import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateUsersDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
