import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "MANUAL-UTILIZADOR-DADIVA-GO.pdf");
const doc = new jsPDF({ unit: "mm", format: "a4" });

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const GOLD = [201, 151, 44];
const DARK = [28, 28, 28];
const MUTED = [90, 90, 90];
let y = MARGIN;

function addHeaderFooter(pageNumber) {
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 12, PAGE_W - MARGIN, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("DÁDIVA GO", MARGIN, 9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text("Manual de Utilizador", PAGE_W - MARGIN, 9, { align: "right" });
  doc.text(`Página ${pageNumber}`, PAGE_W - MARGIN, PAGE_H - 9, {
    align: "right",
  });
  doc.text("graficadadiva.com", MARGIN, PAGE_H - 9);
}

function newPage() {
  doc.addPage();
  y = 20;
}

function ensureSpace(height = 12) {
  if (y + height > PAGE_H - 18) newPage();
}

function heading(text, level = 1) {
  const sizes = { 1: 18, 2: 14, 3: 11.5 };
  const before = level === 1 ? 7 : level === 2 ? 5 : 3;
  const after = level === 1 ? 4 : 2.5;
  ensureSpace(level === 1 ? 38 : before + sizes[level] * 0.5 + after + 10);
  y += before;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(sizes[level]);
  doc.setTextColor(level === 1 ? GOLD[0] : DARK[0], level === 1 ? GOLD[1] : DARK[1], level === 1 ? GOLD[2] : DARK[2]);
  doc.text(text, MARGIN, y);
  y += sizes[level] * 0.45 + after;
  if (level === 1) {
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.35);
    doc.line(MARGIN, y - 2, PAGE_W - MARGIN, y - 2);
  }
}

function paragraph(text, options = {}) {
  const fontSize = options.fontSize ?? 10;
  const lineHeight = options.lineHeight ?? 5;
  const indent = options.indent ?? 0;
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...(options.color ?? DARK));
  const lines = doc.splitTextToSize(text, CONTENT_W - indent);
  ensureSpace(lines.length * lineHeight + 2);
  doc.text(lines, MARGIN + indent, y);
  y += lines.length * lineHeight + (options.after ?? 2);
}

function bullet(text, number = null) {
  const marker = number === null ? "•" : `${number}.`;
  const lines = doc.splitTextToSize(text, CONTENT_W - 10);
  ensureSpace(lines.length * 5 + 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GOLD);
  doc.text(marker, MARGIN + 2, y);
  paragraph(text, { indent: 10, after: 1.5 });
}

function note(title, text) {
  const lines = doc.splitTextToSize(text, CONTENT_W - 12);
  const height = 11 + lines.length * 4.5;
  ensureSpace(height + 3);
  doc.setFillColor(249, 246, 237);
  doc.setDrawColor(...GOLD);
  doc.roundedRect(MARGIN, y, CONTENT_W, height, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(title, MARGIN + 5, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(lines, MARGIN + 5, y + 11);
  y += height + 4;
}

function table(head, body, widths) {
  ensureSpace(30);
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: DARK,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: DARK,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: widths,
  });
  y = doc.lastAutoTable.finalY + 5;
}

// Capa
doc.setFillColor(...DARK);
doc.rect(0, 0, PAGE_W, PAGE_H, "F");
doc.setFillColor(...GOLD);
doc.rect(0, 0, 10, PAGE_H, "F");
doc.setFont("helvetica", "bold");
doc.setFontSize(16);
doc.setTextColor(...GOLD);
doc.text("DÁDIVA GO", 24, 45);
doc.setFontSize(32);
doc.setTextColor(255, 255, 255);
doc.text("Manual de", 24, 86);
doc.text("Utilizador", 24, 100);
doc.setFont("helvetica", "normal");
doc.setFontSize(12);
doc.setTextColor(210, 210, 210);
doc.text("Cliente • Atendente • Designer • Administrador", 24, 116);
doc.setDrawColor(...GOLD);
doc.setLineWidth(1);
doc.line(24, 126, 105, 126);
doc.setFontSize(11);
doc.text("Plataforma de gestão da Gráfica Dádiva", 24, 140);
doc.text("https://graficadadiva.com", 24, 148);
doc.setFontSize(9);
doc.setTextColor(150, 150, 150);
doc.text("Versão 1.0 • Agosto de 2026", 24, 276);

