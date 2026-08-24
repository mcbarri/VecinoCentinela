"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type Row = Record<string, unknown>;

interface UsersRow {
  id: number;
  email: string;
  full_name?: string | null;
  role_name?: string;
  role_id?: number;
  neighborhood_id?: number | null;
  is_active?: boolean;
  phone?: string | null;
  avatar_url?: string | null;
  photo_required?: boolean;
  code?: string | null;
}
interface NeighborhoodRow {
  id: number;
  name: string;
  description?: string | null;
}
interface IncidentRow {
  id: number;
  title: string;
  description?: string;
  category?: string;
  severity?: string;
  status?: string;
  neighborhood_id?: number;
}
interface Summary {
  total_users: number;
  total_leaders: number;
  total_centinels: number;
  total_neighborhoods: number;
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ background: "white", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(15,47,87,0.08)" }}>
      <div style={{ color: "#64748b", fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#0f2f57" }}>{value}</div>
    </div>
  );
}

function DataTable({ title, headers, rows }: { title: string; headers: string[]; rows: Row[] }) {
  return (
    <section style={{ background: "white", borderRadius: 18, padding: 18, boxShadow: "0 8px 24px rgba(15,47,87,0.08)" }}>
      <h2 style={{ marginTop: 0, color: "#0f2f57" }}>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Sin registros.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "10px 8px", color: "#334155" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {headers.map((h) => (
                    <td key={h} style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>
                      {row[h] == null || row[h] === "" ? "—" : String(row[h])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  marginTop: 4,
  marginBottom: 12,
  fontSize: 14,
};

function Modal({ title, onClose, children, onSave, saving }: {
  title: string; onClose: () => void; children: React.ReactNode; onSave: () => void; saving: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "white", borderRadius: 18, padding: 24, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h2 style={{ marginTop: 0, color: "#0f2f57" }}>{title}</h2>
        {children}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #cbd5e1", background: "white", cursor: "pointer", color: "#334155" }}>Cancelar</button>
          <button onClick={onSave} disabled={saving} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#0f2f57", color: "white", cursor: "pointer", fontWeight: 600 }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<{ full_name?: string | null; role?: string | null; email?: string | null; phone?: string | null; avatar_url?: string | null; onboarding_complete?: boolean; neighborhood_name?: string | null; photo_required?: boolean; code?: string | null } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<UsersRow[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // modales
  const [showUser, setShowUser] = useState(false);
  const [showNbh, setShowNbh] = useState(false);
  const [showInc, setShowInc] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editUser, setEditUser] = useState<UsersRow | null>(null);
  const [saving, setSaving] = useState(false);

  // forms
  const [uform, setUform] = useState({ email: "", full_name: "", password: "", role_id: "30", neighborhood_id: "", phone: "" });
  const [nform, setNform] = useState({ name: "", description: "" });
  const [iform, setIform] = useState({ title: "", description: "", category: "", severity: "media", neighborhood_id: "" });
  const [pform, setPform] = useState({ full_name: "", phone: "" });

  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (res.status === 401) {
      router.push("/login");
      throw new Error("Sesión expirada");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Error ${res.status}`);
    }
    return res.json();
  }, [token, router]);

  const load = useCallback(async () => {
    try {
      const [m, s, u, n, i] = await Promise.all([
        api("/me"),
        api("/dashboard/summary"),
        api("/users"),
        api("/neighborhoods"),
        api("/incidents"),
      ]);
      setMe(m);
      setSummary(s);
      setUsers(u ?? []);
      setNeighborhoods(n ?? []);
      setIncidents(i ?? []);
      if (m.onboarding_complete === false && m.role !== "superadmin") {
        router.push("/onboarding");
        return;
      }
      setError(null);
    } catch (e) {
      if (!(e instanceof Error && e.message === "Sesión expirada")) setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => {
    const t = window.localStorage.getItem("access_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const logout = () => {
    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("refresh_token");
    router.push("/login");
  };

  const saveUser = async () => {
    if (!uform.email.trim() || !uform.password) {
      alert("Email y Contraseña son obligatorios");
      setSaving(false);
      return;
    }
    setSaving(true);
    try {
      const res = await api("/users", {
        method: "POST",
        body: JSON.stringify({
          email: uform.email,
          full_name: uform.full_name,
          password: uform.password,
          role_id: Number(uform.role_id),
          neighborhood_id: uform.neighborhood_id ? Number(uform.neighborhood_id) : null,
          phone: uform.phone || null,
        }),
      });
      setShowUser(false);
      setUform({ email: "", full_name: "", password: "", role_id: "30", neighborhood_id: "", phone: "" });
      await load();
      if (res?.code) alert(`✅ Usuario creado. Su código de identificación es: ${res.code}`);
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveNeighborhood = async () => {
    setSaving(true);
    try {
      await api("/neighborhoods", { method: "POST", body: JSON.stringify(nform) });
      setShowNbh(false);
      setNform({ name: "", description: "" });
      await load();
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveIncident = async () => {
    if (!iform.title.trim() || !iform.category.trim() || !iform.neighborhood_id) {
      alert("Completa Título, Categoría y selecciona un Vecindario");
      setSaving(false);
      return;
    }
    setSaving(true);
    try {
      await api("/incidents", {
        method: "POST",
        body: JSON.stringify({
          title: iform.title,
          description: iform.description,
          category: iform.category,
          severity: iform.severity,
          neighborhood_id: Number(iform.neighborhood_id),
        }),
      });
      setShowInc(false);
      setIform({ title: "", description: "", category: "", severity: "media", neighborhood_id: "" });
      await load();
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isSuperadmin = me?.role === "superadmin";
  const isLeader = me?.role === "leader";
  const label = { "28": "Super Admin", "29": "Líder", "30": "Centinela" } as Record<string, string>;

  // Roles que puede asignar el usuario logueado según su jerarquía
  const allowedRoles = isSuperadmin
    ? [{ id: "28", name: "Super Admin" }, { id: "29", name: "Líder" }, { id: "30", name: "Centinela" }]
    : isLeader
    ? [{ id: "29", name: "Líder" }, { id: "30", name: "Centinela" }]
    : [{ id: "30", name: "Centinela" }];

  const openEditUser = (u: UsersRow) => {
    setEditUser({
      ...u,
      full_name: u.full_name ?? "",
      phone: u.phone ?? "",
    });
  };

  const saveEditUser = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await api(`/users/${editUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: editUser.full_name || null,
          phone: editUser.phone || null,
          role_id: editUser.role_id ? Number(editUser.role_id) : undefined,
          photo_required: editUser.photo_required ?? false,
        }),
      });
      setEditUser(null);
      await load();
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deactivateUser = async (u: UsersRow) => {
    if (!window.confirm(`¿Dar de baja a ${u.full_name || u.email}?`)) return;
    setSaving(true);
    try {
      await api(`/users/${u.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Perfil del usuario logueado
  const saveProfile = async () => {
    setSaving(true);
    try {
      const m = await api("/me", { method: "PATCH", body: JSON.stringify(pform) });
      setMe((prev) => ({ ...prev, ...m }));
      setShowProfile(false);
      await load();
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deactivateMe = async () => {
    if (!window.confirm("¿Darte de baja? Esto desactiva tu cuenta y cierra la sesión.")) return;
    try {
      await api("/me", { method: "DELETE" });
      window.localStorage.removeItem("access_token");
      window.localStorage.removeItem("refresh_token");
      router.push("/login");
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
  };

  const openProfile = () => {
    setPform({ full_name: me?.full_name ?? "", phone: me?.phone ?? "" });
    setShowProfile(true);
  };

  const Avatar = ({ url, name, size = 34 }: { url?: string | null; name?: string | null; size?: number }) => (
    url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="avatar" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
    ) : (
      <div style={{ width: size, height: size, borderRadius: "50%", background: "#0f2f57", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.45 }}>
        {(name || "U").trim().charAt(0).toUpperCase()}
      </div>
    )
  );

  return (
    <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto", display: "grid", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 36, marginBottom: 8, color: "#0f2f57" }}>Dashboard</h1>
          <p style={{ margin: 0, color: "#475569" }}>Vista operativa de Vecino Centinela.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {me?.full_name && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "white", padding: "6px 12px 6px 6px", borderRadius: 40, boxShadow: "0 4px 14px rgba(0,0,0,0.08)", cursor: "pointer" }} onClick={openProfile} title="Mi perfil">
              <Avatar url={me?.avatar_url} name={me?.full_name} />
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#0f2f57" }}>{me.full_name} {me.code ? <span style={{ color: "#0f766e", fontWeight: 700 }}>· {me.code}</span> : null}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{me.role === "superadmin" ? "Súper administrador" : me.role === "leader" ? "Líder" : me.role === "sentinel" ? "Centinela" : me.role}</div>
              </div>
              <span style={{ marginLeft: 4, color: "#94a3b8" }}>⚙️</span>
            </div>
          )}
          <button onClick={() => router.push("/mapa")} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#0f2f57", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
            🗺️ Mapa en Vivo
          </button>
          <button onClick={logout} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #fecaca", background: "#fff5f5", color: "#b91c1c", cursor: "pointer", fontWeight: 600 }}>
            🚪 Cerrar sesión
          </button>
        </div>
      </header>

      {error && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "12px 16px", borderRadius: 10 }}>⚠️ {error}</div>}

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <StatCard title="Usuarios" value={summary?.total_users ?? 0} />
        <StatCard title="Líderes" value={summary?.total_leaders ?? 0} />
        <StatCard title="Centinelas" value={summary?.total_centinels ?? 0} />
        <StatCard title="Vecindarios" value={summary?.total_neighborhoods ?? 0} />
      </section>

      <section style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {isSuperadmin && (
          <button onClick={() => setShowNbh(true)} style={{ padding: "11px 18px", borderRadius: 10, border: "none", background: "#0f2f57", color: "white", cursor: "pointer", fontWeight: 600 }}>➕ Nuevo Vecindario</button>
        )}
        {(isSuperadmin || isLeader) && (
          <button onClick={() => setShowUser(true)} style={{ padding: "11px 18px", borderRadius: 10, border: "none", background: "#2563eb", color: "white", cursor: "pointer", fontWeight: 600 }}>➕ Nuevo Usuario</button>
        )}
        {(isSuperadmin || me?.role === "leader") && (
          <button onClick={() => setShowInc(true)} style={{ padding: "11px 18px", borderRadius: 10, border: "none", background: "#d97706", color: "white", cursor: "pointer", fontWeight: 600 }}>➕ Nueva Incidencia</button>
        )}
      </section>

      <section style={{ background: "white", borderRadius: 18, padding: 18, boxShadow: "0 8px 24px rgba(15,47,87,0.08)" }}>
        <h2 style={{ marginTop: 0, color: "#0f2f57" }}>Usuarios <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 400 }}>— haz clic en una fila para editarla</span></h2>
        {users.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>Sin registros.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ID", "Código", "Usuario", "Nombre", "Rol", "Teléfono", "Foto"].map((h) => (
                    <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "10px 8px", color: "#334155" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} onClick={() => openEditUser(u)} style={{ cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{u.id}</td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{u.code ?? "—"}</td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{u.email}</td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{u.full_name ?? "—"}</td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{label[String(u.role_id)] ?? u.role_name ?? "—"}</td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{u.phone ?? "—"}</td>
                    <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>
                      {u.avatar_url ? <Avatar url={u.avatar_url} name={u.full_name} size={28} /> : <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>{u.photo_required ? "📷" : "—"}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <DataTable
        title="Vecindarios"
        headers={["ID", "Nombre", "Descripción"]}
        rows={neighborhoods.map((n) => ({ ID: n.id, Nombre: n.name, Descripción: n.description ?? "—" })) as Row[]}
      />
      <DataTable
        title="Incidencias"
        headers={["ID", "Título", "Categoría", "Severidad", "Estado"]}
        rows={incidents.map((i) => ({ ID: i.id, Título: i.title, Categoría: i.category, Severidad: i.severity, Estado: i.status })) as Row[]}
      />

      {showNbh && (
        <Modal title="Nuevo Vecindario" onClose={() => setShowNbh(false)} onSave={saveNeighborhood} saving={saving}>
          <label style={{ fontSize: 13, color: "#334155" }}>Nombre</label>
          <input style={fieldStyle} value={nform.name} onChange={(e) => setNform({ ...nform, name: e.target.value })} placeholder="Ej: Villa Nueva" />
          <label style={{ fontSize: 13, color: "#334155" }}>Descripción</label>
          <input style={fieldStyle} value={nform.description} onChange={(e) => setNform({ ...nform, description: e.target.value })} placeholder="Opcional" />
        </Modal>
      )}

      {showUser && (
        <Modal title="Nuevo Usuario" onClose={() => setShowUser(false)} onSave={saveUser} saving={saving}>
          <label style={{ fontSize: 13, color: "#334155" }}>Email *</label>
          <input style={fieldStyle} type="email" value={uform.email} onChange={(e) => setUform({ ...uform, email: e.target.value })} placeholder="usuario@correo.com" />
          <label style={{ fontSize: 13, color: "#334155" }}>Nombre completo</label>
          <input style={fieldStyle} value={uform.full_name} onChange={(e) => setUform({ ...uform, full_name: e.target.value })} placeholder="Nombre" />
          <label style={{ fontSize: 13, color: "#334155" }}>Contraseña *</label>
          <input style={fieldStyle} type="password" value={uform.password} onChange={(e) => setUform({ ...uform, password: e.target.value })} placeholder="••••••" />
          <label style={{ fontSize: 13, color: "#334155" }}>Rol</label>
          <select style={fieldStyle} value={uform.role_id} onChange={(e) => setUform({ ...uform, role_id: e.target.value })}>
            {allowedRoles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <label style={{ fontSize: 13, color: "#334155" }}>Teléfono</label>
          <input style={fieldStyle} value={uform.phone} onChange={(e) => setUform({ ...uform, phone: e.target.value })} placeholder="5555-1234 (opcional)" />
          <label style={{ fontSize: 13, color: "#334155" }}>Vecindario</label>
          <select style={fieldStyle} value={uform.neighborhood_id} onChange={(e) => setUform({ ...uform, neighborhood_id: e.target.value })}>
            <option value="">— Sin vecindario —</option>
            {neighborhoods.map((nb) => (
              <option key={nb.id} value={nb.id}>{nb.name}</option>
            ))}
          </select>
        </Modal>
      )}

      {showInc && (
        <Modal title="Nueva Incidencia" onClose={() => setShowInc(false)} onSave={saveIncident} saving={saving}>
          <label style={{ fontSize: 13, color: "#334155" }}>Título *</label>
          <input style={fieldStyle} value={iform.title} onChange={(e) => setIform({ ...iform, title: e.target.value })} placeholder="Ej: Robo en parque" />
          <label style={{ fontSize: 13, color: "#334155" }}>Descripción</label>
          <textarea style={{ ...fieldStyle, minHeight: 60 }} value={iform.description} onChange={(e) => setIform({ ...iform, description: e.target.value })} placeholder="Detalle" />
          <label style={{ fontSize: 13, color: "#334155" }}>Categoría *</label>
          <input style={fieldStyle} value={iform.category} onChange={(e) => setIform({ ...iform, category: e.target.value })} placeholder="Ej: Robo, Alumbrado" />
          <label style={{ fontSize: 13, color: "#334155" }}>Severidad</label>
          <select style={fieldStyle} value={iform.severity} onChange={(e) => setIform({ ...iform, severity: e.target.value })}>
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
          <label style={{ fontSize: 13, color: "#334155" }}>Vecindario *</label>
          <select style={fieldStyle} value={iform.neighborhood_id} onChange={(e) => setIform({ ...iform, neighborhood_id: e.target.value })}>
            <option value="">— Selecciona —</option>
            {neighborhoods.map((nb) => (
              <option key={nb.id} value={nb.id}>{nb.name}</option>
            ))}
          </select>
        </Modal>
      )}

      {showProfile && me && (
        <Modal title="Mi perfil" onClose={() => setShowProfile(false)} onSave={saveProfile} saving={saving}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <Avatar url={me.avatar_url} name={me.full_name} size={54} />
            <div>
              <div style={{ fontWeight: 700, color: "#0f2f57" }}>{me.full_name}</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>{me.email}</div>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>{label[String(me.role === "superadmin" ? "28" : me.role === "leader" ? "29" : "30")] ?? me.role} {me.neighborhood_name ? `· ${me.neighborhood_name}` : ""}</div>
            </div>
          </div>
          <label style={{ fontSize: 13, color: "#334155" }}>Nombre completo</label>
          <input style={fieldStyle} value={pform.full_name} onChange={(e) => setPform({ ...pform, full_name: e.target.value })} />
          <label style={{ fontSize: 13, color: "#334155" }}>Teléfono</label>
          <input style={fieldStyle} value={pform.phone} onChange={(e) => setPform({ ...pform, phone: e.target.value })} placeholder="5555-1234" />
          {me.role !== "superadmin" && (
            <button onClick={deactivateMe} style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "1px solid #fecaca", background: "#fff5f5", color: "#b91c1c", cursor: "pointer", fontWeight: 600 }}>
              🗑️ Darse de baja (eliminar cuenta)
            </button>
          )}
        </Modal>
      )}

      {editUser && (
        <Modal title={`Ficha de usuario: ${editUser.full_name || editUser.email}`} onClose={() => setEditUser(null)} onSave={saveEditUser} saving={saving}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Avatar url={editUser.avatar_url} name={editUser.full_name} size={44} />
            <div style={{ color: "#64748b", fontSize: 13 }}>{editUser.email}</div>
          </div>
          <label style={{ fontSize: 13, color: "#334155" }}>Nombre completo</label>
          <input style={fieldStyle} value={editUser.full_name ?? ""} onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })} />
          <label style={{ fontSize: 13, color: "#334155" }}>Código de identificación <span style={{ color: "#94a3b8", fontWeight: 400 }}>(automático, no editable)</span></label>
          <input style={{ ...fieldStyle, background: "#f1f5f9", color: "#475569" }} value={editUser.code ?? "—"} disabled />
          <label style={{ fontSize: 13, color: "#334155" }}>Teléfono</label>
          <input style={fieldStyle} value={editUser.phone ?? ""} onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })} placeholder="5555-1234" />
          <label style={{ fontSize: 13, color: "#334155" }}>Rol</label>
          <select style={fieldStyle} value={String(editUser.role_id ?? "")} onChange={(e) => setEditUser({ ...editUser, role_id: Number(e.target.value) })}>
            {allowedRoles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#334155", marginTop: 6 }}>
            <input type="checkbox" checked={editUser.photo_required ?? false} onChange={(e) => setEditUser({ ...editUser, photo_required: e.target.checked })} />
            📷 Exigir fotografía al ingresar
          </label>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>Si se exige, el usuario debe pasarse una foto (cámara) y compararla con la guardada.</div>
          {editUser.role_name !== "superadmin" && (
            <button onClick={() => deactivateUser(editUser)} style={{ width: "100%", marginTop: 12, padding: "11px", borderRadius: 10, border: "1px solid #fecaca", background: "#fff5f5", color: "#b91c1c", cursor: "pointer", fontWeight: 600 }}>
              🗑️ Dar de baja
            </button>
          )}
        </Modal>
      )}
    </main>
  );
}
