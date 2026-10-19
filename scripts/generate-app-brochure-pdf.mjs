import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "APRESENTACAO-DADIVA-GO.pdf");
const doc = new jsPDF({ unit: "mm", format: "a4" });

const W = 210;
const H = 297;
const GOLD = [224, 171, 53];
const GOLD_DARK = [179, 126, 24];
const INK = [22, 22, 24];
const PANEL = [32, 32, 36];
const WHITE = [255, 255, 255];
const MUTED = [153, 153, 160];
const GREEN = [45, 190, 120];
const BLUE = [64, 145, 255];
const RED = [239, 83, 80];
const M = 16;

function setFont(size, style = "normal", color = WHITE) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function darkPage() {
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, 4, H, "F");
}

function lightPage() {
  doc.setFillColor(248, 247, 244);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, W, 4, "F");
}

function label(text, x, y, color = GOLD) {
  setFont(8, "bold", color);
  doc.setCharSpace(1.2);
  doc.text(text.toUpperCase(), x, y);
  doc.setCharSpace(0);
}

function title(text, x, y, maxWidth = 175, color = WHITE, size = 27) {
  setFont(size, "bold", color);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * size * 0.39;
}

function body(text, x, y, maxWidth, color = MUTED, size = 10.5, line = 5) {
  setFont(size, "normal", color);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * line;
}

function pageFooter(page, dark = true) {
  setFont(7.5, "normal", dark ? MUTED : [105, 105, 110]);
  doc.text("DÁDIVA GO • APRESENTAÇÃO", M, H - 9);
  doc.text(`0${page}`, W - M, H - 9, { align: "right" });
}

function pill(text, x, y, width, color = GOLD) {
  doc.setFillColor(...color);
  doc.roundedRect(x, y, width, 9, 4.5, 4.5, "F");
  setFont(7.5, "bold", INK);
  doc.text(text, x + width / 2, y + 5.8, { align: "center" });
}

function metric(value, caption, x, y, width) {
  doc.setFillColor(...PANEL);
  doc.setDrawColor(63, 63, 68);
  doc.roundedRect(x, y, width, 32, 3, 3, "FD");
  setFont(20, "bold", GOLD);
  doc.text(value, x + 6, y + 13);
  setFont(8, "normal", MUTED);
  const lines = doc.splitTextToSize(caption, width - 12);
  doc.text(lines, x + 6, y + 21);
}

function featureCard(number, name, description, x, y, width, accent = GOLD) {
  doc.setFillColor(...WHITE);
  doc.setDrawColor(224, 221, 214);
  doc.roundedRect(x, y, width, 42, 3, 3, "FD");
  doc.setFillColor(...accent);
  doc.circle(x + 9, y + 10, 4.5, "F");
  setFont(8, "bold", WHITE);
  doc.text(number, x + 9, y + 12.2, { align: "center" });
  setFont(10.5, "bold", INK);
  doc.text(name, x + 17, y + 11.8);
  body(description, x + 7, y + 22, width - 14, [95, 95, 100], 8.2, 4);
}

