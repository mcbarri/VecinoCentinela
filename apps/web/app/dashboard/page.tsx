"use client";

import { FormEvent, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { apiGet, apiRequest } from "@/lib/api";

type RecordRow = Record<string, string | number | boolean | null | undefined>;

function Table({ title, rows }: { title: string; rows: RecordRow[] }) {
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return <section style={cardStyle}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><h2 style={{ marginTop: 0 }}>{title}</h2><span style={{ color: "#64748b" }}>{rows.length} registros</span></div>
    {rows.length === 0 ? <p style={{ color: "#64748b" }}>No hay registros para mostrar.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{columns.map((column) => <th key={column} style={thStyle}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column} style={tdStyle}>{String(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <article style={cardStyle}><div style={{ color: "#64748b", fontSize: 14 }}>{label}</div><strong style={{ display: "block", fontSize: 30, color: "#0f2f57", marginTop: 6 }}>{value}</strong></article>;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<RecordRow[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<RecordRow[]>([]);
  const [incidents, setIncidents] = useState<RecordRow[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<"user" | "neighborhood" | "incident" | null>(null);

  async function load() {
    const [nextSummary, nextUsers, nextNeighborhoods, nextIncidents] = await Promise.all([apiGet("/dashboard/summary"), apiGet("/users"), apiGet("/neighborhoods"), apiGet("/incidents")]);
    if (nextSummary) setSummary(nextSummary);
    if (nextUsers) setUsers(nextUsers);
    if (nextNeighborhoods) setNeighborhoods(nextNeighborhoods);
    if (nextIncidents) setIncidents(nextIncidents);
  }

  useEffect(() => {
    if (!window.localStorage.getItem("vc_access_token")) window.location.href = "/login";
    else load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>, path: string, body: Record<string, unknown>) {
    event.preventDefault();
    const response = await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.detail ?? "No se pudo guardar el registro");
      return;
    }
    setMessage("Registro creado correctamente");
    setForm(null);
    load();
  }

  function logout() {
    window.localStorage.removeItem("vc_access_token");
    window.localStorage.removeItem("vc_refresh_token");
    window.location.href = "/login";
  }

  return <div style={{ display: "flex", minHeight: "100vh" }}><Sidebar /><main style={{ padding: 24, width: "100%", maxWidth: 1320, margin: "0 auto", display: "grid", gap: 20 }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}><div><h1 style={{ fontSize: 36, marginBottom: 8, color: "#0f2f57" }}>Panel de control</h1><p style={{ marginTop: 0, color: "#475569" }}>Gestión operativa de Vecino Centinela.</p></div><button onClick={logout} style={secondaryStyle}>Cerrar sesión</button></header>
    {message && <div style={{ background: "#e0f2fe", color: "#075985", padding: 12, borderRadius: 10 }}>{message}</div>}
    <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}><Stat label="Usuarios" value={summary.total_users ?? 0} /><Stat label="Líderes" value={summary.total_leaders ?? 0} /><Stat label="Centinelas" value={summary.total_centinels ?? 0} /><Stat label="Vecindarios" value={summary.total_neighborhoods ?? 0} /><Stat label="Incidencias abiertas" value={summary.open_incidents ?? 0} /></section>
    <section style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><button onClick={() => setForm(form === "user" ? null : "user")} style={actionStyle}>+ Nuevo usuario</button><button onClick={() => setForm(form === "neighborhood" ? null : "neighborhood")} style={actionStyle}>+ Nuevo vecindario</button><button onClick={() => setForm(form === "incident" ? null : "incident")} style={actionStyle}>+ Reportar incidencia</button></section>
    {form === "user" && <form onSubmit={(event) => create(event, "/users", { email: value(event, "email"), full_name: value(event, "full_name"), password: value(event, "password"), role_id: Number(value(event, "role_id")) })} style={formStyle}><h2>Crear usuario</h2><input name="full_name" required placeholder="Nombre completo" style={inputStyle} /><input name="email" required type="email" placeholder="Correo" style={inputStyle} /><input name="password" required type="password" placeholder="Contraseña temporal" style={inputStyle} /><select name="role_id" defaultValue="3" style={inputStyle}><option value="2">Líder</option><option value="3">Centinela</option></select><button style={actionStyle}>Guardar usuario</button></form>}
    {form === "neighborhood" && <form onSubmit={(event) => create(event, "/neighborhoods", { name: value(event, "name"), description: value(event, "description") })} style={formStyle}><h2>Crear vecindario</h2><input name="name" required placeholder="Nombre" style={inputStyle} /><input name="description" placeholder="Descripción" style={inputStyle} /><button style={actionStyle}>Guardar vecindario</button></form>}
    {form === "incident" && <form onSubmit={(event) => create(event, "/incidents", { title: value(event, "title"), description: value(event, "description"), category: "Otro", severity: "media", neighborhood_id: Number(value(event, "neighborhood_id")) })} style={formStyle}><h2>Reportar incidencia</h2><input name="title" required placeholder="Título" style={inputStyle} /><input name="description" required placeholder="Descripción" style={inputStyle} /><select name="neighborhood_id" defaultValue={String(neighborhoods[0]?.id ?? "")} style={inputStyle}>{neighborhoods.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select><button style={actionStyle}>Enviar reporte</button></form>}
    <Table title="Usuarios" rows={users} /><Table title="Vecindarios" rows={neighborhoods} /><Table title="Incidencias" rows={incidents} />
  </main></div>;
}

function value(event: FormEvent<HTMLFormElement>, name: string) { return (event.currentTarget.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value; }
const cardStyle = { background: "white", borderRadius: 18, padding: 18, boxShadow: "0 8px 24px rgba(15, 47, 87, 0.08)" } as const;
const thStyle = { textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "10px 8px" } as const;
const tdStyle = { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" } as const;
const actionStyle = { padding: "12px 16px", borderRadius: 10, border: 0, background: "#1d67b1", color: "white", cursor: "pointer" } as const;
const secondaryStyle = { padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", background: "white", cursor: "pointer" } as const;
const inputStyle = { padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", width: "100%" } as const;
const formStyle = { ...cardStyle, display: "grid", gap: 10 } as const;
