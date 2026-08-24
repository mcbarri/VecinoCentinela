"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// Cargar Leaflet desde CDN (gratis, sin API key)
declare global {
  interface Window {
    L: any;
  }
}

interface LiveUser {
  user_id: number;
  full_name?: string | null;
  role?: string | null;
  code?: string | null;
  latitude: number;
  longitude: number;
  updated_at?: string | null;
}

interface RoutePoint {
  lat: number;
  lng: number;
}

export default function MapaClient() {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const incidentMarkersRef = useRef<Record<string, any>>({});
  const routeLayerRef = useRef<any>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<string[]>([]);

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapInit, setMapInit] = useState(false);

  // Estados para rutas
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeName, setRouteName] = useState("");
  const [drawingRoute, setDrawingRoute] = useState(false);

  // Estados walkie
  const [walkieOn, setWalkieOn] = useState(false);
  const [isTalking, setIsTalking] = useState(false);

  // Estilos (mismo look azul del dashboard)
  const styles: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", background: "#0f2f57", padding: 20, fontFamily: "system-ui, sans-serif" },
    topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" },
    title: { color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 },
    btn: { background: "#00c2a8", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontWeight: 600, fontSize: 14 },
    btnGhost: { background: "transparent", color: "#9fb3d1", border: "1px solid #3a5a7a", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontSize: 14 },
    mapWrap: { width: "100%", height: "60vh", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.35)", position: "relative" as const },
    panel: { background: "#fff", borderRadius: 14, padding: 16, marginTop: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" },
    panelTitle: { color: "#0f2f57", fontSize: 16, fontWeight: 700, marginTop: 0 },
    badge: { display: "inline-block", background: "#e0f7f4", color: "#0f766e", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 },
    input: { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14, width: "100%", boxSizing: "border-box" as const, marginBottom: 8 },
    userRow: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 },
    walkieBtn: { width: "100%", padding: "18px 0", borderRadius: 14, border: "none", fontWeight: 700, fontSize: 16, cursor: "pointer", color: "#fff", transition: "all .15s" },
    micBtn: { width: "100%", padding: "14px 0", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  };

  // Cargar Leaflet CDN una sola vez
  const ensureLeaflet = useCallback((): Promise<any> => {
    return new Promise((resolve) => {
      if (window.L) return resolve(window.L);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => resolve(window.L);
      document.head.appendChild(script);
    });
  }, []);

  // Inicializar mapa
  useEffect(() => {
    const t = localStorage.getItem("access_token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
    setLoading(false);

    (async () => {
      try {
        const L = await ensureLeaflet();
        const map = L.map(mapRef.current!).setView([14.6349, -90.5069], 12); // Guatemala central
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        leafletRef.current = map;
        routeLayerRef.current = L.layerGroup().addTo(map);

        map.on("click", (e: any) => {
          if (!drawingRoute) return;
          setRoutePoints((prev) => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
        });

        setMapInit(true);
      } catch (err: any) {
        setError("No se pudo cargar el mapa: " + err.message);
      }
    })();

    return () => {
      if (leafletRef.current) leafletRef.current.remove();
    };
  }, [router, ensureLeaflet]);

  // Obtener posición GPS del navegador y publicarla
  const publishLocation = useCallback(
    async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setMyPos({ lat, lng });
      if (leafletRef.current && !leafletRef.current.__centeredOnMe) {
        // Centrar el mapa en la ubicación REAL del usuario (no en el centro por defecto)
        leafletRef.current.setView([lat, lng], 15);
        leafletRef.current.__centeredOnMe = true;
      }
      if (leafletRef.current) {
        const L = window.L;
        if (!markersRef.current["me"]) {
          const icon = L.divIcon({ className: "", html: '<div style="width:16px;height:16px;border-radius:50%;background:#00c2a8;border:3px solid #fff;box-shadow:0 0 0 3px #00c2a8"></div>' });
          markersRef.current["me"] = L.marker([lat, lng], { icon }).addTo(leafletRef.current);
        } else {
          markersRef.current["me"].setLatLng([lat, lng]);
        }
      }
      try {
        if (!token) return;
        await fetch(`${API_BASE}/realtime/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ latitude: lat, longitude: lng }),
        });
      } catch (e) {
        /* silencioso */
      }
    },
    [token]
  );

  // Activar geolocalización continua
  useEffect(() => {
    if (!mapInit || !token) return;
    if (!("geolocation" in navigator)) {
      setError("Tu navegador no soporta ubicación.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      publishLocation,
      (err) => setError("No se pudo obtener tu ubicación: " + err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [mapInit, token, publishLocation]);

  // Cargar posiciones de todos los usuarios + actualizar en vivo
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/realtime/locations`, { headers: { Authorization: `Bearer ${token}` } });
        const data: LiveUser[] = await res.json();
        setLiveUsers(data);
        if (leafletRef.current) {
          const L = window.L;
          data.forEach((u) => {
            if (u.user_id === undefined) return;
            const isMe = u.user_id === JSON.parse(localStorage.getItem("user") || "{}").id;
            // Color según rol: líder = verde, centinela = azul, yo = celeste
            let color = "#2563eb"; // centinela azul
            if (isMe) color = "#00c2a8";
            else if (u.role === "leader") color = "#16a34a"; // líder verde
            else if (u.role === "superadmin") color = "#f59e0b"; // amber
            // Etiqueta con el código (L01/C01) sobre la bolita
            const label = u.code ? u.code : (u.role === "leader" ? "L" : "C");
            const size = isMe ? 16 : 13;
            const icon = L.divIcon({
              className: "",
              html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${color}">`
                + `<span style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:${color};color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;white-space:nowrap">${label}</span></div>`,
            });
            const m = L.marker([u.latitude, u.longitude], { icon });
            const poplabel = u.code ? `${u.code} · ${u.full_name ?? "Usuario"}${u.role ? " (" + u.role + ")" : ""}` : (u.full_name ? `${u.full_name}${u.role ? " · " + u.role : ""}` : "Usuario");
            m.bindPopup(poplabel);
            m.addTo(leafletRef.current);
            if (markersRef.current[u.user_id]) leafletRef.current.removeLayer(markersRef.current[u.user_id]);
            markersRef.current[u.user_id] = m;
          });
        }
      } catch (e) {
        /* noop */
      }
    };
    load();

    // Cargar incidentes/alertas (rojo en el mapa) junto con las ubicaciones
    const loadIncidents = async () => {
      try {
        const res = await fetch(`${API_BASE}/incidents`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        setIncidents(data);
        if (leafletRef.current) {
          const L = window.L;
          // limpiar marcadores rojos previos
          Object.values(incidentMarkersRef.current).forEach((m) => leafletRef.current?.removeLayer(m));
          incidentMarkersRef.current = {};
          data.forEach((inc: any) => {
            if (inc.latitude == null || inc.longitude == null) return;
            if (inc.status !== "abierta") return; // solo alertas activas
            const icon = L.divIcon({
              className: "",
              html: `<div style="width:16px;height:16px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 0 0 2px #ef4444"></div>`,
            });
            const m = L.marker([Number(inc.latitude), Number(inc.longitude)], { icon });
            m.bindPopup(`🚨 ${inc.title}${inc.description ? "<br/>" + inc.description : ""}`);
            m.addTo(leafletRef.current!);
            incidentMarkersRef.current[inc.id] = m;
          });
        }
      } catch (e) {}
    };
    loadIncidents();

    // WebSocket para actualizaciones en vivo
    const wsUrl = API_BASE.replace("https://", "wss://").replace("http://", "ws://").replace("/api/v1", "/api/v1/realtime/ws");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "update") {
          load();
          loadIncidents();
        }
      } catch (e) {}
    };
    return () => ws.close();
  }, [token, mapInit]);

  // Redibujar ruta en el mapa
  useEffect(() => {
    if (!leafletRef.current || !routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();
    if (routePoints.length > 1) {
      window.L.polyline(routePoints.map((p) => [p.lat, p.lng]), { color: "#00c2a8", weight: 4 }).addTo(routeLayerRef.current);
    }
    routePoints.forEach((p) => {
      window.L.circleMarker([p.lat, p.lng], { radius: 5, color: "#00c2a8", fillColor: "#00c2a8", fillOpacity: 1 }).addTo(routeLayerRef.current);
    });
  }, [routePoints]);

  // Guardar ruta
  const saveRoute = async () => {
    if (routePoints.length < 2) return alert("Traza al menos 2 puntos en el mapa.");
    const res = await fetch(`${API_BASE}/realtime/patrol-routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: routeName || "Ruta de patrulla", points: routePoints.map((p) => [p.lat, p.lng]) }),
    });
    if (res.ok) {
      alert("Ruta guardada ✅");
      setRoutePoints([]);
      setRouteName("");
      setDrawingRoute(false);
      routeLayerRef.current?.clearLayers();
    } else {
      alert("Error al guardar la ruta.");
    }
  };

  // ── WALKIE TALKIE ──
  // Presionar (push-to-talk): graba y envía por WebSocket
  const startTalk = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecRef.current = rec;
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) {
          e.data.arrayBuffer().then((buf) => {
            const base64 = arrayBufferToBase64(buf);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "audio", chunk: base64 }));
            }
          });
        }
      };
      rec.start(300); // chunks cada 300ms
      setIsTalking(true);
    } catch (err: any) {
      alert("Microfono no disponible: " + err.message);
    }
  };

  const stopTalk = () => {
    mediaRecRef.current?.stop();
    audioChunksRef.current = [];
    setIsTalking(false);
    // parar streams
    mediaRecRef.current?.stream?.getTracks().forEach((t) => t.stop());
  };

  // Recibir audio del walkie (del WebSocket broadcast)
  const playAudioChunk = useCallback((b64: string) => {
    if (!audioElRef.current) return;
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      const audio = audioElRef.current;
      audio.src = url;
      audio.play().catch(() => {});
    } catch (e) {}
    setTimeout(() => URL.revokeObjectURL(audioElRef.current?.src ?? ""), 2000);
  }, []);

  // Interceptar mensajes de audio en el WS
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const handler = (ev: any) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "audio") playAudioChunk(msg.chunk);
      } catch (e) {}
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [mapInit, playAudioChunk]);

  const toggleWalkie = () => {
    setWalkieOn((v) => !v);
  };

  return (
    <div style={styles.page}>
      <audio ref={audioElRef} />
      <div style={styles.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={styles.btnGhost} onClick={() => router.push("/dashboard")}>← Panel</button>
          <h1 style={styles.title}>🗺️ Vecino Centinela — Mapa en Vivo</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {walkieOn ? (
            <button style={{ ...styles.walkieBtn, background: "#ef4444" }} onClick={toggleWalkie}>🔴 Walkie ON (pulsa para hablar)</button>
          ) : (
            <button style={{ ...styles.walkieBtn, background: "#475569" }} onClick={toggleWalkie}>🔇 Walkie OFF</button>
          )}
        </div>
      </div>

      {error && <div style={{ background: "#fecaca", color: "#991b1b", padding: 10, borderRadius: 8, marginBottom: 12 }}>⚠️ {error}</div>}

      <div style={styles.mapWrap}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        {!mapInit && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#e2e8f0", color: "#475569" }}>Cargando mapa…</div>}
      </div>

      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>📍 Usuarios conectados ({liveUsers.length})</h3>
        {liveUsers.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>Aún no hay ubicaciones registradas. Alguien debe entrar al mapa desde su teléfono.</p>
        ) : (
          liveUsers.map((u) => (
            <div key={u.user_id} style={styles.userRow}>
              <span>👤 {u.full_name || "Usuario"}</span>
              <span style={styles.badge}>{u.code ? u.code + " · " : ""}{u.role || "usuario"}</span>
            </div>
          ))
        )}
      </div>

      {walkieOn && (
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>🔊 Walkie Talkie</h3>
          <p style={{ fontSize: 13, color: "#64748b" }}>Mantén presionado para hablar. Todos los conectados escuchan tu voz en vivo.</p>
          <button
            style={{ ...styles.micBtn, background: isTalking ? "#ef4444" : "#00c2a8", boxShadow: "0 4px 14px rgba(0,0,0,0.15)" }}
            onMouseDown={startTalk}
            onMouseUp={stopTalk}
            onMouseLeave={isTalking ? stopTalk : undefined}
            onTouchStart={startTalk}
            onTouchEnd={stopTalk}
          >
            {isTalking ? "🎙️ HABLANDO… (suelta)" : "🎙️ PULSA PARA HABLAR"}
          </button>
        </div>
      )}

      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>🛤️ Ruta de patrulla</h3>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          {drawingRoute ? "Haz clic en el mapa para marcar puntos de tu ruta." : "Activa el trazo y haz clic en el mapa para marcar tu recorrido de vigilancia."}
        </p>
        <input style={styles.input} placeholder="Nombre de la ruta (ej: Ruta sector A)" value={routeName} onChange={(e) => setRouteName(e.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...styles.btn, background: drawingRoute ? "#ef4444" : "#00c2a8" }} onClick={() => setDrawingRoute((v) => !v)}>
            {drawingRoute ? "✋ Terminar trazo" : "✏️ Trazar ruta"}
          </button>
          {routePoints.length > 0 && (
            <button style={{ ...styles.btn, background: "#0ea5e9" }} onClick={saveRoute}>
              💾 Guardar ruta ({routePoints.length} ptos)
            </button>
          )}
          {routePoints.length > 0 && (
            <button style={{ ...styles.btnGhost, background: "#f1f5f9", color: "#334155" }} onClick={() => { setRoutePoints([]); routeLayerRef.current?.clearLayers(); }}>
              🗑️ Limpiar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
