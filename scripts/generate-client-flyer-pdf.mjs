import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "FLYER-CLIENTES-DADIVA-GO.pdf");
const doc = new jsPDF({ unit: "mm", format: "a4" });

const W = 210;
const H = 297;
const GOLD = [224, 171, 53];
const GOLD_SOFT = [245, 214, 132];
const INK = [16, 16, 18];
const PANEL = [28, 28, 32];
const WHITE = [255, 255, 255];
const MUTED = [168, 168, 176];
const CREAM = [250, 246, 238];

function font(size, style = "normal", color = WHITE) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function dark() {
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, H, "F");
}

function cream() {
  doc.setFillColor(...CREAM);
  doc.rect(0, 0, W, H, "F");
}

function eyebrow(text, x, y, color = GOLD) {
  font(8, "bold", color);
  doc.setCharSpace(1.6);
  doc.text(String(text).toUpperCase(), x, y);
  doc.setCharSpace(0);
}

function wrap(text, x, y, max, color, size, line = 5.2) {
  font(size, "normal", color);
  const lines = doc.splitTextToSize(text, max);
  doc.text(lines, x, y);
  return y + lines.length * line;
}

function footer(page, darkMode = true) {
  font(7.5, "normal", darkMode ? MUTED : [110, 110, 116]);
  doc.text("DÁDIVA GO · FLYER CLIENTES", 14, H - 9);
  doc.text(`0${page}`, W - 14, H - 9, { align: "right" });
}

function quoteBlock(text, x, y, width) {
  doc.setFillColor(...PANEL);
  doc.setDrawColor(70, 70, 76);
  doc.roundedRect(x, y, width, 28, 3, 3, "FD");
  doc.setFillColor(...GOLD);
  doc.rect(x, y, 2.2, 28, "F");
  wrap(text, x + 10, y + 11, width - 18, WHITE, 9.5, 4.6);
}

// 1 — Capa flyer
dark();
doc.setFillColor(48, 42, 28);
doc.circle(188, -10, 90, "F");
doc.setFillColor(58, 48, 26);
doc.circle(200, 20, 55, "F");
doc.setFillColor(...GOLD);
doc.rect(0, 0, W, 5, "F");

eyebrow("A sua ideia merece existir", 16, 36);
font(34, "bold", WHITE);
doc.text("Não peça só", 16, 68);
doc.text("uma estampa.", 16, 84);
font(34, "bold", GOLD);
doc.text("Peça uma", 16, 104);
doc.text("história.", 16, 120);

wrap(
  "Camisas, polos, coletes, lonas e peças personalizadas. Do detalhe à entrega, a Gráfica Dádiva transforma o que imagina em algo que se usa, se vê e se sente.",
  16,
  142,
  150,
  [210, 210, 216],
  12,
  6.2,
);

doc.setFillColor(...GOLD);
doc.roundedRect(16, 188, 102, 16, 8, 8, "F");
font(10, "bold", INK);
doc.text("COMEÇAR O MEU PEDIDO", 67, 198, { align: "center" });
doc.link(16, 188, 102, 16, { url: "https://graficadadiva.com" });

font(9, "normal", MUTED);
doc.text("Online  ·  Rápido  ·  Com a sua marca", 16, 220);
font(11, "bold", GOLD);
doc.text("graficadadiva.com", 16, 236);
doc.link(16, 228, 80, 12, { url: "https://graficadadiva.com" });
font(8, "normal", MUTED);
doc.text("Gráfica Dádiva  ·  Dádiva Go", 16, 278);

// 2 — Headlines
doc.addPage();
cream();
doc.setFillColor(...GOLD);
doc.rect(0, 0, W, 4, "F");
eyebrow("Palavras que ficam", 16, 28, [160, 110, 20]);
font(26, "bold", INK);
doc.text("Frases para o flyer", 16, 48);
wrap(
  "Escolha UMA headline forte. O resto do flyer deve servir esta frase.",
  16,
  58,
  175,
  [90, 90, 96],
  10.5,
  5,
);

const headlines = [
  ["A sua marca, vestida de verdade.", "Identidade, não só cor."],
  ["Do ecrã ao tecido. Sem drama.", "Simplicidade e confiança."],
  ["Personalizar é lembrar quem somos.", "Humano e memorável."],
  ["Menos espera. Mais presença.", "Velocidade com qualidade."],
  ["Feito para impressionar.", "Curto, premium, ousado."],
  ["A ideia nasce consigo. A peça nasce connosco.", "Parceria e criação."],
];

