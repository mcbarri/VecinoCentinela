"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

const fieldStyle = { padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 15, width: "100%" } as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.localStorage.getItem("access_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
    // precargar nombre del usuario
    fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.json())
      .then((m) => {
        if (m.full_name) setFullName(m.full_name);
        if (m.phone) setPhone(m.phone);
      })
      .catch(() => {});
  }, [router]);

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError("El número de teléfono es obligatorio.");
      return;
    }
    if (!photo) {
      setError("Debes tomarte una fotografía (selfie).");
      return;
    }
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          phone: phone.trim(),
          avatar_url: photo,
          onboarding_complete: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo guardar");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f2f57, #1d67b1)", padding: 16 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, padding: 32, borderRadius: 20, background: "white", boxShadow: "0 16px 40px rgba(0,0,0,0.25)", display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0, color: "#0f2f57", fontSize: 24 }}>Completa tu perfil 🪲</h1>
        <p style={{ margin: 0, color: "#475569" }}>Es la primera vez que entras. Completa tus datos para continuar.</p>

        <label style={{ fontSize: 13, color: "#334155" }}>Tu fotografía (selfie) *</label>
        {photo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="selfie" style={{ width: 140, height: 140, borderRadius: "50%", objectFit: "cover", border: "3px solid #0f2f57" }} />
            <label style={{ color: "#2563eb", cursor: "pointer", fontSize: 14 }} htmlFor="photo2">Cambiar foto</label>
            <input id="photo2" type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={onPhoto} />
          </div>
        ) : (
          <label htmlFor="photo" style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: "26px 12px", textAlign: "center", color: "#0f2f57", cursor: "pointer", fontSize: 14 }}>
            📷 Tócate una foto con la cámara
            <input id="photo" type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={onPhoto} />
          </label>
        )}

        <label style={{ fontSize: 13, color: "#334155" }}>Nombre completo</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" style={fieldStyle} />

        <label style={{ fontSize: 13, color: "#334155" }}>Número de teléfono *</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5555-1234" style={fieldStyle} />

        {error && <p style={{ margin: 0, padding: 10, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ padding: 14, borderRadius: 10, background: "#0f2f57", color: "white", border: 0, fontSize: 16, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Guardando..." : "Guardar y entrar"}
        </button>
        <button type="button" onClick={() => { window.localStorage.removeItem("access_token"); window.localStorage.removeItem("refresh_token"); router.push("/login"); }} style={{ padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", background: "white", color: "#475569", fontSize: 14, cursor: "pointer" }}>Cerrar sesión</button>
      </form>
    </main>
  );
}
