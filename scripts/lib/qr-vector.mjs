/**
 * Converte a matriz de módulos de um QR em rectângulos, fundindo módulos
 * escuros contíguos de cada linha num só rectângulo. Menos objectos no PDF e,
 * mais importante, sem linhas de falha entre módulos na impressão.
 *
 * Coordenadas devolvidas em unidades de módulo (0..count).
 */
export function qrRuns(qr) {
  const count = qr.modules.size;
  const runs = [];

  for (let row = 0; row < count; row += 1) {
    let start = -1;
    for (let col = 0; col <= count; col += 1) {
      const dark = col < count && qr.modules.data[row * count + col] === 1;
      if (dark && start === -1) start = col;
      if (!dark && start !== -1) {
        runs.push({ row, col: start, len: col - start });
        start = -1;
      }
    }
  }

  return { count, runs };
}