headlines.forEach(([title, note], i) => {
  const y = 78 + i * 30;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(228, 222, 210);
  doc.roundedRect(16, y - 8, 178, 24, 2.5, 2.5, "FD");
  doc.setFillColor(...GOLD);
  doc.circle(28, y + 4, 5, "F");
  font(8, "bold", INK);
  doc.text(String(i + 1).padStart(2, "0"), 28, y + 6, { align: "center" });
  font(11, "bold", INK);
  doc.text(title, 40, y + 1);
  font(8.2, "normal", [110, 110, 116]);
  doc.text(note, 40, y + 10);
});
footer(2, false);

// 3 — Emoções + CTAs
doc.addPage();
dark();
eyebrow("O que o cliente deve sentir", 16, 28);
font(26, "bold", WHITE);
doc.text("Emocionar. Depois vender.", 16, 50);
wrap(
  "Antes do preço, a pessoa precisa sentir: isto é para mim.",
  16,
  62,
  170,
  MUTED,
  11,
  5.4,
);

const feelings = [
  ["Orgulho", "Isto representa-me."],
  ["Confiança", "Não vou me arrepender."],
  ["Facilidade", "É simples pedir."],
  ["Exclusividade", "Isto não é genérico."],
  ["Urgência leve", "Quero já ver a minha peça."],
  ["Pertencer", "É da minha equipa / marca."],
];
feelings.forEach(([name, line], i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 16 + col * 92;
  const y = 86 + row * 42;
  doc.setFillColor(...PANEL);
  doc.roundedRect(x, y, 84, 34, 3, 3, "F");
  font(10, "bold", GOLD);
  doc.text(name, x + 8, y + 12);
  wrap(line, x + 8, y + 21, 68, WHITE, 9, 4.4);
});

font(12, "bold", GOLD_SOFT);
doc.text("CTAs que puxam acção", 16, 230);
[
  "Quero a minha peça",
  "Começar agora",
  "Criar o meu pedido",
  "Ver a minha ideia ganhar forma",
].forEach((c, i) => {
  font(10, "bold", WHITE);
  doc.text(`>  ${c}`, 16, 246 + i * 9);
});
footer(3);

// 4 — Microcopy
doc.addPage();
cream();
doc.setFillColor(...GOLD);
doc.rect(0, 0, W, 4, "F");
eyebrow("Linguagem única Dádiva", 16, 28, [160, 110, 20]);
font(24, "bold", INK);
doc.text("Frases curtas. Memória longa.", 16, 48);

[
  "Onde a sua marca veste confiança.",
  "Personalizado. Não improvisado.",
  "Do pedido ao orgulho de usar.",
  "A cor certa. O corte certo. O momento certo.",
  "Faça o comum desaparecer.",
  "A sua equipa merece aparecer bem.",
  "Impressão que se sente.",
  "Não é só gráfico. É presença.",
].forEach((line, i) => {
  const y = 66 + i * 22;
  font(14, "bold", INK);
  doc.text(line, 20, y);
  doc.setDrawColor(224, 214, 190);
  doc.setLineWidth(0.3);
  doc.line(20, y + 5, 190, y + 5);
});
footer(4, false);

// 5 — Layouts
doc.addPage();
dark();
eyebrow("Ideias de composição", 16, 28);
font(24, "bold", WHITE);
doc.text("Como montar o flyer", 16, 48);
wrap(
  "Uma página. Uma frase. Uma imagem. Um botão. Nada a mais.",
  16,
  60,
  170,
  MUTED,
  11,
  5.2,
);

[
  {
    title: "Layout A — Choque",
    body: "Fundo escuro. Headline gigante em 2 linhas. CTA dourado. Site pequeno no rodapé.",
  },
  {
    title: "Layout B — Emoção",
    body: "Foto de pessoa a vestir a peça. Sobreposição: Isto sou eu. CTA: Começar o meu pedido.",
  },
  {
    title: "Layout C — Prova",
    body: "3 benefícios curtos. Frase: Do ecrã ao tecido. QR para graficadadiva.com.",
  },
].forEach((item, i) => {
  const y = 88 + i * 48;
  doc.setFillColor(...PANEL);
  doc.roundedRect(16, y, 178, 40, 3, 3, "F");
  doc.setFillColor(...GOLD);
  doc.roundedRect(16, y, 3, 40, 1.5, 1.5, "F");
  font(12, "bold", GOLD);
  doc.text(item.title, 28, y + 14);
  wrap(item.body, 28, y + 24, 155, [210, 210, 216], 9.5, 4.6);
});
footer(5);

