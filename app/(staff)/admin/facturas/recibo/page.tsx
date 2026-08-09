import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function FacturaReciboRedirectPage() {
  redirect(`${ROUTES.admin.facturas.root}?etapa=recibo`);
}
