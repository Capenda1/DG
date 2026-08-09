#!/usr/bin/env bash
# Valida backend/.env.prod antes do deploy.
# Uso: ./deploy/check-env-prod.sh [caminho/.env.prod]

set -euo pipefail

ENV_FILE="${1:-backend/.env.prod}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: ficheiro não encontrado: $ENV_FILE"
  echo "Copie: cp backend/env.prod.sample backend/.env.prod"
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source <(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE" | sed 's/\r$//')
set +a

FAIL=0
warn() { echo "✗ $1"; FAIL=1; }
ok() { echo "✓ $1"; }

require() {
  local key="$1"
  local val="${!key:-}"
  if [[ -z "$val" ]]; then
    warn "$key em falta"
  else
    ok "$key definido"
  fi
}

echo "== Validação $ENV_FILE =="

require POSTGRES_PASSWORD
require JWT_SECRET
require CORS_ORIGIN
require NEXT_PUBLIC_API_URL
require APP_PUBLIC_URL
require BOOTSTRAP_ADMIN_SECRET

if [[ -n "${JWT_SECRET:-}" ]]; then
  if [[ ${#JWT_SECRET} -lt 32 ]]; then
    warn "JWT_SECRET deve ter ≥ 32 caracteres (tem ${#JWT_SECRET})"
  fi
  case "$(echo "$JWT_SECRET" | tr '[:upper:]' '[:lower:]')" in
    *change*|*example*|*sample*|*gere-um*|*dev-only*)
      warn "JWT_SECRET parece valor de exemplo"
      ;;
  esac
fi

if [[ "${CORS_ORIGIN:-}" == "*" ]]; then
  warn "CORS_ORIGIN não pode ser *"
fi

if [[ -z "${INTERNAL_API_URL:-}" ]]; then
  echo "· INTERNAL_API_URL vazio — em Docker compose usa-se http://api:4000 no serviço frontend"
else
  ok "INTERNAL_API_URL=${INTERNAL_API_URL}"
fi

# Mail: SMTP ou Resend
if [[ "${MAIL_PROVIDER:-smtp}" == "none" ]]; then
  warn "MAIL_PROVIDER=none não é permitido em produção"
fi

MAIL_OK=0
if [[ -n "${RESEND_API_KEY:-}" ]]; then MAIL_OK=1; fi
if [[ -n "${SMTP_USER:-}${EMAIL_USER:-}" && -n "${SMTP_PASS:-}${EMAIL_PASS:-}" ]]; then MAIL_OK=1; fi
if [[ -n "${MAIL_FROM:-}${EMAIL_FROM:-}${EMAIL_USER:-}" ]]; then
  ok "remetente de email configurável"
else
  warn "MAIL_FROM / EMAIL_FROM / EMAIL_USER em falta"
fi
if [[ $MAIL_OK -eq 0 ]]; then
  warn "Credenciais de email em falta (SMTP_USER+PASS ou RESEND_API_KEY)"
else
  ok "credenciais de email presentes"
fi

# MFA recomendado
if [[ "${MFA_REQUIRE_ADMIN:-}" == "1" || "${MFA_REQUIRE_ADMIN:-}" == "true" ]]; then
  ok "MFA_REQUIRE_ADMIN activo"
else
  echo "· AVISO: MFA_REQUIRE_ADMIN não está activo (recomendado: true em produção)"
fi

echo
if [[ $FAIL -ne 0 ]]; then
  echo "Validação FALHOU — corrija .env.prod antes do deploy."
  exit 1
fi
echo "Validação OK — pode fazer o build/deploy."
