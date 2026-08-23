const links = [
  { href: "/", label: "Inicio" },
  { href: "/login", label: "Acceso" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Sidebar() {
  return (
    <aside style={{ width: 240, background: "#0f2f57", color: "white", minHeight: "100vh", padding: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Vecino Centinela</div>
      <nav style={{ display: "grid", gap: 12 }}>
        {links.map((link) => (
          <a key={link.href} href={link.href} style={{ color: "white", textDecoration: "none", padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.08)" }}>
            {link.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

