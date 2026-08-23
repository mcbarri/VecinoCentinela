export default function LoginPage() {
  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1>Iniciar sesión</h1>
      <form style={{ display: "grid", gap: 12 }}>
        <input placeholder="Correo electrónico" style={{ padding: 12, borderRadius: 10, border: "1px solid #cbd5e1" }} />
        <input placeholder="Contraseña" type="password" style={{ padding: 12, borderRadius: 10, border: "1px solid #cbd5e1" }} />
        <button type="submit" style={{ padding: 14, borderRadius: 10, background: "#1d67b1", color: "white", border: 0 }}>Entrar</button>
      </form>
    </main>
  );
}

