# Deploy em produção — Dádiva Go

Guia mínimo para colocar a plataforma em produção (VPS, cloud ou Docker).

**Roteiro passo-a-passo:** ver [`docs/GO-LIVE.md`](./GO-LIVE.md) (check-env, HTTPS, smoke, backups, MFA).

---

## Arquitectura

```
Internet → Reverse proxy (HTTPS) → Frontend Next :3000
                                      ↓ (BFF /api/* + cookies HttpOnly)
                                   API Nest :4000 (rede interna)
PostgreSQL (interno) + volume uploads + AI service (rede interna)
```

O browser **nunca** fala directamente com a API Nest — todos os pedidos `/api/*` passam pelos route handlers Next, que injectam o Bearer a partir de cookies HttpOnly.

---

## Pré-requisitos

- Docker 24+ e Docker Compose
- Domínio com DNS apontado para o servidor
- Certificado TLS (Let's Encrypt via Caddy ou Certbot + nginx)
- SMTP real ou Resend (obrigatório para recuperação de password)

---

## 1. Variáveis de ambiente

```bash
cd backend
cp env.prod.sample .env.prod
# Editar .env.prod — JWT, CORS, SMTP, passwords, URLs
```

| Variável | Obrigatório | Notas |
|----------|-------------|-------|
| `POSTGRES_PASSWORD` | Sim | Password forte para PostgreSQL |
| `JWT_SECRET` | Sim | ≥ 32 caracteres aleatórios |
| `CORS_ORIGIN` | Sim | URL exacta do frontend (`https://app…`) |
| `NEXT_PUBLIC_API_URL` | Sim | URL pública (build); browser usa same-origin `/api` |
| `INTERNAL_API_URL` | Sim (frontend) | URL interna Nest para o BFF (`http://api:4000` em Docker) |
| `JWT_SECRET` | Sim (frontend + API) | Mesmo segredo — middleware valida JWT |
| `APP_PUBLIC_URL` | Sim | Links de email (recuperação) |
| `MAIL_*` / `SMTP_*` | Sim | Email transaccional |
| `BOOTSTRAP_ADMIN_SECRET` | Sim | Primeiro admin (`x-bootstrap-token`) |

A API **recusa arrancar** em `NODE_ENV=production` se estas variáveis estiverem em falta ou fracas (`env-validation.ts`).

---

## 2. Docker Compose (produção)

```bash
cd backend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

O que acontece:
- **PostgreSQL** — só rede interna (porta 5432 não exposta)
- **API** — `prisma migrate deploy` automático no entrypoint, depois Nest
- **Frontend** — build com `NEXT_PUBLIC_API_URL` do `.env.prod`
- **AI service** — só rede interna (`expose: 8000`, sem portas públicas)

Verificar saúde:

```bash
curl http://localhost:3000/api/health/ready
# (via BFF) → { "status": "ok", "database": "up" }
# A API Nest não está publicada no host; health-check directo em :4000 só dentro da rede Docker.
```

---

## 3. Reverse proxy (HTTPS)

### Opção A — Caddy (recomendado)

`Caddyfile`:

```caddy
app.seudominio.com {
    reverse_proxy localhost:3000
}
```

A API Nest **não** precisa de rota pública `/api` no proxy — o frontend Next faz proxy internamente via `INTERNAL_API_URL`.

Caddy obtém certificados Let's Encrypt automaticamente.

### Opção B — nginx

```nginx
server {
    listen 443 ssl http2;
    server_name app.seudominio.com;

    # ssl_certificate … (Certbot)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Importante:** a API usa `trust proxy` — o IP real do cliente chega via `X-Forwarded-For`.

Se frontend e API estão no **mesmo domínio** (recomendado — só proxy para `:3000`), use:

```
NEXT_PUBLIC_API_URL=https://app.seudominio.com
INTERNAL_API_URL=http://api:4000
CORS_ORIGIN=https://app.seudominio.com
```

---

## 4. Primeiro administrador

Com a API a correr e BD vazia:

```bash
curl -X POST https://app.seudominio.com/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: SEU_BOOTSTRAP_ADMIN_SECRET" \
  -d '{"email":"admin@empresa.com","password":"SenhaForte123!","name":"Admin"}'
```

---

## 5. Backups

### PostgreSQL

```bash
docker exec dadiva-postgres pg_dump -U dadiva dadiva > backup-$(date +%F).sql
```

Agendar com cron (diário) e guardar off-site.

### Uploads

Volume Docker `dadiva_uploads` — copiar periodicamente:

```bash
docker run --rm -v dadiva_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

---

## 6. Deploy sem Docker (manual)

Ver `docs/SETUP.md` secção 7. Ordem:

1. PostgreSQL acessível
2. `cd backend/api && npm ci && npx prisma migrate deploy && npm run build && npm run start:prod`
3. `cd ../.. && NEXT_PUBLIC_API_URL=https://… npm run build && npm run start`

---

## 7. Checklist go-live

- [ ] `.env.prod` preenchido (sem valores de exemplo)
- [ ] HTTPS activo
- [ ] `curl /api/health/ready` → `database: up`
- [ ] Login, refresh rotativo e logout funcionam
- [ ] Email de recuperação testado
- [ ] Backups PG + uploads agendados
- [ ] Portas internas (5432, 8000, **4000**) **não** expostas publicamente
- [ ] Rate limit activo em `/api/auth/*` (15 req/min por IP)
- [ ] MFA TOTP activo nas contas ADMIN

---

## 8. CI local

```bash
# Frontend
npm ci && npm run lint && NEXT_PUBLIC_API_URL=http://localhost:4000 npm run build

# API
cd backend/api && npm ci && npm run test && npm run build
```

O pipeline GitHub Actions (`.github/workflows/ci.yml`) corre estes passos em cada push.

---

## Resolução de problemas

| Sintoma | Causa provável |
|---------|----------------|
| API não arranca | JWT/CORS/mail inválidos — ver logs do container |
| Frontend chama localhost | Rebuild com `NEXT_PUBLIC_API_URL` correcto |
| Migrações falham | PostgreSQL inacessível ou credenciais erradas |
| CORS error | `CORS_ORIGIN` não coincide com URL do browser |
| 429 Too Many Requests | Rate limit — aguardar 1 min ou ajustar throttler |
