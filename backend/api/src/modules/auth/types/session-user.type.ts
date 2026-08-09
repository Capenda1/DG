/**
 * Shape do objecto `req.user` populado pelo JwtStrategy após validação.
 * Corresponde ao `select` em UsersService.findById — sem campos sensíveis.
 */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  mfaEnabled: boolean;
  /**
   * true quando MFA_REQUIRE_ADMIN está activo e este ADMIN ainda não activou TOTP.
   * Preenchido em GET /auth/me.
   */
  mfaSetupRequired?: boolean;
  phone: string | null;
  createdAt: Date;
};
