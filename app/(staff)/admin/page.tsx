import dynamic from "next/dynamic";

const AdminDashboardOverview = dynamic(
  () =>
    import("@/components/admin/AdminDashboardOverview").then((m) => ({
      default: m.AdminDashboardOverview,
    })),
  {
    loading: () => (
      <div className="flex min-h-[min(50vh,20rem)] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        A carregar painel…
      </div>
    ),
  },
);

export default function AdminDashboardPage() {
  return <AdminDashboardOverview />;
}
