import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketingDir = path.join(root, "docs", "marketing");

// A5 retrato; a arte é 3:4, por isso centramos preservando proporção.
const PAGE_W = 148;
const PAGE_H = 210;

const flyers = ["a", "b", "c", "d", "e", "f"].map((id) => ({
  file: `flyer-dadiva-opcao-${id}.png`,
  out: `FLYER-${id.toUpperCase()}-IMPRESSAO.pdf`,
}));

for (const flyer of flyers) {
  const source = path.join(marketingDir, flyer.file);
  if (!fs.existsSync(source)) {
    console.warn(`Ignorado (não encontrado): ${source}`);
    continue;
  }

  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, PAGE_H] });
  const image = `data:image/png;base64,${fs.readFileSync(source).toString("base64")}`;

  const artRatio = 3 / 4;
  const pageRatio = PAGE_W / PAGE_H;
  let width = PAGE_W;
  let height = PAGE_W / artRatio;
  if (pageRatio < artRatio) {
    height = PAGE_H;
    width = PAGE_H * artRatio;
  }
  const x = (PAGE_W - width) / 2;
  const y = (PAGE_H - height) / 2;

  doc.setFillColor(16, 16, 18);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  doc.addImage(image, "PNG", x, y, width, height, undefined, "FAST");

  const target = path.join(marketingDir, flyer.out);
  doc.save(target);
  console.log(`PDF de impressão gerado: ${target}`);
}
