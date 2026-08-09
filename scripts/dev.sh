#!/usr/bin/env bash
# ============================================================
#  Dádiva Go — Script de desenvolvimento (Linux / macOS)
#  Uso: ./scripts/dev.sh          (front + back)
#       ./scripts/dev.sh --ai     (inclui serviço IA FastAPI)
#       ./scripts/dev.sh --no-docker  (não arranca Docker)
# ============================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# ── Flags ──────────────────────────────────────────────────
AI=false
SKIP_DOCKER=false
for arg in "$@"; do
    case "$arg" in
        --ai)          AI=true ;;
        --no-docker)   SKIP_DOCKER=true ;;
    esac
done

# ── Cores ──────────────────────────────────────────────────
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m';  RESET='\033[0m';    BOLD='\033[1m'

step()  { echo -e "\n${CYAN}► $1${RESET}"; }
ok()    { echo -e "  ${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "  ${YELLOW}⚠ $1${RESET}"; }
fail()  { echo -e "\n${RED}✗ $1${RESET}"; exit 1; }

# ── 1. Pré-requisitos ──────────────────────────────────────
step "A verificar pré-requisitos..."
command -v node  >/dev/null 2>&1 || fail "Node.js não encontrado. Instale em https://nodejs.org"
command -v npm   >/dev/null 2>&1 || fail "npm não encontrado."
$SKIP_DOCKER || command -v docker >/dev/null 2>&1 || fail "Docker não encontrado. Instale em https://docker.com"
ok "Node.js $(node --version)"

# ── 2. Ficheiros .env ──────────────────────────────────────
step "A verificar ficheiros de ambiente..."

if [ ! -f "backend/api/.env" ]; then
    cp "backend/api/env.sample" "backend/api/.env"
    warn "Criado backend/api/.env a partir de env.sample — reveja os valores se necessário."
else
    ok "backend/api/.env existe."
fi

if [ ! -f ".env.local" ]; then
    cp ".env.example" ".env.local"
    ok "Criado .env.local a partir de .env.example."
else
    ok ".env.local existe."
fi

if $AI && [ ! -f "backend/ai-service/.env" ]; then
    cp "backend/ai-service/env.sample" "backend/ai-service/.env"
    ok "Criado backend/ai-service/.env."
fi

# ── 3. Dependências npm ────────────────────────────────────
step "A verificar dependências npm..."

if [ ! -d "node_modules" ]; then
    warn "node_modules não encontrado na raiz — a instalar..."
    npm install
    ok "Frontend instalado."
else
    ok "Frontend: node_modules presente."
fi

if [ ! -d "backend/api/node_modules" ]; then
    warn "node_modules não encontrado em backend/api/ — a instalar..."
    (cd backend/api && npm install)
    ok "API instalada."
else
    ok "API: node_modules presente."
fi

# ── 4. PostgreSQL (Docker) ─────────────────────────────────
if ! $SKIP_DOCKER; then
    step "A iniciar PostgreSQL via Docker..."
    pg_running=$(docker ps --filter "name=dadiva-postgres" --filter "status=running" -q 2>/dev/null || true)

    if [ -n "$pg_running" ]; then
        ok "Container dadiva-postgres já está em execução."
    else
        (cd backend && docker compose up -d postgres)
        ok "Container PostgreSQL iniciado."

        printf "  Aguardando PostgreSQL ficar pronto"
        tries=0
        while true; do
            healthy=$(docker inspect --format "{{.State.Health.Status}}" dadiva-postgres 2>/dev/null || echo "unknown")
            [ "$healthy" = "healthy" ] && break
            printf "."
            sleep 2
            tries=$((tries + 1))
            [ $tries -ge 20 ] && fail "PostgreSQL não ficou saudável. Verifique: docker logs dadiva-postgres"
        done
        echo ""
        ok "PostgreSQL pronto."
    fi
fi

# ── 5. Migrações Prisma ────────────────────────────────────
step "A verificar migrações Prisma..."
# migrate deploy é não-interativo e aplica migrações pendentes sem seed
(cd backend/api && npx prisma migrate deploy 2>&1) && ok "Migrações Prisma aplicadas." \
    || warn "Não foi possível aplicar migrações — verifique a DATABASE_URL em backend/api/.env."

# ── 6. Detectar emulador de terminal ──────────────────────
open_tab() {
    local title="$1" color="$2" cmd="$3" dir="$4"

    if command -v wt.exe >/dev/null 2>&1; then
        # WSL com Windows Terminal
        wt.exe new-tab --title "$title" -- bash -c "cd '$dir' && $cmd; exec bash" &
    elif [ "$(uname)" = "Darwin" ]; then
        osascript -e "tell application \"Terminal\" to do script \"cd '$dir' && $cmd\""
    elif command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal --tab --title="$title" -- bash -c "cd '$dir' && $cmd; exec bash" &
    elif command -v konsole >/dev/null 2>&1; then
        konsole --new-tab -e bash -c "cd '$dir' && $cmd; exec bash" &
    else
        # Fallback: tmux
        if command -v tmux >/dev/null 2>&1; then
            tmux new-window -n "$title" "cd '$dir' && $cmd"
        else
            warn "Não foi possível abrir terminal para '$title'. Execute manualmente: cd $dir && $cmd"
        fi
    fi
}

step "A abrir janelas de desenvolvimento..."

open_tab "API NestJS"       "#0891b2" "npm run start:dev" "$ROOT/backend/api"
sleep 0.3
open_tab "Frontend Next"    "#7c3aed" "npm run dev"       "$ROOT"

if $AI; then
    sleep 0.3
    AI_CMD="[ -f .venv/bin/activate ] && source .venv/bin/activate; uvicorn app.main:app --reload --port 8000"
    open_tab "AI FastAPI" "#059669" "$AI_CMD" "$ROOT/backend/ai-service"
fi

# ── Resumo ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${BOLD}Dádiva Go — Ambiente de desenvolvimento iniciado${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Frontend  →  ${CYAN}http://localhost:3000${RESET}"
echo -e "  API       →  ${CYAN}http://localhost:4000/api${RESET}"
echo -e "  Health    →  ${CYAN}http://localhost:4000/api/health${RESET}"
$AI && echo -e "  AI Docs   →  ${GREEN}http://localhost:8000/docs${RESET}"
echo -e "  DB        →  postgresql://dadiva:dadiva@localhost:5432/dadiva"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
