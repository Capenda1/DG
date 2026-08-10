# Go-live — Dádiva Go

Roteiro ordenado para subir a plataforma. Complementa `docs/DEPLOY.md`.

---

## 0. Pré-voo (máquina local ou CI)

```bash
# Validar .env.prod (Linux/macOS/Git Bash)
chmod +x deploy/*.sh
./deploy/check-env-prod.sh backend/.env.prod

# Smoke local (API + frontend a correr)
node deploy/smoke-go-live.mjs
```

---

## 1. Servidor (VPS)

1. DNS `A` do domínio → IP do servidor  
2. Docker 24+ e Docker Compose  
3. Clonar o repositório  
4. `cp backend/env.prod.sample backend/.env.prod` e preencher **todos** os valores  
5. MFA para ADMIN é opcional (`MFA_REQUIRE_ADMIN=false` por omissão).

6. Validar:

```bash
./deploy/check-env-prod.sh backend/.env.prod
```

---

## 2. Arranque Docker

```bash
cd backend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Health (via BFF, porta frontend):

```bash
curl -fsS http://127.0.0.1:3000/api/health/ready
# → {"status":"ok","database":"up"}
```

Confirmar que **4000 / 5432 / 8000 não estão abertos** na firewall pública.

---

## 3. HTTPS

### Caddy (recomendado)

```bash
# Ajustar domínio em deploy/Caddyfile
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### nginx

Usar `deploy/nginx.conf` + Certbot. Ver comentários no ficheiro.

---

## 4. Primeiro administrador

Só se a BD estiver vazia:

```bash
curl -X POST https://app.seudominio.com/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: $BOOTSTRAP_ADMIN_SECRET" \
  -d '{"email":"admin@empresa.com","password":"SenhaForte123!","name":"Admin"}'
```

Depois: login com email/password. MFA TOTP é opcional em Configurações → Sistema.

---

## 5. Smoke em produção

```bash
SMOKE_BASE=https://app.seudominio.com \
SMOKE_EMAIL=admin@empresa.com \
SMOKE_PASSWORD='…' \
node deploy/smoke-go-live.mjs
```

Testar também: recuperação de password (email SMTP).

---

## 6. Backups (cron)

```bash
cd /opt/dadiva
git pull origin main
bash deploy/install-backups.sh
```

Isto cria `/var/backups/dadiva`, torna os scripts executáveis, agenda:
- Postgres — todos os dias às **02:15**
- Uploads — todos os dias às **03:00**

Retenção: **14 dias**. Log: `/var/log/dadiva-backup.log`.

Copiar periodicamente `/var/backups/dadiva` para armazenamento off-site (outro disco, S3, PC).

---

## Checklist final

- [ ] `check-env-prod.sh` OK  
- [ ] HTTPS (cadeado no browser)  
- [ ] `/api/health/ready` via domínio  
- [ ] Login + logout (smoke)  
- [ ] Email de recuperação recebido  
- [ ] Backups cron a correr (teste manual uma vez)  
- [ ] Portas 4000/5432/8000 fechadas ao público  


Quando todos os itens estiverem marcados: **go-live**.
