export default function HomePage() {
  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <section style={{ background: "linear-gradient(135deg, #0f2f57, #1d67b1)", color: "white", borderRadius: 24, padding: 32 }}>
        <h1 style={{ fontSize: 44, margin: 0 }}>Vecino Centinela</h1>
        <p style={{ fontSize: 18, maxWidth: 760 }}>Plataforma comunitaria para reportar incidencias, coordinar patrullajes y fortalecer la seguridad vecinal.</p>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}>
        {[
          ["Súper administrador", "Control global de usuarios, vecindarios y auditoría."],
          ["Líder", "Gestión de su zona, comunicados y coordinación."],
          ["Centinela", "Reporte de incidencias y alertas vecinales."],
        ].map(([title, desc]) => (
          <article key={title} style={{ background: "white", borderRadius: 18, padding: 20, boxShadow: "0 8px 24px rgba(15, 47, 87, 0.08)" }}>
            <h2 style={{ marginTop: 0, color: "#0f2f57" }}>{title}</h2>
            <p>{desc}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
