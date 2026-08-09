# Backend — Dádiva Go

Estrutura alinhada à arquitetura de microserviços: API de negócio em **NestJS** e serviço de **imagem/IA** em **FastAPI**.

## Pastas

| Pasta | Stack | Função |
|--------|--------|--------|
| `api/` | NestJS (Node) | Regras de negócio, auth, orquestração, integração com PostgreSQL/S3 (fases seguintes). |
| `ai-service/` | FastAPI (Python) | Processamento pesado de imagens e modelos de IA (fases seguintes). |

## Base de dados (PostgreSQL)

Na pasta `backend/`:

```bash
docker compose up -d
```

Depois aplicar migrações Prisma:

```bash
cd api
cp env.sample .env
npm run prisma:migrate
```

## API Nest (`api/`)

```bash
cd api
cp env.sample .env
npm install
npm run prisma:generate
npm run start:dev
```

- URL base: `http://localhost:4000/api`
- Health: `GET http://localhost:4000/api/health`
- Auth:
  - `POST /api/auth/bootstrap` — cria o **primeiro** utilizador (admin) quando a base está vazia; em produção exige `BOOTSTRAP_ADMIN_SECRET` e o cabeçalho `x-bootstrap-token`
  - `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me` (Bearer)
- Admin: `POST /api/admin/users` — cria utilizadores (qualquer papel); requer JWT de **ADMIN**
- Pedidos (lista): `GET http://localhost:4000/api/orders` — requer cabeçalho `Authorization: Bearer <accessToken>` e respeita visibilidade por papel (cliente só vê os próprios; designer vê os atribuídos; admin/produção têm visão operacional)

Modelo de dados: `api/prisma/schema.prisma` (utilizadores, pedidos, linhas, versões de arte, anotações, checklist técnico, SLA, consumíveis, envio, auditoria, sessões).

O frontend Next.js (porta 3000) pode chamar a API com `CORS_ORIGIN` apontando para `http://localhost:3000`.

Na raiz do repositório Next, copie `.env.example` para `.env.local` e ajuste `NEXT_PUBLIC_API_URL` se a API não estiver em `http://localhost:4000`.

## Serviço AI (`ai-service/`)

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- Health: `GET http://localhost:8000/health`
- Docs OpenAPI: `http://localhost:8000/docs`

Endpoints disponíveis:

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Health check |
| `/mockup/preview` | POST | Gera pré-visualização de mockup (JSON + imagem base64) |
| `/art/extract-colors` | POST | Extrai cores dominantes de uma imagem (multipart) |
| `/docs` | GET | Documentação OpenAPI interactiva |

## Docker (stack completo)

Para iniciar todos os serviços com Docker Compose:

```bash
# Na pasta backend/
docker compose up -d
```

Serviços iniciados: `postgres` (5432), `api` (4000), `frontend` (3000), `ai-service` (8000).

Ver `docs/SETUP.md` na raiz do projeto para instruções detalhadas.

## Próximos passos sugeridos

- Módulos Nest adicionais (`art-versions`, criação de pedidos).
- Revogação de refresh (`POST /api/auth/logout`).
- Cliente HTTP na API para tarefas assíncronas no `ai-service` (fila ou chamadas internas).
- Upload para S3 e gravação de `storage_key` em `art_versions`.
- Implementar modelos de IA reais no `ai-service` (remoção de fundo, geração de mockup fotorrealista).
