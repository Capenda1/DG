import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function FacturaProFormaRedirectPage() {
  redirect(`${ROUTES.admin.facturas.root}?etapa=pro-forma`);
}
