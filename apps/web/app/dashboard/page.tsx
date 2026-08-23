import { apiGet } from "@/lib/api";
import { DataTable } from "@/components/data-table";
import { StatCard } from "@/components/stat-card";

export default async function DashboardPage() {
  const [summary, users, neighborhoods, incidents] = await Promise.all([
    apiGet("/dashboard/summary"),
    apiGet("/users"),
    apiGet("/neighborhoods"),
    apiGet("/incidents"),
  ]);
  const safeSummary = summary ?? { total_users: 0, total_leaders: 0, total_centinels: 0, total_neighborhoods: 0 };
  const safeUsers = users ?? [];
  const safeNeighborhoods = neighborhoods ?? [];
  const safeIncidents = incidents ?? [];

  return (
    <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto", display: "grid", gap: 20 }}>
      <header>
        <h1 style={{ fontSize: 36, marginBottom: 8, color: "#0f2f57" }}>Dashboard</h1>
        <p style={{ marginTop: 0, color: "#475569" }}>Vista operativa inicial de Vecino Centinela.</p>
      </header>
      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <StatCard title="Usuarios" value={safeSummary.total_users ?? 0} />
        <StatCard title="Líderes" value={safeSummary.total_leaders ?? 0} />
        <StatCard title="Centinelas" value={safeSummary.total_centinels ?? 0} />
        <StatCard title="Vecindarios" value={safeSummary.total_neighborhoods ?? 0} />
      </section>
      <DataTable title="Usuarios" rows={safeUsers} />
      <DataTable title="Vecindarios" rows={safeNeighborhoods} />
      <DataTable title="Incidencias" rows={safeIncidents} />
    </main>
  );
}
