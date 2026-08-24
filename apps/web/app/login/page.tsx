"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo iniciar sesión");
      window.localStorage.setItem("access_token", data.access_token);
      if (data.refresh_token) window.localStorage.setItem("refresh_token", data.refresh_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f2f57, #1d67b1)", padding: 16 }}>
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 400, padding: 32, borderRadius: 20, background: "white", boxShadow: "0 16px 40px rgba(0,0,0,0.25)", display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0, color: "#0f2f57", fontSize: 26 }}>Vecino Centinela</h1>
      <p style={{ margin: 0, color: "#475569" }}>Inicia sesión para continuar</p>
      <input required type="email" placeholder="Correo electrónico" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} />
      <input required type="password" placeholder="Contraseña" value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} />
      {error && <p style={{ margin: 0, padding: 10, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>{error}</p>}
      <button type="submit" disabled={loading} style={{ padding: 14, borderRadius: 10, background: "#0f2f57", color: "white", border: 0, fontSize: 16, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>{loading ? "Entrando..." : "Entrar"}</button>
    </form>
  </main>;
}

const inputStyle = { padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 15, width: "100%" } as const;
