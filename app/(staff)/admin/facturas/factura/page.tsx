import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function FacturaClassicaRedirectPage() {
  redirect(`${ROUTES.admin.facturas.root}?etapa=factura`);
}