function dashboardMockup(x, y, width, height) {
  doc.setFillColor(14, 14, 16);
  doc.setDrawColor(72, 72, 78);
  doc.roundedRect(x, y, width, height, 4, 4, "FD");
  doc.setFillColor(38, 38, 43);
  doc.roundedRect(x + 3, y + 3, width - 6, 10, 2, 2, "F");
  doc.setFillColor(...RED);
  doc.circle(x + 8, y + 8, 1.3, "F");
  doc.setFillColor(...GOLD);
  doc.circle(x + 13, y + 8, 1.3, "F");
  doc.setFillColor(...GREEN);
  doc.circle(x + 18, y + 8, 1.3, "F");

  doc.setFillColor(25, 25, 29);
  doc.roundedRect(x + 3, y + 16, 25, height - 19, 2, 2, "F");
  ["Painel", "Pedidos", "Balcão", "Produtos", "Caixa"].forEach((item, i) => {
    if (i === 0) {
      doc.setFillColor(77, 62, 26);
      doc.roundedRect(x + 6, y + 22 + i * 10, 19, 7, 1.5, 1.5, "F");
    }
    setFont(5.4, i === 0 ? "bold" : "normal", i === 0 ? GOLD : MUTED);
    doc.text(item, x + 9, y + 26.7 + i * 10);
  });

  const cx = x + 33;
  const top = y + 20;
  setFont(7.5, "bold", WHITE);
  doc.text("Visão geral do negócio", cx, top);
  const cardW = (width - 42) / 3;
  [
    [GOLD, "Pedidos", "24"],
    [GREEN, "Em produção", "08"],
    [BLUE, "Concluídos", "16"],
  ].forEach(([color, name, value], i) => {
    const px = cx + i * (cardW + 3);
    doc.setFillColor(32, 32, 36);
    doc.roundedRect(px, top + 5, cardW, 19, 2, 2, "F");
    doc.setFillColor(...color);
    doc.rect(px, top + 5, 1.5, 19, "F");
    setFont(5.3, "normal", MUTED);
    doc.text(name, px + 4, top + 11);
    setFont(10.5, "bold", WHITE);
    doc.text(value, px + 4, top + 19);
  });

  doc.setFillColor(32, 32, 36);
  doc.roundedRect(cx, top + 30, width - 39, height - 55, 2, 2, "F");
  setFont(6, "bold", WHITE);
  doc.text("Pedidos recentes", cx + 4, top + 37);
  for (let i = 0; i < 4; i += 1) {
    const ry = top + 43 + i * 9;
    doc.setDrawColor(58, 58, 63);
    doc.line(cx + 4, ry + 5, x + width - 7, ry + 5);
    setFont(5.2, "normal", [195, 195, 200]);
    doc.text(`#DG-${1048 + i}`, cx + 4, ry);
    doc.text(["Validação", "Produção", "Finalizado", "Submetido"][i], cx + 29, ry);
    doc.setFillColor(...[GOLD, BLUE, GREEN, GOLD][i]);
    doc.circle(x + width - 10, ry - 1.5, 1.4, "F");
  }
}

function flowStep(number, name, caption, x, y, width, last = false) {
  doc.setFillColor(...GOLD);
  doc.circle(x + 6, y + 6, 6, "F");
  setFont(9, "bold", INK);
  doc.text(String(number), x + 6, y + 9, { align: "center" });
  setFont(10.5, "bold", INK);
  doc.text(name, x + 17, y + 4.5);
  body(caption, x + 17, y + 11, width - 20, [95, 95, 100], 8, 3.8);
  if (!last) {
    doc.setDrawColor(...GOLD_DARK);
    doc.setLineWidth(0.7);
    doc.line(x + 6, y + 13, x + 6, y + 31);
  }
}

// 1 — Capa
darkPage();
doc.setFillColor(42, 38, 28);
doc.circle(176, 48, 60, "F");
doc.setFillColor(53, 46, 29);
doc.circle(182, 43, 42, "F");
label("A gráfica conectada", 20, 38);
let y = title("A sua operação.\nNum só lugar.", 20, 64, 150, WHITE, 31);
y = body(
  "Do primeiro contacto à entrega: pedidos, modelagem, produção, caixa e clientes a trabalhar em sintonia.",
  20,
  y + 8,
  132,
  [208, 208, 212],
  12,
  6,
);
pill("GESTÃO", 20, y + 12, 29);
pill("VENDAS", 53, y + 12, 29);
pill("DESIGN", 86, y + 12, 27);
pill("PRODUÇÃO", 117, y + 12, 35);
dashboardMockup(20, 164, 170, 91);
setFont(9, "bold", GOLD);
doc.text("DÁDIVA GO", 20, 276);
setFont(9, "normal", MUTED);
doc.text("graficadadiva.com", 190, 276, { align: "right" });

// 2 — Proposta de valor
doc.addPage();
darkPage();
label("Mais organização. Mais velocidade. Mais confiança.", M, 28);
y = title("Uma plataforma pensada para o ritmo da gráfica.", M, 48, 172);
y = body(
  "O Dádiva Go transforma tarefas dispersas num fluxo único e visível para toda a equipa.",
  M,
  y + 5,
  164,
  [205, 205, 210],
  11.5,
  5.7,
);
metric("1", "sistema para ligar cliente, balcão, design e produção", M, y + 14, 55);
metric("4", "perfis com acesso certo para cada responsabilidade", 77, y + 14, 55);
metric("360°", "visão do pedido, do rascunho à entrega", 138, y + 14, 55);

