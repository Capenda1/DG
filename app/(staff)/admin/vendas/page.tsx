import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function VendasIndexPage() {
  redirect(ROUTES.admin.vendas.pedidoBalcao);
}
