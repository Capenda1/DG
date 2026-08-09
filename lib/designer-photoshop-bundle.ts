import JSZip from "jszip";
import {
  fetchOrderLatestArtBlob,
  fetchOrderModelagemFileBlob,
  getOrder,
  listOrderModelagemFiles,
} from "@/lib/api-client";
import { previewAppearanceFromProductName } from "@/lib/apparel-catalog";
import { parseModelagemSpecsFromOrder } from "@/lib/modelagem-specs";
import {
  buildModelagemSpecsCsvBlob,
  buildModelagemSpecsPdfBlob,
  modelagemSpecsHasExportableContent,
} from "@/lib/modelagem-specs-export";
import { MODELAGEM_MODEL_IMAGE } from "@/lib/modelagem-model-images";

function orderFileSlug(orderNumber: string): string {
  const s = orderNumber.replace(/[^\w.-]+/g, "_");
  return s || "pedido";
}

/** Nome seguro dentro do ZIP (evita ../ e caracteres estranhos). */
function safeZipEntryName(name: string, fallback: string): string {
  const trimmed = name.replace(/[/\\?\x00]/g, "_").trim();
  return trimmed.slice(0, 180) || fallback;
}

async function fetchPublicAsset(relativePath: string): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  try {
    const res = await fetch(`${window.location.origin}${path}`);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

const README_PT = (orderNumber: string) => {
  const slug = orderFileSlug(orderNumber);
  return [
    `Dádiva GO · ${orderNumber}`,
    "",
    "Conteúdo: composição PNG (se existir) · foto do modelo usada no editor · uploads do cliente (pasta referencias_*).",
    "",
    "Se existirem dados em «Informação extra de produção» no pedido, este ZIP pode incluir também:",
    `  • ${slug}_especificacoes_producao.pdf`,
    `  • ${slug}_especificacoes_producao.csv  (abrível no Excel).`,
    "",
    `Pasta aberta pela equipa nesta página: «Ver arte».`,
    "",
    "Para produção usa sempre materiais especificados no pedido oficial.",
  ].join("\r\n");
};
/**
 * ZIP com arte guardada + mockup base público + ficheiros de modelagem do pedido,
 * orientado ao fluxo Photoshop do designer (sem automatizar nem abrir a app Adobe).
 */
export async function buildDesignerPhotoshopBundleZip(params: {
  orderId: string;
  orderNumber: string;
}): Promise<Blob> {
  const { orderId, orderNumber } = params;
  const slug = orderFileSlug(orderNumber);
  const zip = new JSZip();

  zip.file(`${slug}_LEIA-ME.txt`, README_PT(orderNumber));

  const detailTask = getOrder(orderId).catch(() => null);
  const filesTask = listOrderModelagemFiles(orderId).catch(() => []);

  let compositionAdded = false;
  try {
    const blob = await fetchOrderLatestArtBlob(orderId);
    zip.file(`${slug}_composicao_EDITOR.png`, blob);
    compositionAdded = true;
  } catch {
    zip.file(`${slug}_composicao_INEXISTENTE.txt`, "Este pedido ainda não tem composição PNG gravada pelo cliente.\r\n\r\nConsulte apenas as referências na pasta correspondente.");
  }

  const detail = await detailTask;
  const productName =
    detail && detail.items && detail.items.length > 0 ? detail.items[0]!.productName : "";

  if (detail?.modelagemSpecs != null) {
    const specs = parseModelagemSpecsFromOrder(detail.modelagemSpecs);
    if (modelagemSpecsHasExportableContent(specs)) {
      try {
        zip.file(
          `${slug}_especificacoes_producao.pdf`,
          await buildModelagemSpecsPdfBlob(specs, orderNumber),
        );
      } catch {
        zip.file(
          `${slug}_especificacoes_producao_PDF_erro.txt`,
          "Não foi possível gerar o PDF das especificações neste navegador.\r\nConsulte «Informação extra de produção» no pedido online.\r\n",
        );
      }
      try {
        zip.file(
          `${slug}_especificacoes_producao.csv`,
          await buildModelagemSpecsCsvBlob(specs, orderNumber),
        );
      } catch {
        zip.file(
          `${slug}_especificacoes_producao_CSV_erro.txt`,
          "Não foi possível gerar o CSV das especificações.\r\n",
        );
      }
    }
  }

  const appearance = previewAppearanceFromProductName(productName);
  const mockPath = MODELAGEM_MODEL_IMAGE[appearance.productType];
  const mockBlob = await fetchPublicAsset(mockPath);
  if (mockBlob) {
    zip.file(`${slug}_modelo_EDITOR_frente_e_costas.png`, mockBlob);
  } else {
    zip.file(
      `${slug}_modelo_MISSING.txt`,
      `Não foi possível baixar a imagem-base do modelo a partir do site (${mockPath}).\r\nTem composição gravada neste ZIP: ${compositionAdded ? "sim" : "não"}.\r\n`,
    );
  }

  const files = await filesTask;
  if (files.length > 0) {
    const folder = zip.folder(`${slug}_referencias_do_cliente`);
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      try {
        const blob = await fetchOrderModelagemFileBlob(orderId, f.id);
        const idx = `${String(i + 1).padStart(2, "0")}_`;
        const safe = safeZipEntryName(f.originalName, `ficheiro_${f.id}`);
        folder?.file(`${idx}${safe}`, blob);
      } catch {
        folder?.file(
          `${String(i + 1).padStart(2, "0")}_ERRO_carregar_${f.id}.txt`,
          `Ficheiro omitido (${f.originalName})\r\nmime: ${f.mimeType}\r\n`,
        );
      }
    }
  }

  const out = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return out;
}