// 6 — Slogans
doc.addPage();
cream();
doc.setFillColor(...GOLD);
doc.rect(0, 0, W, 4, "F");
eyebrow("Banco de slogans", 16, 28, [160, 110, 20]);
font(24, "bold", INK);
doc.text("Para escolher e combinar", 16, 48);

[
  ["Primário", "A sua ideia. Na sua peça."],
  ["Emocional", "Vestir uma ideia.  ·  Marca que se usa.  ·  Presença impressa."],
  ["Directo", "Peça. Personalize. Receba.  ·  Comece online. Vista depois."],
  ["Premium", "Detalhe que se nota.  ·  Qualidade que se vê de longe."],
].forEach(([tag, text], i) => {
  const y = 66 + i * 36;
  font(8, "bold", [160, 110, 20]);
  doc.text(tag.toUpperCase(), 16, y);
  wrap(text, 16, y + 8, 178, INK, 10.5, 5);
});

doc.setFillColor(...INK);
doc.roundedRect(16, 220, 178, 50, 4, 4, "F");
font(10, "bold", GOLD);
doc.text("Recomendação de capa", 28, 236);
font(14, "bold", WHITE);
doc.text("A sua ideia. Na sua peça.", 28, 250);
font(9, "normal", MUTED);
doc.text("CTA: Começar o meu pedido   ·   graficadadiva.com", 28, 262);
footer(6, false);

// 7 — Flyer frente pronto
doc.addPage();
dark();
doc.setFillColor(52, 44, 26);
doc.circle(-20, 320, 120, "F");
doc.setFillColor(...GOLD);
doc.rect(0, 0, 6, H, "F");

eyebrow("Flyer — frente", 22, 34);
font(38, "bold", WHITE);
doc.text("A sua ideia.", 22, 78);
font(38, "bold", GOLD);
doc.text("Na sua peça.", 22, 96);

wrap(
  "Personalize camisas, polos, coletes e mais — com a confiança de quem transforma ideias em presença.",
  22,
  120,
  150,
  [210, 210, 216],
  13,
  6.4,
);

[
  "Pedido online, simples e claro",
  "Modelagem da sua arte",
  "Acompanhamento até à entrega",
].forEach((b, i) => {
  const y = 160 + i * 16;
  doc.setFillColor(...GOLD);
  doc.circle(26, y - 1.5, 2.2, "F");
  font(12, "bold", WHITE);
  doc.text(b, 36, y);
});

doc.setFillColor(...GOLD);
doc.roundedRect(22, 222, 114, 18, 9, 9, "F");
font(11, "bold", INK);
doc.text("COMEÇAR O MEU PEDIDO", 79, 233.5, { align: "center" });
doc.link(22, 222, 114, 18, { url: "https://graficadadiva.com" });

font(12, "bold", GOLD);
doc.text("graficadadiva.com", 22, 260);
font(9, "normal", MUTED);
doc.text("Gráfica Dádiva  ·  Feito para marcar presença", 22, 274);

// 8 — Verso
doc.addPage();
cream();
doc.setFillColor(...GOLD);
doc.rect(0, 0, W, 5, "F");
eyebrow("Flyer — verso / ideias extra", 16, 30, [160, 110, 20]);
font(22, "bold", INK);
doc.text("3 linhas que vendem sozinhas", 16, 50);

[
  ["1", "Vê. Escolhe. Personaliza.", "Para quem quer simplicidade."],
  ["2", "A sua marca, do jeito certo.", "Para empresas e equipas."],
  ["3", "Peças que falam por si.", "Para quem quer impacto visual."],
].forEach(([n, t, s], i) => {
  const y = 70 + i * 40;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(228, 222, 210);
  doc.roundedRect(16, y, 178, 32, 3, 3, "FD");
  font(18, "bold", GOLD);
  doc.text(n, 28, y + 18);
  font(13, "bold", INK);
  doc.text(t, 46, y + 13);
  font(9, "normal", [110, 110, 116]);
  doc.text(s, 46, y + 23);
});

quoteBlock(
  "Não venda impressão. Venda o momento em que a pessoa veste a ideia e se reconhece nela.",
  16,
  200,
  178,
);

font(11, "bold", INK);
doc.text("QR / URL: graficadadiva.com", 16, 250);
font(9, "normal", [110, 110, 116]);
doc.text(
  "Dica: imprima A5 ou A6. Menos texto. Mais silêncio. Mais atenção.",
  16,
  262,
);
footer(8, false);

fs.mkdirSync(path.dirname(output), { recursive: true });
doc.save(output);
console.log(`Flyer clientes gerado: ${output}`);
