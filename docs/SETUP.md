# Dádiva Go — Guia de Instalação e Configuração

## Pré-requisitos

| Ferramenta | Versão mínima | Notas |
|------------|---------------|-------|
| Node.js | 20 LTS | Para o frontend (Next.js) e a API (NestJS) |
| npm | 10+ | Incluído com Node.js |
| Docker + Docker Compose | 24+ | Para o PostgreSQL local |
| Python | 3.11+ | Apenas para o serviço IA (opcional em desenvolvimento) |
| Git | qualquer | — |

---

## 1. Clonar o repositório

```bash
git clone <url-do-repo>
cd <pasta-do-repositório>
```

---

## 2. Base de dados (PostgreSQL via Docker)

Na pasta `backend/`, inicie o container PostgreSQL:

```bash
cd backend
docker compose up -d
```

Aguarde o healthcheck ficar verde (`healthy`). Para verificar:

```bash
docker ps
```

> Credenciais por defeito: `dadiva / dadiva` na base `dadiva` (porta 5432).
> Podem ser alteradas em `backend/docker-compose.yml` e `backend/api/env.sample`.

### SMTP local (Mailpit)

Para testar recuperação de palavra-passe por email em desenvolvimento:

```bash
cd backend
docker compose up -d mailpit
```

| Serviço | URL |
|---------|-----|
| Interface web (ver emails) | http://localhost:8025 |
| Servidor SMTP | `127.0.0.1:1025` (sem autenticação; use `127.0.0.1` em vez de `localhost` no Windows) |

Configure `backend/api/.env` (já incluído no `env.sample`):

```env
MAIL_PROVIDER=smtp
MAIL_FROM="Dádiva Go <noreply@dadiva.local>"
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_REQUIRE_TLS=false
SMTP_VERIFY_ON_START=false
```

Após pedir recuperação em `/login/recuperar`, abra http://localhost:8025 para ver o email com o link.

---

## 3. API NestJS

```bash
cd backend/api

# Copiar variáveis de ambiente
cp env.sample .env

# Instalar dependências
npm install

# Gerar cliente Prisma e aplicar migrações
npm run prisma:generate
npm run prisma:migrate

# Iniciar em modo de desenvolvimento (hot-reload)
npm run start:dev
```

A API fica disponível em `http://localhost:4000/api`.

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/health` | GET | Health check |
| `/api/auth/bootstrap` | POST | Cria o primeiro utilizador admin (só quando a base está vazia) |
| `/api/auth/login` | POST | Autenticação — devolve `accessToken` e `refreshToken` |
| `/api/auth/refresh` | POST | Renova o `accessToken` |
| `/api/auth/me` | GET | Perfil do utilizador autenticado (Bearer) |
| `/api/admin/users` | POST | Cria utilizador (requer JWT de ADMIN) |
| `/api/orders` | GET | Lista pedidos (respeitando visibilidade por papel) |

### Variáveis de ambiente da API (`backend/api/.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | ✅ sempre | String de ligação PostgreSQL |
| `JWT_SECRET` | ✅ produção | Segredo JWT (≥ 32 chars, aleatório) |
| `CORS_ORIGIN` | ✅ produção | Origem exacta do frontend (ex.: `https://app.empresa.com`) |
| `NODE_ENV` | — | `development` (default) ou `production` |
| `PORT` | — | Porta da API (default: `4000`) |
| `JWT_ACCESS_EXPIRES` | — | Validade do access token (default: `15m`) |
| `JWT_REFRESH_EXPIRES_DAYS` | — | Validade do refresh token em dias (default: `7`) |
| `BOOTSTRAP_ADMIN_SECRET` | ✅ produção | Token necessário no cabeçalho `x-bootstrap-token` no endpoint bootstrap |
| `UPLOAD_DIR` | — | Pasta relativa para uploads de modelagem (default: `uploads`) |
| `MAX_MODELAGEM_UPLOAD_MB` | — | Tamanho máximo de upload em MB (default: `15`) |
| `APP_PUBLIC_URL` | — | URL pública do frontend para links em emails (default: `CORS_ORIGIN`) |
| `MAIL_PROVIDER` | ✅ produção | `auto`, `resend`, `smtp` ou `none` (não use `none` em produção) |
| `MAIL_FROM` | ✅ produção | Remetente (ex.: `Dádiva Go <noreply@seudominio.com>`) |
| `RESEND_API_KEY` | Resend | Chave API Resend (preferido se `MAIL_PROVIDER=auto` ou `resend`) |
| `SMTP_HOST` | SMTP | Servidor SMTP |
| `SMTP_PORT` | — | Porta SMTP (default: `587`; Mailpit dev: `1025`) |
| `SMTP_SECURE` | — | `true` para TLS implícito (porta 465) |
| `SMTP_REQUIRE_TLS` | — | `true` para STARTTLS na porta 587 |
| `SMTP_USER` / `SMTP_PASS` | SMTP prod. | Credenciais (obrigatórias em produção) |
| `SMTP_VERIFY_ON_START` | — | Verificar ligação SMTP ao arrancar (default: `true` em produção) |