newPage();

heading("Índice", 1);
table(
  ["Secção", "Conteúdo"],
  [
    ["1", "Introdução e acesso"],
    ["2", "Papéis e permissões"],
    ["3", "Ciclo de vida do pedido"],
    ["4", "Manual do Cliente"],
    ["5", "Manual do Atendente / Balcão"],
    ["6", "Manual do Designer"],
    ["7", "Manual do Administrador"],
    ["8", "Produtos e matriz de activação"],
    ["9", "Caixa, facturação e SMS"],
    ["10", "Boas práticas e resolução de problemas"],
    ["11", "Checklist de formação"],
  ],
  { 0: { cellWidth: 22 }, 1: { cellWidth: 152 } },
);

heading("1. Introdução e acesso", 1);
paragraph(
  "O Dádiva Go centraliza pedidos online e de balcão, modelagem, produção, caixa, facturação, catálogo, stock e comunicação com clientes.",
);
note(
  "Endereço oficial",
  "Aceda sempre por https://graficadadiva.com. Clientes entram na página inicial; colaboradores usam /admin/login.",
);
heading("Entrar no sistema", 2);
bullet("Cliente: abrir graficadadiva.com, inserir as credenciais ou criar uma conta.", 1);
bullet("Colaborador: abrir graficadadiva.com/admin/login e usar a conta atribuída pelo administrador.", 2);
bullet("Se esquecer a palavra-passe, usar Recuperar palavra-passe no ecrã de login.", 3);
bullet("Nunca partilhar palavra-passe ou código MFA com outra pessoa.", 4);

heading("2. Papéis e permissões", 1);
table(
  ["Papel", "Principais funções"],
  [
    ["Cliente", "Criar e acompanhar os próprios pedidos; preparar modelagem."],
    ["Atendente", "Balcão, pedidos, caixa, documentos e histórico de SMS."],
    ["Designer", "Fila de arte, modelagem, estados de produção, modelos e galeria."],
    ["Administrador", "Acesso completo, incluindo catálogo, stock, RH, utilizadores, finanças e backups."],
  ],
  { 0: { cellWidth: 35 }, 1: { cellWidth: 139 } },
);
note(
  "Princípio de segurança",
  "Cada colaborador deve usar a sua própria conta e apenas o papel necessário para o seu trabalho.",
);

heading("3. Ciclo de vida do pedido", 1);
table(
  ["Estado", "Significado"],
  [
    ["Rascunho", "Pedido ainda em edição."],
    ["Submetido", "Pedido enviado pelo cliente ou balcão."],
    ["Validação e pagamento", "A loja confere dados e pagamento."],
    ["Aprovado", "Pedido autorizado para seguir."],
    ["Em produção", "Trabalho em execução."],
    ["Finalizado", "Produção concluída."],
    ["Entregue", "Pedido entregue ao cliente."],
    ["Cancelado", "Pedido interrompido; o motivo deve ser registado."],
  ],
  { 0: { cellWidth: 46 }, 1: { cellWidth: 128 } },
);
paragraph(
  "Fluxo normal: Rascunho > Submetido > Validação e pagamento > Aprovado > Em produção > Finalizado > Entregue.",
  { bold: true },
);
note(
  "Atenção",
  "Só avance o estado quando a etapa anterior estiver realmente concluída. Isso mantém clientes, designer, produção e caixa alinhados.",
);

