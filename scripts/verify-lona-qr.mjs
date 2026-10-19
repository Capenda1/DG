/**
 * Valida o QR da lona de ponta a ponta: pinta os mesmos rectângulos que o
 * script do PDF desenha e passa o resultado por um descodificador real.
 * Corre isto sempre que o endereço ou o desenho do QR mudarem.
 */
import QRCode from "qrcode";
import jsQRModule from "jsqr";
import { qrRuns } from "./lib/qr-vector.mjs";

const jsQR = jsQRModule.default ?? jsQRModule;
const SITE_URL = "https://graficadadiva.com";
const QUIET_MODULES = 4;
const PX_PER_MODULE = 10;

function paint(qr) {
  const { count, runs } = qrRuns(qr);
  const side = (count + QUIET_MODULES * 2) * PX_PER_MODULE;
  const rgba = new Uint8ClampedArray(side * side * 4).fill(255);

  const setPixel = (px, py) => {
    const i = (py * side + px) * 4;
    rgba[i] = 0;
    rgba[i + 1] = 0;
    rgba[i + 2] = 0;
    rgba[i + 3] = 255;
  };

  for (const { row, col, len } of runs) {
    const x0 = (col + QUIET_MODULES) * PX_PER_MODULE;
    const y0 = (row + QUIET_MODULES) * PX_PER_MODULE;
    for (let dy = 0; dy < PX_PER_MODULE; dy += 1) {
      for (let dx = 0; dx < len * PX_PER_MODULE; dx += 1) {
        setPixel(x0 + dx, y0 + dy);
      }
    }
  }

  return { rgba, side, count, runs: runs.length };
}

const qr = QRCode.create(SITE_URL, { errorCorrectionLevel: "H" });
const { rgba, side, count, runs } = paint(qr);
const decoded = jsQR(rgba, side, side);

if (!decoded) {
  console.error("FALHA: o QR desenhado não foi reconhecido pelo descodificador.");
  process.exit(1);
}
if (decoded.data !== SITE_URL) {
  console.error(`FALHA: descodificado "${decoded.data}", esperado "${SITE_URL}".`);
  process.exit(1);
}

console.log(
  `QR validado · ${decoded.data} · ${count}x${count} módulos · correcção H · ${runs} rectângulos vectoriais`,
);
