import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MESSAGES } from 'src/common/messages';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { Role } from '../../../generated/prisma/client';
import { AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!request.user) {
      throw new UnauthorizedException(MESSAGES.AUTH.UNAUTHORIZED);
    }

    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException(MESSAGES.AUTH.FORBIDDEN);
    }

    return true;
  }
}
