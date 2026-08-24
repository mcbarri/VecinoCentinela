"use client";

import { Component, type ReactNode } from "react";
import MapaClient from "./MapaClient";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ErrorBoundary que captura errores de render del mapa y los reporta al servidor.
// El "Unhandled Runtime Error" de Next no siempre llega a window.onerror, pero SÍ
// pasa por el ErrorBoundary de React. Aquí lo atrapamos y mandamos el stack.
class MapaErrorBoundary extends Component<{ children: ReactNode }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    try {
      fetch(
        API_BASE.replace(/\/api\/v1$/, "") + "/api/v1/debug/crash",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: String(error && error.message ? error.message : error),
            stack: error && error.stack,
            componentStack: info && info.componentStack,
            url: typeof window !== "undefined" ? window.location.href : "",
          }),
        }
      ).catch(() => {});
    } catch (e) {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#0f2f57", color: "#fff", padding: 24, fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🪲</div>
          <h1 style={{ margin: 0 }}>¡Uy! Algo falló en el mapa</h1>
          <p style={{ opacity: 0.8 }}>Ya se reportó el error automáticamente. Tocá Reintentar.</p>
          <button onClick={() => this.setState({ hasError: false })} style={{ background: "#00c2a8", color: "#0f2f57", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, cursor: "pointer", fontSize: 16 }}>
            🔄 Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MapaPage() {
  return (
    <MapaErrorBoundary>
      <MapaClient />
    </MapaErrorBoundary>
  );
}