setFont(15, "bold", WHITE);
doc.text("O que muda no dia a dia?", M, y + 63);
const benefits = [
  ["Menos retrabalho", "Informação do pedido, arte e variante no mesmo contexto."],
  ["Atendimento ágil", "Venda no balcão com catálogo, caixa e documentos integrados."],
  ["Produção alinhada", "Estados claros para saber o que entra, avança e termina."],
  ["Decisão com dados", "Relatórios, financeiro e histórico para gerir melhor."],
];
benefits.forEach(([name, description], i) => {
  const by = y + 78 + i * 33;
  doc.setFillColor(...GOLD);
  doc.roundedRect(M, by - 7, 3, 22, 1.5, 1.5, "F");
  setFont(11, "bold", WHITE);
  doc.text(name, M + 9, by);
  body(description, M + 9, by + 7, 158, MUTED, 9, 4.3);
});
pageFooter(2);

// 3 — Módulos
doc.addPage();
lightPage();
label("Ecossistema completo", M, 27, GOLD_DARK);
y = title("Tudo o que a equipa precisa para entregar melhor.", M, 46, 178, INK, 25);
y = body(
  "Módulos ligados por um único pedido, sem perder contexto entre áreas.",
  M,
  y + 4,
  165,
  [95, 95, 100],
  10.5,
  5,
);
const cards = [
  ["01", "Pedidos", "Online e balcão, artigos, estados e acompanhamento.", GOLD],
  ["02", "Modelagem", "Preparação visual da arte associada ao artigo.", BLUE],
  ["03", "Catálogo", "Produtos, preços, cores, tamanhos e variantes.", GREEN],
  ["04", "Caixa", "Abertura, fecho, movimentos e conferência.", RED],
  ["05", "Documentos", "Pro-forma, factura e recibo para a venda.", GOLD_DARK],
  ["06", "Gestão", "Clientes, stock, SMS, RH, relatórios e backups.", [110, 90, 190]],
];
cards.forEach(([n, name, desc, color], i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  featureCard(n, name, desc, M + col * 91, y + 15 + row * 51, 84, color);
});
doc.setFillColor(...INK);
doc.roundedRect(M, 244, 178, 26, 3, 3, "F");
setFont(11, "bold", GOLD);
doc.text("Uma fonte de verdade para toda a operação.", M + 8, 255);
setFont(8.5, "normal", [205, 205, 210]);
doc.text("Cada equipa vê o que precisa — e o pedido mantém o histórico.", M + 8, 263);
pageFooter(3, false);

// 4 — Jornada
doc.addPage();
lightPage();
label("Da ideia à entrega", M, 27, GOLD_DARK);
y = title("O pedido avança. A equipa acompanha.", M, 46, 176, INK, 25);
y = body(
  "Um fluxo simples para reduzir dúvidas, atrasos e informação perdida.",
  M,
  y + 4,
  170,
  [95, 95, 100],
  10.5,
  5,
);
const steps = [
  ["Entrada", "Cliente online ou venda criada no balcão."],
  ["Definição", "Produto, variante, quantidade, preço e pagamento."],
  ["Modelagem", "Arte preparada e associada ao pedido correcto."],
  ["Validação", "Equipa confirma dados e aprovação para produzir."],
  ["Produção", "Estado actualizado e trabalho acompanhado."],
  ["Conclusão", "Documento, comunicação e entrega ao cliente."],
];
steps.forEach(([name, caption], i) => {
  flowStep(i + 1, name, caption, M + (i % 2) * 91, y + 17 + Math.floor(i / 2) * 58, 82, i >= 4);
});
doc.setFillColor(240, 232, 211);
doc.roundedRect(M, 246, 178, 26, 3, 3, "F");
setFont(10.5, "bold", GOLD_DARK);
doc.text("Resultado:", M + 8, 257);
setFont(9, "normal", INK);
doc.text("mais previsibilidade para a loja e transparência para o cliente.", M + 33, 257);
pageFooter(4, false);