heading("4. Manual do Cliente", 1);
heading("Criar um pedido", 2);
bullet("Entrar na conta e seleccionar Novo pedido.", 1);
bullet("Escolher os produtos, cores, tamanhos, processos e quantidades disponíveis.", 2);
bullet("Rever os artigos e guardar o rascunho.", 3);
bullet("Abrir Modelagem quando for necessário posicionar a arte.", 4);
bullet("Submeter o pedido e seguir as instruções de pagamento.", 5);
heading("Acompanhar o pedido", 2);
paragraph(
  "Em A minha conta > Pedidos, o cliente pode abrir o pedido e acompanhar o estado. Em caso de dúvida, deve indicar o número do pedido ao contactar a loja.",
);
heading("Modelagem", 2);
bullet("Seleccionar o artigo correcto antes de editar.", 1);
bullet("Carregar ou escolher a arte e posicioná-la na área permitida.", 2);
bullet("Confirmar cor e modelo do produto no preview.", 3);
bullet("Guardar antes de sair do editor.", 4);

heading("5. Manual do Atendente / Balcão", 1);
heading("Início do turno", 2);
bullet("Entrar em /admin/login.", 1);
bullet("Abrir Caixa e iniciar o turno com o valor real de abertura.", 2);
bullet("Confirmar que produtos e métodos de pagamento necessários estão disponíveis.", 3);
heading("Criar venda no balcão", 2);
bullet("Abrir Balcão e seleccionar um cliente existente.", 1);
bullet("Criar o cliente quando houver contacto válido. Usar Cliente Final apenas quando não houver identificação/contacto.", 2);
bullet("Adicionar artigos, variantes, quantidades e personalização.", 3);
bullet("Preparar a modelagem, quando aplicável.", 4);
bullet("Rever total, pagamento e dados do cliente antes de concluir.", 5);
bullet("Emitir o documento adequado.", 6);
heading("Fim do turno", 2);
bullet("Confirmar movimentos e pedidos do turno.", 1);
bullet("Contar os valores reais por método de pagamento.", 2);
bullet("Fechar o caixa e registar qualquer diferença com explicação.", 3);
note(
  "Cliente e SMS",
  "Confirme um telefone válido quando o cliente pretende receber notificações. O cliente genérico não deve receber SMS.",
);

heading("6. Manual do Designer", 1);
bullet("Entrar no painel e abrir a Fila de designer.", 1);
bullet("Priorizar pedidos submetidos/aprovados conforme a organização da loja.", 2);
bullet("Abrir a modelagem e confirmar produto, cor, tamanho e processo.", 3);
bullet("Preparar a arte e guardar o trabalho antes de sair.", 4);
bullet("Avançar o estado apenas quando a etapa estiver concluída.", 5);
bullet("Usar Modelos para conteúdos reutilizáveis e Galeria para imagens exibidas ao cliente.", 6);
note(
  "Coordenação",
  "Alterações importantes na arte, preço ou produto devem ser confirmadas com o atendente/admin e, quando necessário, com o cliente.",
);

heading("7. Manual do Administrador", 1);
heading("Configuração inicial", 2);
bullet("Configurações > Empresa: preencher nome, NIF, morada e contactos.", 1);
bullet("Configurar pagamentos, comprovativos, email e segurança.", 2);
bullet("Utilizadores: criar contas individuais e atribuir papéis correctos.", 3);
bullet("Produtos: rever catálogo, preços e variantes publicadas.", 4);
bullet("Insumos: registar stock inicial e manter movimentos actualizados.", 5);
bullet("Activar MFA nas contas administrativas.", 6);
heading("Rotina administrativa", 2);
bullet("Acompanhar pedidos, caixa, vendas e documentos.", 1);
bullet("Rever relatórios, financeiro e divergências.", 2);
bullet("Verificar SMS falhados e dados de contacto.", 3);
bullet("Executar e descarregar backups regularmente.", 4);

