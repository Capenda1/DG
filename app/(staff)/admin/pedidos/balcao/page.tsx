import { redirect } from "next/navigation";

/**
 * URL legado — o PDV vive em /admin/balcao (segmento próprio, mais fiável no App Router).
 */
export default function LegacyPedidoBalcaoRedirect() {
  redirect("/admin/balcao");
}
