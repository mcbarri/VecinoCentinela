"use client";

import { FormEvent, useState } from "react";
import { API_BASE } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "No se pudo iniciar sesión");
      window.localStorage.setItem("vc_access_token", data.access_token);
      window.localStorage.setItem("vc_refresh_token", data.refresh_token);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <a href="/" style={{ color: "#0f2f57" }}>Vecino Centinela</a>
      <h1>Iniciar sesión</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <label>Correo electrónico<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={{ display: "block", width: "100%", padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", marginTop: 6 }} /></label>
        <label>Contraseña<input required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña" type="password" style={{ display: "block", width: "100%", padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", marginTop: 6 }} /></label>
        {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
        <button disabled={loading} type="submit" style={{ padding: 14, borderRadius: 10, background: "#1d67b1", color: "white", border: 0, cursor: "pointer" }}>{loading ? "Entrando..." : "Entrar"}</button>
      </form>
    </main>
  );
}
