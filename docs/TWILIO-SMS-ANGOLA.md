# Twilio SMS — Angola (Gráfica Dádiva)

Guia para configurar SMS de **pedido finalizado** com remetente credível em Angola.

---

## Problemas da conta Trial com número +1 (EUA)

| O que o cliente vê | Porquê |
|--------------------|--------|
| Remetente **+1 743…** | Número americano da Twilio |
| Texto **"Sent from your Twilio trial account"** | Obrigatório em contas **Trial** |
| Desconfiança / parece spam | Combinacao número estrangeiro + trial |

**Solução:** conta **paga** + **Sender ID alfanumérico** `GRAF DADIVA` (máx. 11 caracteres, **canal único** — o cliente não pode responder).

---

## Canal único (sem resposta)

Os SMS de **pedido finalizado** são **só de envio** (notificações):

| Configuração | Efeito |
|--------------|--------|
| `TWILIO_SMS_FROM=GRAF DADIVA` | Sender **alfanumérico** — tecnicamente **impossível** responder no telemóvel |
| Remetente numérico (`+244…`, `+1…`) | **Bloqueado** pela API — permite resposta e não é usado |
| Texto da mensagem | Inclui *«Canal informativo — não responda a este SMS.»* |

Na Twilio **não configures** webhook de SMS entrante nos números da conta — a app não processa respostas.

---

## Passo 1 — Upgrade da conta (remove aviso Trial)

1. Entra em [console.twilio.com](https://console.twilio.com/)
2. Menu **Billing** (ou ícone de cartão) → **Upgrade your account**
3. Adiciona método de pagamento e confirma
4. Aguarda activação (normalmente imediata)

> Depois disto, desaparece o prefixo *"Sent from your Twilio trial account"* nas mensagens.

---

## Passo 2 — Activar Sender ID alfanumérico

1. Twilio Console → **Messaging** → **Settings** → **General**
2. Em **Alphanumeric Sender ID**, activa a opção (Enable)
3. Guarda

---

## Passo 3 — Remetente «Gráfica Dádiva»

A Twilio limita o **nome que aparece no telemóvel** a **11 caracteres** (sem acentos). Por isso usamos `GRAF DADIVA` como sender; o texto da mensagem usa o nome completo **Gráfica Dádiva**.

### Angola: registo Trust Hub **não é obrigatório**

Na consola Twilio, ao escolher **Angola** em «Where is your HQ?» e «Where are your customers?», aparece:

> *Registration not required. You are not required to register Alphanumeric Sender IDs in this country.*

**O que fazer:**
1. Podes **fechar** este assistente ou clicar **Next** até sair — **não precisas** de submeter registo na Trust Hub para Angola.
2. Confirma que o **Passo 2** está feito (Alphanumeric Sender ID activado em Messaging → Settings).
3. Define directamente na aplicação: `TWILIO_SMS_FROM=GRAF DADIVA` (Passo 4).
4. O sender `GRAF DADIVA` é usado **dinamicamente** em cada envio (11 caracteres, com letras).

Documentação Twilio: [Alphanumeric Sender ID](https://www.twilio.com/docs/glossary/what-alphanumeric-sender-id)

### Outros países (só se enviares SMS fora de Angola)

Se no futuro precisares de sender alfanumérico **registado** noutro mercado:

1. Console → **Trust Hub** → **Registrations**
2. Separador **Alphanumeric Sender IDs** → **Create registration**
3. Preenche país, tipo de mensagem (Notifications / Transactional), sender pedido e dados da empresa
4. Aguarda aprovação (horas a dias úteis)

Para **Gráfica Dádiva** (clientes em Angola), este fluxo **não se aplica**.

---

## Passo 4 — Configurar a aplicação (`.env`)

Edita `backend/api/.env`:

```env
TWILIO_SMS_ENABLED=true
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_SMS_FROM=GRAF DADIVA
```

**Importante:**
- `TWILIO_SMS_FROM=GRAF DADIVA` — **sem aspas**, exactamente assim (11 caracteres, com letras)
- Em Angola **não** é necessário registo prévio na Trust Hub — o sender é dinâmico
- Não uses o número +1 depois de configurar o sender alfanumérico
- Reinicia a API: `npm run start:dev` em `backend/api`

---

## Passo 5 — Verificar números de teste (conta Trial)

Enquanto a conta for Trial, só podes enviar para **números verificados**:

1. Console → **Phone Numbers** → **Verified Caller IDs**
2. **Add a new Caller ID** → introduz o telemóvel angolano (+244…)
3. Confirma o código SMS recebido

Com conta **paga**, podes enviar para qualquer número angolano válido (sujeito a permissões geo).

---

## Passo 6 — Permissões geográficas (Angola)

1. Console → **Messaging** → **Settings** → **Geo permissions**
2. Confirma que **Angola** está permitido para SMS outbound
3. Guarda

---

## Passo 7 — Telefone da loja na mensagem

A mensagem inclui o contacto da empresa. Configura em:

- **Admin → Configurações → Perfil da empresa** → Telefone  
  (formato: `923865632` ou `+244 923 865 632`)

Exemplo de SMS após configuração correcta:

> Gráfica Dádiva: o pedido DG-2026-00003 está finalizado e pronto para recolha. Contacto: +244 923 865 632. Canal informativo — não responda a este SMS.

---

## Passo 8 — Testar

1. Reinicia a API
2. No arranque, confirma no log: `Twilio SMS activo (remetente: "GRAF DADIVA")`
3. Marca um pedido como **Finalizado** (cliente com telefone +244 válido)
4. Verifica em **Admin → SMS · pedido finalizado** (`/admin/notificacoes`)

API de diagnóstico (com login admin):

```
GET http://localhost:4000/api/notifications/sms/status
```

Resposta esperada:

```json
{
  "enabled": true,
  "smsFrom": "GRAF DADIVA",
  "senderKind": "alphanumeric",
  "recommendedForAngola": true,
  "oneWayChannel": true,
  "warnings": []
}
```

---

## Resolução de problemas

| Sintoma | Acção |
|---------|--------|
| `Twilio SMS inactivo` | Confirma `.env` em `backend/api/` e reinicia API |
| Sender ID rejeitado | Usa só A–Z, 0–9 e espaços; máx. 11 chars; inclui letras |
| Trust Hub pede registo | Em Angola a Twilio indica «Registration not required» — ignora e usa `.env` |
| SMS não chega | Verifica Geo permissions Angola; número verificado (Trial) |
| Ainda aparece +1 | Confirma `TWILIO_SMS_FROM=GRAF DADIVA` e reinicia API |
| Ainda aparece "trial account" | Faz upgrade Billing (Passo 1) |

---

## Segurança

- Nunca commits `TWILIO_AUTH_TOKEN` no Git
- Se o token foi exposto, roda em **Account → API keys & tokens → Auth Token → Rotate**
