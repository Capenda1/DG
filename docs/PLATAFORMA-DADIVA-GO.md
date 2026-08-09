# Dádiva_Go — Sistema integrado de personalização de t-shirts, design colaborativo e logística gráfica

Documento vivo de visão e escopo. Descreve o produto-alvo; partes da app (ex.: área cliente com pedidos) podem já existir sem este documento listar cada commit.

---

## 1. Introdução

**Dádiva_Go** é uma plataforma **SaaS** dirigida a **indústrias gráficas de vestuário** que trabalham com **sublimação** e **DTF (Direct to Film)**. O objetivo central é **reduzir retrabalho, ambiguidade e falhas de comunicação** entre **clientes finais**, **designers** e **produção**, integrando:

- um **editor de personalização com visualização 3D de alta fidelidade** (pré-visualização próxima ao resultado físico);
- um **módulo de consultoria técnica** em que designers acompanham, orientam e **validam** artes antes da produção;
- um **sistema de rastreabilidade ponta a ponta**, do pedido à entrega, com visibilidade adequada a cada perfil.

A proposta de valor para a gráfica (**Dádiva Go**): o cliente pode **criar ou adaptar artes remotamente**, **pedir apoio de design**, **acompanhar o estado do trabalho** (incluindo momentos-chave na fábrica, quando aplicável) e receber peças com **menos erros de especificação** e **histórico auditável** de decisões e aprovações.

---

## 2. Contexto técnico de negócio (resumo)

| Tecnologia | Papel na plataforma |
|------------|---------------------|
| **Sublimação** | Arte e cores precisam respeitar limites de substrato, área de impressão, costuras e “zonas seguras”; o editor e a consultoria devem refletir essas restrições. |
| **DTF** | Fluxo de arquivo, transparência, área útil e orientação podem diferir da sublimação; o sistema deve suportar **perfis de produção** (ou equivalente) por processo. |

A plataforma não substitui o RIP nem as máquinas; **integra-se** ao fluxo operacional da gráfica com **especificações claras**, **aprovações** e **estados de pedido** alinhados à produção real.

---

## 3. Objetivos de produto

1. **Personalização guiada** — Cliente monta o visual dentro de regras técnicas (gabaritos, áreas imprimíveis, paletas quando necessário).
2. **Colaboração cliente ↔ designer** — Canal estruturado (comentários, versões, solicitação de ajustes) em vez de troca informal só por WhatsApp/e-mail.
3. **Gate de qualidade** — Designer (ou papel equivalente) **aprova** arte e libera **envio à produção** com registro de quem aprovou e quando.
4. **Transparência operacional** — Cliente **acompanha** o pedido em tempo quase real ou por marcos definidos (ex.: “em fila de impressão”, “em acabamento”, “despachado”).
5. **Menos retrabalho** — Uma única fonte de verdade para arquivo final aprovado, dimensões e processo (sublimação vs DTF).

---

## 4. Perfis de usuário (alto nível)

| Perfil | Necessidades principais |
|--------|-------------------------|
| **Cliente (B2B ou B2C conforme modelo da gráfica)** | Ver §4.1 — criar/editar visual, mockup 3D, pedir ajuda, acompanhar pedido, notificações. |
| **Designer / consultor técnico** | Ver pedidos atribuídos, orientar, ajustar ou solicitar alterações, **aprovar** arte para produção. |
| **Produção / operador** | Ver fila, especificações e arquivo aprovado; atualizar estados; eventualmente sinalizar problema (bloqueio, reimpressão). |
| **Administrador da gráfica** | Configurar produtos, processos, preços, SLAs, utilizadores, integrações e políticas de aprovação. |

*(Os nomes exatos dos papéis podem ser ajustados ao organograma da Dádiva Go.)*

### 4.1 Visão da área **Cliente** (B2B / B2C)

A mesma plataforma serve **cliente empresarial (B2B)** ou **cliente final (B2C)** consoante o **modelo comercial e operacional da gráfica** (contratos, revenda, loja online, eventos, etc.). O perfil **Cliente** na aplicação concentra-se em cinco pilares:

1. **Criar e editar o visual** — Personalização dentro das regras da peça e do processo (sublimação / DTF): composição 2D, uploads, texto e validações orientativas (área segura, resolução), como descrito em §5.1 e §5.2.
2. **Ver mockup 3D** — Pré-visualização de alta fidelidade suficiente para decisão antes de submeter ou pedir revisão (detalhe técnico em §5.2 e roadmap de requisitos em §10).
3. **Pedir ajuda** — Canal estruturado para **consultoria do designer**: comentários, pedido de ajustes e iteração até versão acordada (§5.3, §6.2), sem depender só de canais informais.
4. **Acompanhar o pedido** — Visibilidade de **estados** e marcos (design, aprovação, fila, produção, envio, entrega), alinhados ao modelo de dados e à máquina de estados do pedido (§5.4, §5.5).
5. **Receber notificações** — Alertas em **marcos relevantes** (nova mensagem ou versão, aprovação, entrada em produção, expedição, etc.), **in-app** e, conforme política da gráfica, **e-mail** ou outros canais (§5.6).

**Implementação incremental sugerida:** começar por **acompanhamento de pedidos** e **notificações in-app**; em paralelo ou a seguir, **editor + 3D** e **threads de ajuda/aprovação** ligadas às versões de arte.