heading("8. Produtos e matriz de activação", 1);
heading("Preparar vestuário", 2);
bullet("Abrir Admin > Produtos e seleccionar o produto.", 1);
bullet("No separador Preços, preencher os preços por cor, processo, faixa e grade.", 2);
bullet("Abrir Matriz e escolher o modelo/grade.", 3);
bullet("Marcar ou desmarcar todas as unidades pretendidas.", 4);
bullet("Rever as células destacadas e clicar Guardar matriz.", 5);
paragraph(
  "A página fica fixa enquanto as unidades são alteradas. Nada é enviado até clicar em Guardar matriz. Descartar elimina as alterações ainda não guardadas.",
);
note(
  "Preço obrigatório",
  "Uma nova unidade só pode ser activada quando existe preço configurado para a combinação escolhida.",
);
heading("Lona, vinil e outros produtos", 2);
paragraph(
  "Use a matriz predefinida quando disponível ou adicione variantes manualmente. Confirme sempre unidade de preço (por unidade ou por m²), SKU e estado activo.",
);

heading("9. Caixa, facturação e SMS", 1);
heading("Documentos", 2);
table(
  ["Documento", "Quando usar"],
  [
    ["Pro-forma", "Orçamento ou documento antes da confirmação da venda."],
    ["Factura", "Documento fiscal da venda."],
    ["Recibo", "Comprovativo do pagamento recebido."],
  ],
  { 0: { cellWidth: 38 }, 1: { cellWidth: 136 } },
);
heading("Cancelamento e reabertura", 2);
paragraph(
  "Ao cancelar, registe um motivo claro. O sistema deve repor/estornar os movimentos aplicáveis. A reabertura só deve ocorrer quando autorizada e devidamente justificada.",
);
heading("SMS", 2);
paragraph(
  "Consulte Notificações para confirmar envios e falhas. Antes de reenviar, corrija o telefone do cliente e confirme que o número é válido.",
);

heading("10. Boas práticas e resolução de problemas", 1);
table(
  ["Situação", "Acção recomendada"],
  [
    ["Não consegue entrar", "Confirmar endereço, email e palavra-passe; usar recuperação; contactar admin."],
    ["Pedido com preço errado", "Rever preço e variante do produto antes de avançar."],
    ["Cor/modelo errado na modelagem", "Confirmar variante e metadados do artigo."],
    ["SMS falhou", "Ver histórico, corrigir telefone e tentar novamente."],
    ["Matriz não permite activar", "Configurar primeiro o preço da combinação."],
    ["Página parece desactualizada", "Actualizar uma vez e confirmar ligação à Internet."],
    ["Erro persistente", "Anotar pedido, hora e acção; enviar ao administrador/suporte."],
  ],
  { 0: { cellWidth: 51 }, 1: { cellWidth: 123 } },
);
heading("Regras essenciais", 2);
bullet("Não partilhar credenciais.", 1);
bullet("Conferir cliente, produto, quantidade, preço e pagamento antes de concluir.", 2);
bullet("Não eliminar/cancelar registos sem motivo válido.", 3);
bullet("Guardar o trabalho antes de mudar de ecrã.", 4);
bullet("Comunicar divergências de caixa no mesmo turno.", 5);

heading("11. Checklist de formação", 1);
table(
  ["Concluído", "Exercício"],
  [
    ["[ ]", "Cliente: criar conta, pedido, modelagem e submissão."],
    ["[ ]", "Atendente: abrir caixa, efectuar uma venda e emitir documento."],
    ["[ ]", "Atendente: fechar caixa e conferir valores."],
    ["[ ]", "Designer: abrir fila, guardar modelagem e mudar estado."],
    ["[ ]", "Admin: criar utilizador com papel correcto."],
    ["[ ]", "Admin: alterar três células e Guardar matriz."],
    ["[ ]", "Admin: gerar e descarregar um backup manual."],
    ["[ ]", "Equipa: simular SMS falhado e corrigir telefone."],
  ],
  { 0: { cellWidth: 22, halign: "center" }, 1: { cellWidth: 152 } },
);
note(
  "Suporte",
  "Ao reportar um problema, informe: utilizador/papel, número do pedido, ecrã, hora aproximada e o que aconteceu. Não envie palavras-passe.",
);

const totalPages = doc.getNumberOfPages();
for (let page = 2; page <= totalPages; page += 1) {
  doc.setPage(page);
  addHeaderFooter(page - 1);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
doc.save(output);
console.log(`PDF gerado: ${output}`);
