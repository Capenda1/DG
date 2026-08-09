# Dádiva Go — Plano de evolução em fases

Plano prático para evoluir a plataforma com foco em entrega contínua, segurança e valor de negócio.

---

## 1) Objetivo do plano

Evoluir o sistema em ciclos curtos, reduzindo risco técnico e entregando funcionalidades utilizáveis em cada fase, sem perder qualidade operacional.

Princípios:

- Segurança e dados primeiro.
- Entregar valor incremental (não esperar "produto perfeito").
- Cada fase com critérios claros de entrada e saída.
- Medir resultado (tempo, qualidade, retrabalho, satisfação).

---

## 2) Fase 0 — Estabilização base (1 a 2 semanas)

**Objetivo:** preparar a base para crescer sem acumular dívida crítica.

### Entregas

- Revisão de ambiente e configuração:
  - padronizar `env.sample` e `docker-compose.yml`;
  - validar variáveis obrigatórias no bootstrap da API.
- Endurecimento de segurança inicial:
  - bloquear uso de `JWT_SECRET` default em produção;
  - revisar CORS e políticas de cookies/tokens.
- Limpeza de organização:
  - padronizar estrutura de pastas e scripts;
  - validar que artefatos locais (`node_modules`, `.env`) não entram em versionamento.
- Documentação técnica mínima:
  - guia de setup local;
  - mapa rápido de módulos (`frontend`, `api`, `ai-service`).

### Critérios de saída

- Projeto sobe localmente com passos reproduzíveis.
- Configuração insegura falha de forma explícita.
- Time consegue iniciar o projeto sem suporte direto.

---

## 3) Fase 1 — Segurança e domínio de pedidos (2 a 4 semanas)

**Objetivo:** garantir que o núcleo (auth + pedidos) está correto para uso real.

### Entregas

- Autorização por contexto (RBAC inicial):
  - cliente vê apenas os próprios pedidos;
  - designer vê pedidos atribuídos;
  - admin com visão global controlada.
- Correção de listagens e consultas sensíveis:
  - evitar exposição cruzada de dados;
  - revisar filtros em endpoints críticos.
- Evolução do módulo de pedidos:
  - estados mínimos bem definidos (rascunho, revisão, aprovado, produção, entregue);
  - transições com validação de regra.
- Testes essenciais:
  - e2e para auth e isolamento de dados;
  - unitários de serviços críticos (`AuthService`, `OrdersService`).

### Critérios de saída

- Nenhum utilizador autenticado acessa dados de outro sem permissão.
- Fluxo básico de pedido funciona de ponta a ponta na API.
- Testes críticos passam no ambiente local e CI.

---

## 4) Fase 2 — Experiência de produto (MVP utilizável) (3 a 6 semanas)

**Objetivo:** colocar nas mãos do utilizador uma experiência funcional e coerente.

### Entregas

- Frontend com jornadas principais:
  - login/registro;
  - lista e detalhe de pedidos;
  - criação de pedido (versão simplificada).
- Comunicação frontend-backend robusta:
  - cliente HTTP padronizado;
  - tratamento de expiração e refresh de token;
  - estados de loading/erro consistentes.
- Colaboração inicial cliente-designer:
  - comentários por pedido;
  - histórico simples de interações.
- UX de operação:
  - feedback de status claro;
  - mensagens de erro orientadas à ação.

### Critérios de saída

- Utilizador cria pedido e acompanha seu estado pelo front.
- Fluxos principais sem bloqueios críticos de UX.
- Time de negócio consegue demonstrar MVP para validação externa.

---

## 5) Fase 3 — Produção e rastreabilidade (3 a 5 semanas)

**Objetivo:** consolidar o fluxo operacional gráfico com auditabilidade.

### Entregas

- Máquina de estados mais completa para produção.
- Trilhas de auditoria:
  - quem aprovou;
  - quando mudou estado;
  - qual versão de arte foi liberada.
- Painel operacional:
  - fila por prioridade e prazo;
  - filtros por etapa e responsável.
- Notificações:
  - eventos principais (aprovação, produção, envio).

### Critérios de saída

- Pedido possui histórico rastreável fim a fim.
- Produção trabalha com versão de arte correta e validada.
- Gestão consegue medir gargalos por etapa.

---

## 6) Fase 4 — IA e diferenciação do produto (4 a 8 semanas)

**Objetivo:** transformar o serviço de IA em vantagem real de negócio.

### Entregas

- Definição de contratos entre API e `ai-service`.
- Casos de uso IA priorizados:
  - validação automática de arte (resolução, área segura, qualidade);
  - sugestões assistidas de ajuste.
- Segurança e governança:
  - autenticação serviço-a-serviço;
  - limites de uso/custo;
  - logs e monitoramento de chamadas.
- UX assistida:
  - recomendações explicáveis para o utilizador.

### Critérios de saída

- IA gera benefício mensurável (menos retrabalho, mais velocidade).
- Operação de IA está previsível em custo e estabilidade.

---

## 7) Fase 5 — Escala e operação contínua (contínua)

**Objetivo:** sustentar crescimento com confiabilidade.

### Entregas

- Observabilidade:
  - logs estruturados;
  - métricas de latência/erro;
  - alertas de saúde.
- Performance:
  - otimização de consultas Prisma;
  - cache em pontos de leitura intensiva;
  - revisão de payloads e paginação.
- Governança de engenharia:
  - CI/CD com gates (lint, testes, build);
  - convenções de PR e checklist de release.
- Segurança contínua:
  - revisão de dependências;
  - rotação de segredos;
  - políticas de acesso por ambiente.

### Critérios de saída

- Releases frequentes com baixa taxa de regressão.
- Incidentes reduzem e tempo de recuperação melhora.

---

## 8) Backlog técnico transversal (executar em paralelo)

- Padronização de erros e códigos de resposta da API.
- Migrações Prisma com estratégia de rollback.
- Versionamento de API e contratos (quando necessário).
- Estrutura de testes por camadas (unit, integração, e2e).
- Cobertura mínima alvo por módulo crítico.

---

## 9) Métricas de sucesso (KPIs)

Produto e operação:

- Lead time do pedido.
- Taxa de retrabalho por arte.
- Tempo médio por etapa do fluxo.
- SLA de entrega cumprido.

Qualidade e engenharia:

- Falhas por release.
- Cobertura de testes críticos.
- MTTR (tempo médio de recuperação).
- Percentual de deploys com rollback.

---

## 10) Sequência recomendada (resumo executivo)

1. **Fase 0 + Fase 1**: corrigir base e segurança do domínio.
2. **Fase 2**: entregar MVP funcional para validação real.
3. **Fase 3**: consolidar operação e rastreabilidade.
4. **Fase 4**: evoluir IA com foco em ROI.
5. **Fase 5**: escalar com previsibilidade e qualidade contínua.

---

## 11) Como eu executaria na prática

- Sprint de 2 semanas.
- Planeamento com máximo de 2 objetivos por sprint.
- Demo de negócio ao final de cada sprint.
- Retrospectiva com ações técnicas obrigatórias.
- Repriorização quinzenal baseada em KPI e feedback real de utilizadores.

---

*Documento orientador. Pode ser revisto a cada ciclo de sprint conforme evolução do produto e capacidade da equipa.*