---

## 5. Módulos funcionais

### 5.1 Catálogo e configuração de produto

- Tipos de peça (t-shirt, modelo, tamanhos, cores de base).
- **Áreas de impressão** e gabaritos por processo (sublimação / DTF).
- Opcionais: limites de resolução, perfis de cor orientativos, instruções da gráfica por SKU.

### 5.2 Editor de personalização e visualização 3D

- Composição 2D (upload, texto, elementos) mapeada para **UV** ou superfície da peça.
- **Pré-visualização 3D** com fidelidade suficiente para decisão do cliente (iluminação, drapeado simplificado ou avançado — a definir em fase de requisitos detalhados).
- Validações em tempo de edição: saída da área segura, resolução insuficiente, contraste ilegível (avisos, não necessariamente bloqueios rígidos em todos os casos).

### 5.3 Design colaborativo e aprovação

- **Threads** por pedido ou por arte (comentários, anexos de referência).
- **Versões** de arte (rascunho → revisão → aprovada).
- Estados explícitos: ex. *Em edição pelo cliente*, *Aguardando designer*, *Ajustes solicitados*, *Aprovada para produção*.
- Ação formal: **“Aprovar e enviar para produção”** com trilha de auditoria (utilizador, data/hora, versão do ficheiro).

### 5.4 Produção e logística gráfica

- **Painel de fila** por prioridade, data prometida ou processo.
- Transições de estado alinhadas ao chão de fábrica (configuráveis).
- Ligação ao **artefacto aprovado** (não permitir produção de versão não aprovada sem override administrativo, se existir política para exceções).
- Expedição: etiquetas, transportadora, código de rastreio (se aplicável).

### 5.5 Rastreabilidade ponta a ponta

- Identificador único de pedido e de **versão de arte**.
- Histórico imutável ou append-only de eventos: criação, uploads, mensagens relevantes, aprovações, mudanças de estado na produção, envio.
- Relatórios para a gráfica: tempos por etapa, taxa de retrabalho, motivos de bloqueio.

### 5.6 Notificações e comunicação

- Notificar cliente e designer em marcos (nova mensagem, aprovação, entrada em produção, envio).
- Canais: e-mail, in-app; SMS/WhatsApp **opcional** e sujeito a política e integrações.

---

## 6. Fluxos principais (narrativa)

### 6.1 Cliente cria em casa

1. Escolhe produto e processo (sublimação ou DTF, conforme disponível).
2. Personaliza no editor com preview 3D.
3. Submete **rascunho** ou **pedido** (conforme modelo comercial: pagamento antes ou depois da aprovação — a definir).

### 6.2 Cliente pede ajuda ao design

1. Solicita consultoria; pedido entra na fila do designer.
2. Designer comenta, propõe ajustes ou altera (conforme permissões).
3. Cliente aceita ou itera até versão acordada.

### 6.3 Aprovação e produção

1. Designer executa **aprovação técnica** e libera produção.
2. Operador vê especificações e arquivo aprovado; atualiza estados até conclusão/expedição.
3. Cliente acompanha no painel (e por notificações).

---

## 7. Requisitos não funcionais (rascunho)

- **Disponibilidade** e desempenho adequados a SaaS (metas numéricas a fixar).
- **Segurança**: autenticação, autorização por papel, proteção de dados pessoais e de ficheiros de clientes.
- **Escalabilidade** do editor e dos assets (armazenamento, CDN — a detalhar).
- **Auditabilidade** de aprovações e mudanças de estado.
- **Usabilidade** para utilizadores não técnicos no lado cliente.

---

## 8. Integrações (a decidir)

Possíveis frentes, sem compromisso nesta fase:

- ERP / gestão da gráfica, stock, faturação.
- Transportadoras e rastreio.
- Pagamentos (se B2C ou pré-pagamento online).
- Armazenamento de ficheiros e antivírus/validação de uploads.

---

## 9. Fora de escopo inicial (sugestão explícita)

- Substituir software RIP ou drivers de impressoras.
- Garantir correspondência pixel-perfect sem calibração física — a plataforma deve **informar** e **aproximar**, com aprovação humana no processo gráfico.

---

## 10. Próximos passos de documentação (antes de código)

1. **Personas** e **jornadas** detalhadas (1–2 páginas cada).
2. **Glossário** Dádiva (nomes de estados, tipos de pedido, tipos de ficheiro aceites).
3. **Matriz de permissões** (RBAC) por ação e por módulo.
4. **Diagrama de estados** do pedido e da arte (máquina de estados).
5. **Requisitos do editor 3D**: nível de fidelidade, dispositivos suportados, offline ou apenas online.
6. **Modelo de dados conceitual** (entidades: Pedido, Arte, Versão, Utilizador, Evento, Produto, etc.).
7. **Critérios de aceitação** por épico (testáveis).

---

## 11. Glossário rápido

- **Sublimação** — Transferência de tinta por calor para substratos adequados; afeta cor, branco e áreas de impressão.
- **DTF** — Impressão em filme com pós-colagem na peça; regras de arte e acabamento próprias.
- **SaaS** — Software as a Service; multi-cliente com subscrição ou contrato, conforme modelo comercial da Dádiva Go.

---

*Última atualização: documento inicial de alinhamento de produto. Revisões devem versionar alterações na secção 10 ou em changelog no repositório, quando existir.*