---

## 4. Frontend Next.js

```bash
# Na raiz do repositório (onde está package.json do Next.js)
cp .env.example .env.local

# Instalar dependências
npm install

# Iniciar em modo de desenvolvimento
npm run dev
```

O frontend fica disponível em `http://localhost:3000`.

### Variáveis de ambiente do frontend (`.env.local` na raiz)

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_API_URL` | URL base da API NestJS (default: `http://localhost:4000`) |

> Em acesso por IP na LAN, o frontend detecta automaticamente o hostname da página
> e substitui `localhost` pelo IP — só precisa de garantir que a porta está correcta.

---

## 5. Serviço IA FastAPI (opcional)

```bash
cd backend/ai-service

# Criar ambiente virtual Python
python -m venv .venv

# Activar (Windows)
.venv\Scripts\activate
# Activar (Linux/macOS)
source .venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Iniciar em modo de desenvolvimento
uvicorn app.main:app --reload --port 8000
```

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Health check |
| `/mockup/preview` | POST | Gera pré-visualização de mockup (placeholder) |
| `/art/extract-colors` | POST | Extrai cores dominantes de uma imagem (placeholder) |
| `/docs` | GET | Documentação OpenAPI interactiva |

---

## 6. Todos os serviços em simultâneo (desenvolvimento)

Abra **três terminais**:

```bash
# Terminal 1 — API
cd backend/api && npm run start:dev

# Terminal 2 — Frontend
npm run dev          # na raiz do repositório

# Terminal 3 — IA (opcional)
cd backend/ai-service && uvicorn app.main:app --reload --port 8000
```

---

## 7. Produção

### Variáveis obrigatórias em produção

Antes de iniciar em `NODE_ENV=production`, garanta que as seguintes variáveis estão definidas:

- `DATABASE_URL`
- `JWT_SECRET` (≥ 32 chars, sem valores de exemplo)
- `CORS_ORIGIN` (origem exacta do frontend, não `*`)
- `BOOTSTRAP_ADMIN_SECRET`
- `MAIL_FROM` + `RESEND_API_KEY` **ou** `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` (recuperação de palavra-passe)
- `APP_PUBLIC_URL` (se diferente de `CORS_ORIGIN`)

### Builds

```bash
# API
cd backend/api
npm run build          # gera dist/
npm run start:prod     # inicia dist/main.js

# Frontend
npm run build          # gera .next/
npm run start          # inicia servidor Next.js
```

Também pode usar os **Dockerfiles** incluídos em cada pasta para criar imagens de produção. Ver `backend/api/Dockerfile` e `Dockerfile` (raiz).

---

## 8. Estrutura do projecto

```
.  (raiz do repositório)
├── app/               # Next.js App Router (páginas)
├── components/        # Componentes React
├── lib/               # Utilitários (API client, auth, rotas)
├── public/            # Assets estáticos
├── scripts/           # dev.ps1, stop.ps1, dev.sh (ambiente de desenvolvimento)
├── docs/              # Documentação (este ficheiro)
├── dev.bat / stop.bat # Atalhos Windows → scripts/*.ps1
├── .env.example       # Variáveis de ambiente do frontend
└── package.json

backend/
├── docker-compose.yml # PostgreSQL local
├── api/               # API NestJS
│   ├── src/           # Código fonte
│   ├── prisma/        # Schema + migrações (fonte de verdade)
│   └── env.sample     # Variáveis de ambiente da API
└── ai-service/        # Serviço IA FastAPI
    ├── app/           # Código fonte Python
    └── requirements.txt
```

---

## 9. Resolução de problemas comuns

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| `DATABASE_URL é obrigatória` | `.env` não configurado | `cp env.sample .env` em `backend/api/` |
| `connect ECONNREFUSED 5432` | PostgreSQL não iniciado | `docker compose up -d` em `backend/` |
| `CORS error` no browser | `CORS_ORIGIN` errado | Verificar `CORS_ORIGIN` no `.env` da API |
| `JWT_SECRET usa um valor fraco` | Valor do env.sample em produção | Gerar um secret aleatório (≥ 32 chars) |
| Migrações pendentes | Schema alterado sem migrar | `npm run prisma:migrate` em `backend/api/` |