// 5 — Perfis
doc.addPage();
darkPage();
label("Uma experiência para cada papel", M, 28);
y = title("Cada pessoa vê o que precisa para fazer o seu melhor.", M, 48, 176);
const roles = [
  ["CLIENTE", "Pede, personaliza e acompanha", "Conta própria • Pedidos • Modelagem • Estado"],
  ["ATENDENTE", "Vende com rapidez e controlo", "Balcão • Caixa • Documentos • SMS"],
  ["DESIGNER", "Organiza arte e produção", "Fila • Modelagem • Estados • Modelos"],
  ["ADMIN", "Gere a operação completa", "Catálogo • Equipa • Stock • Financeiro • Backups"],
];
roles.forEach(([role, promise, modules], i) => {
  const ry = y + 14 + i * 43;
  doc.setFillColor(...PANEL);
  doc.setDrawColor(65, 65, 70);
  doc.roundedRect(M, ry, 178, 34, 3, 3, "FD");
  doc.setFillColor(...GOLD);
  doc.roundedRect(M + 6, ry + 7, 30, 9, 4.5, 4.5, "F");
  setFont(7.2, "bold", INK);
  doc.text(role, M + 21, ry + 12.8, { align: "center" });
  setFont(11, "bold", WHITE);
  doc.text(promise, M + 43, ry + 11.5);
  setFont(8, "normal", MUTED);
  doc.text(modules, M + 43, ry + 23);
});
setFont(13, "bold", GOLD);
doc.text("Acesso certo. Responsabilidade clara.", M, 259);
body(
  "Permissões por perfil ajudam a proteger informação e simplificam a formação da equipa.",
  M,
  267,
  170,
  [205, 205, 210],
  9.5,
  4.5,
);
pageFooter(5);

// 6 — Demonstração
doc.addPage();
lightPage();
label("Roteiro para demonstração", M, 27, GOLD_DARK);
y = title("Veja o Dádiva Go em acção.", M, 46, 170, INK, 25);
y = body(
  "Uma demonstração curta percorre o ciclo real da gráfica.",
  M,
  y + 4,
  170,
  [95, 95, 100],
  10.5,
  5,
);
const demo = [
  ["01", "Venda no balcão", "Abrir caixa, escolher cliente e montar o pedido."],
  ["02", "Produto personalizado", "Seleccionar cor, tamanho, processo e quantidade."],
  ["03", "Modelagem visual", "Posicionar arte e guardar a proposta do artigo."],
  ["04", "Produção organizada", "Avançar estados e acompanhar a fila do designer."],
  ["05", "Fecho profissional", "Emitir documento, finalizar e entregar."],
];
demo.forEach(([n, name, desc], i) => {
  const dy = y + 14 + i * 38;
  setFont(22, "bold", [224, 220, 210]);
  doc.text(n, M, dy + 9);
  setFont(11, "bold", INK);
  doc.text(name, M + 25, dy + 3);
  body(desc, M + 25, dy + 10, 145, [95, 95, 100], 8.8, 4);
  doc.setDrawColor(224, 221, 214);
  doc.line(M + 25, dy + 24, 193, dy + 24);
});
doc.setFillColor(...INK);
doc.roundedRect(M, 248, 178, 27, 3, 3, "F");
setFont(10.5, "bold", GOLD);
doc.text("Demonstração disponível online", M + 8, 259);
setFont(9, "normal", WHITE);
doc.text("graficadadiva.com", M + 8, 268);
doc.link(M + 8, 261, 60, 10, { url: "https://graficadadiva.com" });
pageFooter(6, false);

// 7 — CTA
doc.addPage();
darkPage();
doc.setFillColor(45, 40, 27);
doc.circle(181, 35, 65, "F");
label("O futuro da operação começa agora", 20, 50);
y = title("Mais do que software.\nUma forma melhor\nde trabalhar.", 20, 76, 165, WHITE, 28);
y = body(
  "O Dádiva Go aproxima atendimento, design, produção e gestão para que a gráfica cresça com controlo.",
  20,
  y + 9,
  150,
  [205, 205, 210],
  11.5,
  5.8,
);
doc.setFillColor(...GOLD);
doc.roundedRect(20, y + 17, 94, 15, 7.5, 7.5, "F");
setFont(10, "bold", INK);
doc.text("CONHECER A PLATAFORMA", 67, y + 26.5, { align: "center" });
doc.link(20, y + 17, 94, 15, { url: "https://graficadadiva.com" });

setFont(14, "bold", WHITE);
doc.text("DÁDIVA GO", 20, 234);
setFont(10, "normal", MUTED);
doc.text("Plataforma de gestão da Gráfica Dádiva", 20, 244);
setFont(10, "bold", GOLD);
doc.text("https://graficadadiva.com", 20, 258);
doc.link(20, 250, 85, 12, { url: "https://graficadadiva.com" });
setFont(7.5, "normal", MUTED);
doc.text("Apresentação comercial • Agosto de 2026", 20, 278);

fs.mkdirSync(path.dirname(output), { recursive: true });
doc.save(output);
console.log(`PDF publicitário gerado: ${output}`);
