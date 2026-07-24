import { UserRole } from '@prisma/client';

export type RequestUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
};
