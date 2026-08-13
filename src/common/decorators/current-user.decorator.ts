import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from 'src/auth/types/authenticated-user.type';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();

    return request.user;
  },
);
