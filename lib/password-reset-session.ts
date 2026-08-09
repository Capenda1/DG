const EMAIL_KEY = 'dadiva_pwd_reset_email';
const TOKEN_KEY = 'dadiva_pwd_reset_token';

export function savePasswordResetEmail(email: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
}

export function peekPasswordResetEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(EMAIL_KEY);
}

export function clearPasswordResetEmail(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(EMAIL_KEY);
}

export function savePasswordResetToken(token: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function peekPasswordResetToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearPasswordResetSession(): void {
  clearPasswordResetEmail();
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TOKEN_KEY);
}
