export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  mfaEnabled: boolean;
  /** ADMIN sem TOTP quando MFA_REQUIRE_ADMIN está activo no servidor. */
  mfaSetupRequired?: boolean;
  phone: string | null;
  createdAt: string;
};

/** Sessão no cliente — apenas perfil; tokens ficam em cookies HttpOnly. */
export type AuthSession = {
  user: SessionUser;
};

const KEY = "dadivago_auth";
const LOGIN_FLASH_KEY = "dadivago_login_flash";

/** Dispersado quando o cliente fica sem sessão válida durante pedidos à API (`refresh` falhou ou sem cookies). */
export const SESSION_INVALIDATED_EVENT = "dadivago:session-invalidated";

export function emitSessionInvalidated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_INVALIDATED_EVENT));
}

/**
 * Usa sessionStorage para que o perfil seja apagado automaticamente
 * quando o browser/aba é fechado — o utilizador tem de fazer login
 * novamente ao reabrir (cookies HttpOnly são revogados no logout).
 */
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function loadSession(): AuthSession | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: SessionUser };
    if (!parsed?.user?.id) return null;
    return { user: parsed.user };
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(KEY, JSON.stringify({ user: session.user }));
}

export function clearSession(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(KEY);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorar */
  }
}

export function updateSessionUser(user: SessionUser): void {
  // Sempre persistir: cookies HttpOnly podem existir sem perfil em sessionStorage
  // (ex.: novo separador) — `fetchMe` tem de rehidratar a sessão local.
  saveSession({ user });
}

/** Guarda uma mensagem temporária em sessionStorage para exibir na página `/login`. */
export function setLoginFlashMessage(message: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(LOGIN_FLASH_KEY, message);
  } catch {
    /* ignorar */
  }
}

/** Lê e apaga a mensagem de flash para login (evita repetição ao refrescar). */
export function consumeLoginFlashMessage(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(LOGIN_FLASH_KEY);
    if (raw) storage.removeItem(LOGIN_FLASH_KEY);
    return raw;
  } catch {
    return null;
  }
}
