export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f2f57, #1d67b1)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <section style={{ width: "100%", maxWidth: 520, textAlign: "center", padding: 40, borderRadius: 24, background: "rgba(255,255,255,0.06)", color: "white", backdropFilter: "blur(6px)" }}>
        <h1 style={{ fontSize: 42, margin: "0 0 8px" }}>Vecino Centinela</h1>
        <p style={{ fontSize: 17, opacity: 0.9, marginBottom: 28 }}>Plataforma comunitaria de seguridad vecinal.</p>
        <a href="/login" style={{ display: "inline-block", background: "#fff", color: "#0f2f57", padding: "14px 34px", borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: 16 }}>
          Entrar a la plataforma
        </a>
      </section>
    </main>
  );
}
