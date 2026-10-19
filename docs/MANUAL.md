# Manual de instruções — Dádiva Go

Manual operacional e técnico do projecto completo. Complementa:

| Documento | Quando usar |
|-----------|-------------|
| [`SETUP.md`](SETUP.md) | Instalar e desenvolver em local |
| [`DEPLOY.md`](DEPLOY.md) / [`GO-LIVE.md`](GO-LIVE.md) | Subir / actualizar produção |
| [`TWILIO-SMS-ANGOLA.md`](TWILIO-SMS-ANGOLA.md) | SMS para clientes (Angola) |
| [`PLATAFORMA-DADIVA-GO.md`](PLATAFORMA-DADIVA-GO.md) | Visão de produto |
| [`PLANO-EVOLUCAO-EM-FASES.md`](PLANO-EVOLUCAO-EM-FASES.md) | Roadmap |

**Produção actual:** [https://graficadadiva.com](https://graficadadiva.com)  
**Servidor:** VPS Hetzner · código em `/opt/dadiva`

---

## 1. O que é o Dádiva Go

Plataforma da gráfica para:

- Catálogo de produtos (vestuário, lona/vinil, outros) com preços e variantes
- Pedidos online (cliente) e no balcão (PDV)
- Modelagem / arte 2D por pedido
- Caixa, facturação (recibo / factura / pro-forma)
- SMS, galeria, RH, finanças e backups (admin)

**Stack:** Next.js (interface) + NestJS (API) + PostgreSQL (+ serviço IA opcional).

---

## 2. Papéis e acessos

| Papel | Entrada | Pode |
|-------|---------|------|
| **Cliente** | [graficadadiva.com](https://graficadadiva.com) (`/`) | Conta, pedidos, modelagem do próprio pedido |
| **Atendente** | `/admin/login` | Balcão, pedidos, caixa, facturas, SMS (histórico) |
| **Designer** | `/admin/login` | Fila de design, pedidos (estados), modelos, galeria |
| **Admin** | `/admin/login` | Tudo: produtos, insumos, RH, financeiro, utilizadores, configurações, backups |

Atendente **não** acede a: produtos, insumos, RH, utilizadores, finanças, configurações.

---

## 3. Mapa rápido de ecrãs

### Cliente

| URL | Função |
|-----|--------|
| `/` | Login |
| `/cadastro` | Registo |
| `/conta` | Resumo + galeria |
| `/conta/pedidos` | Lista de pedidos |
| `/conta/pedidos/novo` | Novo pedido |
| `/conta/pedidos/[id]` | Detalhe |
| `/conta/pedidos/[id]/artigos` | Artigos (rascunho) |
| `/conta/pedidos/[id]/modelagem` | Editor de modelagem |

### Staff

| URL | Função | Quem |
|-----|--------|------|
| `/admin` | Painel | Admin (+ redireccionamentos por papel) |
| `/admin/balcao` | PDV | Admin, Atendente |
| `/admin/caixa` | Abrir / fechar turno | Admin, Atendente |
| `/admin/pedidos` | Fila e estados | Admin, Atendente, Designer |
| `/admin/facturas/*` | Recibo, factura, pro-forma | Admin, Atendente |
| `/admin/produtos` | Catálogo + **matriz de activação** | Admin |
| `/admin/designer` | Fila de arte | Admin, Designer |
| `/admin/modelos` | Modelos de design | Admin, Designer |
| `/admin/galeria` | Slides da área cliente | Admin, Designer |
| `/admin/insumos` | Stock | Admin |
| `/admin/clientes` | Clientes | Admin |
| `/admin/financeiro` | Razão / export | Admin |
| `/admin/relatorios` | Relatórios | Admin |
| `/admin/utilizadores` | Contas e papéis | Admin |
| `/admin/rh` | Colaboradores / férias | Admin |
| `/admin/notificacoes` | Histórico SMS (envios manuais) | Admin, Atendente |
| `/admin/configuracoes` | Empresa, pagamentos, MFA, backups… | Admin |

---

## 4. Ciclo de vida do pedido

Estados (rótulos na app):

1. **Rascunho** — ainda a editar  
2. **Submetido** — cliente/balcão enviou  
3. **Validação e pagamento** — a confirmar pagamento  
4. **Aprovado** — pronto para produção / arte  
5. **Em produção**  
6. **Finalizado**  
7. **Entregue**  
8. **Cancelado** (quando aplicável)

**Fluxo típico online:** cliente cria → artigos → modelagem → submete → pagamento → design/admin avança estados → produção → finalizado/entregue.

**Fluxo típico balcão:** abrir caixa → PDV cria pedido → artigos/modelagem → documentos → fechar caixa no fim do turno.

Documentos:

- **Pro-forma** — orçamento / pré-factura  
- **Factura** — documento fiscal de venda  
- **Recibo** — comprovativo de pagamento  

---

## 5. Manual por papel

### 5.1 Cliente

1. Registar em `/cadastro` ou pedir conta à loja.  
2. Entrar em `/` → área `/conta`.  
3. **Novo pedido** → escolher produtos/variantes → guardar artigos.  
4. Abrir **Modelagem** para posicionar a arte (cores do catálogo quando aplicável).  
5. Submeter o pedido e seguir as instruções de pagamento.  
6. Acompanhar o estado em `/conta/pedidos`.

### 5.2 Atendente (balcão)

**Rotina diária**

1. Login em `/admin/login`.  
2. **Caixa** → abrir turno (se ainda fechado).  
3. **Balcão** → criar pedido (cliente existente ou “Cliente Final” quando não há SMS).  
4. Definir artigos, preços, modelagem se necessário.  
5. Emitir pro-forma / factura / recibo conforme o caso.  
6. Acompanhar pedidos em `/admin/pedidos`.  
7. No fecho: **Caixa** → fechar turno e conferir totais.

**Boas práticas**

- Não avançar estados de produção sem alinhamento com o designer.  
- Confirmar telefone/email válidos se fores avisar o cliente (painel **Avisar cliente** no pedido: WhatsApp, SMS ou email). O SMS pode ser **manual** ou **automático** em `/admin/notificacoes` → Configuração Twilio.  
- Usar cliente genérico só quando não há contacto real.

### 5.3 Designer

1. Login → `/admin/designer` (fila de trabalho).  
2. Abrir pedido → modelagem / arte.  
3. Actualizar estados em `/admin/pedidos` (aprovado → produção → finalizado, conforme processo da loja).  
4. Gerir **Modelos** e **Galeria** quando o admin pedir.

### 5.4 Administrador

#### Arranque / manutenção do negócio

1. **Utilizadores** — criar atendentes e designers com papel correcto.  
2. **Configurações → Empresa** — nome, NIF, morada, contactos (aparecem em documentos).  
3. **Pagamentos / comprovantes / sistema** — métodos, email, MFA.  
4. **Produtos** — catálogo e matriz (secção 6).  
5. **Insumos** — stock de consumíveis.  
6. **Backups** — Configurações → Backups + cron no servidor (secção 8).

#### Pedidos e financeiro

- Vista global em `/admin/pedidos`.  
- Relatórios e razão em `/admin/relatorios` e `/admin/financeiro`.  
- SMS falhados em `/admin/notificacoes`.

---

## 6. Catálogo e matriz de activação (Admin)

Entrada: **Admin → Produtos** (`/admin/produtos`).

### Vestuário

Separadores típicos:

- **Matriz** — activar / desactivar unidades (cor × processo × tamanho × grade)  
- **Preços** — tabela de preços por cor / processo / faixa etária / marca  
- **Ferramentas** — geração em massa de variantes  

**Como usar a matriz (fluxo actual)**

1. Seleccionar o produto e a grade (modelo).  
2. Marcar ou desmarcar checkboxes à vontade — a página **não recarrega**.  
3. Células alteradas ficam destacadas.  
4. Clicar **Guardar matriz** para aplicar tudo de uma vez (ou **Descartar**).  
5. **Activar tudo** numa cor prepara o rascunho dessa linha; ainda precisa de **Guardar matriz**.

Sem preço no separador **Preços**, não se cria SKU nova ao activar.

### Lona / Vinil e outros

Painéis de variantes com preço por m² ou SKU; podem gerar matriz predefinida e activar/desactivar por linha.

### Recomendação de catálogo

- Definir preços **antes** de activar a matriz em volume.  
- Evitar mudanças grandes de matriz a meio do dia de vendas.  
- Depois de instalar vestuário completo, rever cor a cor o que deve estar público.

---

## 7. Desenvolvimento local

Atalho Windows: `dev.bat` (opções em `scripts/dev.ps1`).  
Detalhe completo: [`SETUP.md`](SETUP.md).

Resumo:

```bash
# Postgres
cd backend && docker compose up -d

# API
cd backend/api
cp env.sample .env
npm install && npm run prisma:generate && npm run prisma:migrate
npm run start:dev

# Frontend (raiz do repo)
cp .env.example .env.local
npm install && npm run dev
```

- Frontend: http://localhost:3000  
- API: http://localhost:4000/api  
- Mailpit (opcional): http://localhost:8025  

---

## 8. Produção — operação

### Localização

| Item | Valor |
|------|--------|
| Código | `/opt/dadiva` |
| Domínio | https://graficadadiva.com |
| Compose | `backend/docker-compose.prod.yml` + `.env.prod` |
| Contentores | `dadiva-postgres`, `dadiva-api`, `dadiva-frontend`, `dadiva-ai` |
| Backups | `/var/backups/dadiva` |

### Actualizar (deploy)

```bash
ssh root@95.217.219.254
cd /opt/dadiva
git pull --ff-only
cd backend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -fsS http://127.0.0.1:3000/api/health/ready
```

### Backups

```bash
cd /opt/dadiva
bash deploy/install-backups.sh   # cron PG + uploads
# Manual:
bash deploy/backup-postgres.sh
bash deploy/backup-uploads.sh
```

Na UI: **Admin → Configurações → Backups** (download no browser).  
**Copiar periodicamente** `/var/backups/dadiva` para disco externo / nuvem.

### Logs e saúde

```bash
docker logs --tail 100 dadiva-api
docker logs --tail 100 dadiva-frontend
curl -fsS https://graficadadiva.com/api/health/ready
```

### Smoke test

```bash
SMOKE_BASE=https://graficadadiva.com \
SMOKE_EMAIL=… SMOKE_PASSWORD=… \
node deploy/smoke-go-live.mjs
```

---

## 9. Segurança e configuração crítica

1. Firewall pública: só **22**, **80**, **443** (API/PG/IA **não** expostos).  
2. Secrets só em `backend/.env.prod` (nunca no Git).  
3. MFA nos admins: Configurações → Sistema; depois avaliar `MFA_REQUIRE_ADMIN=true`.  
4. SMTP real para recuperação de password.  
5. Twilio pago + Sender ID conforme [`TWILIO-SMS-ANGOLA.md`](TWILIO-SMS-ANGOLA.md).  
6. Contas staff com palavra-passe forte; papéis mínimos necessários.

---

## 10. Resolução rápida de problemas

| Sintoma | O que verificar |
|---------|-----------------|
| Site offline | `docker ps`, Caddy/nginx, DNS |
| Login falha | API healthy, cookies HTTPS, MFA |
| Matriz “salta” / perde scroll | Confirmar versão ≥ commit da matriz em lote; usar **Guardar matriz** |
| SMS não chega | Modo SMS (manual/automático) em `/admin/notificacoes`; Twilio; telefone válido; painel Avisar cliente |
| Preço errado no pedido | Separador Preços do produto + variante activa |
| Modelagem sem cor | Metadata / cor da variante no catálogo |
| Espaço em disco | Limpar imagens Docker antigas; rotação de backups |

---

## 11. Checklist de formação (equipa)

- [ ] Atendente: abrir caixa → 1 venda balcão → documento → fechar caixa  
- [ ] Designer: 1 pedido da fila → modelagem → mudança de estado  
- [ ] Admin: criar utilizador; activar 3 células na matriz e **Guardar**; backup manual  
- [ ] Cliente teste: registo → pedido → modelagem → submissão  
- [ ] Confirmar SMS (ou decisão consciente de cliente sem SMS)

---

## 12. Índice técnico do repositório

```
/
├── app/                 # Páginas Next.js (public | client | staff)
├── components/          # UI (admin, pedidos, modelagem, …)
├── lib/                 # Rotas, catálogo, API client, regras
├── backend/
│   ├── api/             # NestJS + Prisma
│   ├── ai-service/      # FastAPI (opcional)
│   └── docker-compose.prod.yml
├── deploy/              # Caddy, backups, smoke, check-env
├── docs/                # Esta documentação
└── scripts/             # dev.ps1 / stop / utilitários
```

---

*Última actualização alinhada ao fluxo de matriz em lote (Guardar matriz) e deploy em graficadadiva.com.*
