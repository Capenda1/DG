import { UserRole } from '@prisma/client';

/** Operação alargada: administrador e gerente (sem gestão de utilizadores / settings). */
export const ADMIN_OR_MANAGER: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
];

/** Balcão / caixa / pedidos comerciais. */
export const ADMIN_MANAGER_ATTENDANT: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.ATTENDANT,
];

export function isAdminOrManager(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export function isAdminManagerOrAttendant(role: UserRole): boolean {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.MANAGER ||
    role === UserRole.ATTENDANT
  );
}
