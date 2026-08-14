import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import {
  COURSE_TITLE_MAX_LENGTH,
  SUPPORTED_CURRENCIES,
} from 'src/common/constants';
import { MESSAGES } from 'src/common/messages';

export class CreateCourseDto {
  @IsString({ message: MESSAGES.VALIDATION.TITLE_REQUIRED })
  @IsNotEmpty({ message: MESSAGES.VALIDATION.TITLE_REQUIRED })
  @MaxLength(COURSE_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString({ message: MESSAGES.VALIDATION.DESCRIPTION_INVALID })
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: MESSAGES.VALIDATION.THUMBNAIL_URL_INVALID })
  thumbnailUrl?: string;

  @IsInt({ message: MESSAGES.VALIDATION.PRICE_INVALID })
  @Min(0, { message: MESSAGES.VALIDATION.PRICE_INVALID })
  price!: number;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES, {
    message: MESSAGES.VALIDATION.CURRENCY_INVALID,
  })
  currency?: string;
}
