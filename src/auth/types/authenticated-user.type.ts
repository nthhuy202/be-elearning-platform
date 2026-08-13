import { Role } from '../../../generated/prisma/client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: Role;
};
