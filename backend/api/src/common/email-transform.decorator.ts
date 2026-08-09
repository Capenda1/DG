import { Transform } from 'class-transformer';
import { normalizeEmail } from './email.util';

/** Converte email para minúsculas antes da validação (class-transformer). */
export function NormalizeEmailField() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
}
