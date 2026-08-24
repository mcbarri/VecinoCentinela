"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { start as startPresence } from "../../lib/presence";

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
  latitude: number | null;
  longitude: number | null;
  updated_at?: string | null;
  online?: boolean;
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
  // Handler de audio regrabable: al crear/reconectar el WS se asigna a onmessage
  // para que el walkie entrante SIEMPRE se maneje, sin depender de otro efecto
  // (evita perder el listener si el WebSocket se recrea).
  const audioHandlerRef = useRef<(b64: string) => void>(() => {});
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<string[]>([]);

  // ══ STREAM CONTINUO con MediaSource (la forma ESTÁNDAR y definitiva) ══
  // El problema real: el emisor manda fragments de 300ms que MediaRecorder
  // generó con timeslice. Cada fragmento es un cluster de webm fragmentado
  // SIN la cabecera del contenedor, por lo que reproduciéndolo como un Blob
  // webm aislado muchos navegadores Android NO lo pueden decodificar (de ahí
  // que antes no se oyera NADA). Con MediaSource + SourceBuffer en modo
  // 'sequence' se encadenan los clusters SIN cabecera en un único stream
  // continuo que sí se descodifica, con latencia real.
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const msReadyRef = useRef(false);

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapInit, setMapInit] = useState(false);
  const [myName, setMyName] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<string>("#00c2a8");

  // Estados para rutas
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeName, setRouteName] = useState("");
  const [drawingRoute, setDrawingRoute] = useState(false);

  // Estados walkie (push-to-talk): off | armed | talking
  const [walkieState, setWalkieState] = useState<"off" | "armed" | "talking">("off");
  // Quién está transmitiendo AHORA en el canal (lo ven todos). false = nadie habla,
  // true = alguien tiene el botón presionado y enviando voz. Lo pinta la bocinita.
  const [transmitting, setTransmitting] = useState(false);
  const pressStartRef = useRef(0);
  const pressTimerRef = useRef<any>(null);

  // Reporte de errores de runtime del cliente al servidor (diagnóstico).
  // Cualquier excepción no capturada se envía a /debug/crash para que McBarri
  // pueda ver el stack real sin necesidad de reproducir el error a mano.
  useEffect(() => {
    const report = (data: Record<string, unknown>) => {
      try {
        const url = API_BASE.replace(/\/api\/v1$/, "") + "/api/v1/debug/crash";
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, url: window.location.href }),
        }).catch(() => {});
      } catch (e) {}
    };
    const onErr = (ev: ErrorEvent) => {
      report({ message: ev.message, source: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: ev.error && ev.error.stack });
    };
    const onRej = (ev: PromiseRejectionEvent) => {
      const reason: any = ev.reason;
      report({ message: "Unhandled promise rejection", error: String(reason), stack: reason && reason.stack });
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

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
    // Botón walkie flotante grande y cuadrado, fijo a la derecha
    pttBtn: {
      position: "fixed" as const,
      right: 24,
      bottom: 28,
      width: 132,
      height: 132,
      borderRadius: 28,
      border: "none",
      fontWeight: 800,
      fontSize: 15,
      lineHeight: 1.25,
      color: "#fff",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
      transition: "all .12s",
      zIndex: 1200,
      userSelect: "none" as const,
      WebkitUserSelect: "none" as const,
      touchAction: "none" as const,
      fontFamily: "system-ui, sans-serif",
    },
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
    startPresence(); // mantiene la sesión activa marcada en línea aunque cambie de página

    // Obtener nombre del usuario actual para el encabezado
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${t}` } });
        if (res.ok) {
          const data = await res.json();
          if (data?.full_name) setMyName(data.full_name);
        }
      } catch (e) {}
    })();

    (async () => {
      try {
        const L = await ensureLeaflet();
        const container = mapRef.current!;
        // Evitar «Map container is already initialized»: si ya había una instancia
        // Leaflet viva sobre este contenedor (p.ej. doble mount de React StrictMode
        // o navegación rápida), limpiarla de verdad antes de recrear el mapa.
        if (leafletRef.current) {
          try { leafletRef.current.remove(); } catch (e) {}
          leafletRef.current = null;
        }
        if ((container as any)._leaflet_id != null) {
          try { (container as any)._leaflet_id = null; } catch (e) {}
        }
        const map = L.map(container, {
          // Quitamos el atributo por defecto de Leaflet/OSM que es un enlace que
          // saca al usuario fuera del mapa; lo reemplazamos por nuestra etiqueta.
          attributionControl: false,
        }).setView([14.6349, -90.5069], 12); // Guatemala central
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {}).addTo(map);
        // Etiqueta fija que tapa el hueco del atributo: enlace hecho a propósito
        // para no salirse del mapa.
        L.control.attribution({ prefix: false }).addAttribution(
          '<span style="font-size:10px; font-weight:700; color:#111827;">McBarri Inc LLC US @2026</span>'
        ).addTo(map);
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

  // Centrar el mapa en el usuario seleccionado y magnificarlo
  const focusUser = useCallback(
    (u: LiveUser) => {
      if (!leafletRef.current || u.latitude == null || u.longitude == null) return;
      leafletRef.current.setView([u.latitude, u.longitude], 17); // zoom máximo
      // Abrir el popup del pin
      const m = markersRef.current[u.user_id];
      if (m) m.openPopup();
    },
    []
  );

  // Centrar el mapa en TODOS los usuarios del vecindario (maximizar para verlos a todos)
  const fitAllUsers = useCallback(() => {
    const map = leafletRef.current;
    if (!map) return;
    const pts: [number, number][] = liveUsers
      .filter((u) => u.latitude != null && u.longitude != null)
      .map((u) => [u.latitude as number, u.longitude as number]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 16);
    } else {
      map.fitBounds(pts, { padding: [60, 60], maxZoom: 16 });
    }
  }, [liveUsers]);

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
        const raw = await res.json();
        // Defensivo: el backend puede devolver {users:[...]} o un dict; forzamos array.
        const data: LiveUser[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw && raw.users)
          ? raw.users
          : [];
        setLiveUsers(data);
        if (leafletRef.current) {
          const L = window.L;
          const myId = JSON.parse(localStorage.getItem("user") || "{}").id;
          // Todos los usuarios del vecindario tienen pin (última posición conocida).
          // Los que ya no existen en la respuesta se limpian.
          const idsPresent = new Set(data.map((u: any) => u.user_id));
          Object.keys(markersRef.current).forEach((uid) => {
            if (!idsPresent.has(Number(uid))) {
              leafletRef.current?.removeLayer(markersRef.current[uid]);
              delete markersRef.current[uid];
            }
          });
          data.forEach((u) => {
            if (u.user_id === undefined) return;
            const isMe = u.user_id === myId;
            // Color: YO = celeste · en línea según rol (líder verde, centinela azul) ·
            // OFFLINE = gris (última posición conocida)
            let color = "#2563eb"; // centinela azul
            if (isMe) color = "#00c2a8";
            else if (!u.online) color = "#6b7280"; // desconectado → gris
            else if (u.role === "leader") color = "#16a34a"; // líder verde
            else if (u.role === "superadmin") color = "#f59e0b"; // amber
            if (isMe) setMyColor(color); // el nombre coincide con el color de su bolita
            const label = u.code ? u.code : (u.role === "leader" ? "L" : "C");
            const size = isMe ? 16 : 13;
            const icon = L.divIcon({
              className: "",
              html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${color}">`
                + `<span style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:${color};color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;white-space:nowrap">${label}</span></div>`,
            });
            // Si no tiene coordenadas aún, no lo pintamos en el mapa (solo tabla)
            if (u.latitude != null && u.longitude != null) {
              const m = L.marker([u.latitude, u.longitude], { icon });
              const estado = u.online ? "🟢 En línea" : "⚪ Desconectado";
              const poplabel = `${label} · ${u.full_name ?? "Usuario"}${u.role ? " (" + u.role + ")" : ""}<br/>${estado}<br/>Última conexión: ${u.updated_at ? new Date(u.updated_at).toLocaleString() : "nunca"}`;
              m.bindPopup(poplabel);
              m.addTo(leafletRef.current);
              if (markersRef.current[u.user_id]) leafletRef.current.removeLayer(markersRef.current[u.user_id]);
              markersRef.current[u.user_id] = m;
            } else if (markersRef.current[u.user_id]) {
              // Sin ubicación: quitar pin si existía
              leafletRef.current.removeLayer(markersRef.current[u.user_id]);
              delete markersRef.current[u.user_id];
            }
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

    // WebSocket para actualizaciones en vivo + walkie (audio) entrante.
    // El audio se maneja aqui mismo via audioHandlerRef para evitar perder el
    // listener cuando el WebSocket se recrea (token refresh / re-mount).
    const wsUrl = API_BASE.replace("https://", "wss://").replace("http://", "ws://").replace("/api/v1", "/api/v1/realtime/ws");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "audio") {
          audioHandlerRef.current(msg.chunk);
        } else if (msg.type === "transmit") {
          // Alguien empezó/soltó el push-to-talk: prende/apaga la bocinita.
          setTransmitting(msg.status === "start");
        } else if (msg.type === "update") {
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
      setWalkieState("talking");
      // Avisar a todos los que están en el mapa que alguien está transmitiendo,
      // para que la bocinita se ponga oscura mientras dura el push-to-talk.
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "transmit", status: "start" }));
      }
    } catch (err: any) {
      alert("Microfono no disponible: " + err.message);
    }
  };

  const stopTalk = () => {
    mediaRecRef.current?.stop();
    audioChunksRef.current = [];
    // parar streams
    mediaRecRef.current?.stream?.getTracks().forEach((t) => t.stop());
    // Avisar que se dejó de transmitir: la bocinita vuelve a gris en los demás.
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "transmit", status: "stop" }));
    }
  };

  // ── PUSH-TO-TALK (tap vs hold) ──
  // Con un único botón: tap corto = armar/apagar; mantener = transmitir.
  const pttPress = () => {
    pressStartRef.current = Date.now();
    unlockAudio(); // primer toque desbloquea el audio entrante (autoplay)
    // Si está armado y se mantiene el dedo, arranca a transmitir tras 250ms
    pressTimerRef.current = setTimeout(() => {
      if (walkieStateRef.current === "armed") {
        startTalk();
      }
    }, 250);
  };

  const pttRelease = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    const held = Date.now() - pressStartRef.current;
    if (held < 250) {
      // Tap corto: alternar armado
      if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") stopTalk();
      setWalkieState((s) => (s === "off" ? "armed" : "off"));
    } else {
      // Mantener: dejar de transmitir y volver a estado armado (rojo)
      stopTalk();
      setWalkieState("armed");
    }
  };

  // Ref espejo para handlers con cierre
  const walkieStateRef = useRef("off");
  useEffect(() => {
    walkieStateRef.current = walkieState;
  }, [walkieState]);


  // Desbloquear audio en el primer gesto del usuario (política de autoplay de
  // los navegadores móviles: sin interacción previa, audio.play() se bloquea y
  // el walkie entrante nunca se escucha aunque el WS llegue bien).
  const unlockAudio = useCallback(() => {
    try {
      const a = audioElRef.current;
      if (!a) return;
      a.muted = false;
      a.volume = 1;
      // Cargar un buffer mudo para «tocar» el elemento y desbloquear el contexto
      // de audio del navegador (requisito para reproducir el walkie entrante).
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {}
  }, []);

  // Recibir audio del walkie (del WebSocket broadcast).
  // Fix definitivo con MediaSource + SourceBuffer: encadena los chunks de
  // 300ms (que vienen como clusters webm fragmentados SIN cabecera) en un
  // único stream continuo descodificable en Android. Es la forma estándar
  // para reproducir audio/webm por trozos sin depender de metadatos por trozo.
  const setupMediaSource = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio) return null;
    try {
      // Limpiar cualquier MediaSource previo
      if (mediaSourceRef.current) {
        try { mediaSourceRef.current.removeSourceBuffer(sourceBufferRef.current!); } catch (e) {}
        try { mediaSourceRef.current = null; } catch (e) {}
      }
      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      sourceBufferRef.current = null;
      msReadyRef.current = false;
      audio.src = URL.createObjectURL(ms);
      audio.load();
      ms.addEventListener("sourceopen", () => {
        try {
          const sb = ms.addSourceBuffer('audio/webm;codecs="opus"');
          sb.mode = "sequence"; // encadena clusters sin cabecera
          sourceBufferRef.current = sb;
          msReadyRef.current = true;
        } catch (e) {
          // Fallback: algunos navegadores requieren mistificado de codecs
          console.warn("MediaSource con audio/webmopus falla, probando por defecto");
        }
      });
      return ms;
    } catch (e) {
      return null;
    }
  }, []);

  const playAudioChunk = useCallback((b64: string) => {
    const audio = audioElRef.current;
    if (!audio) return;
    // Asegurar el stream continuo en el primer chunk
    if (!mediaSourceRef.current) {
      setupMediaSource();
    }
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const sb = sourceBufferRef.current;
      if (!sb || !msReadyRef.current) {
        // Aún no listo: reintentamos en un tick (sourceopen es asincrono)
        setTimeout(() => {
          const s = sourceBufferRef.current;
          if (s && msReadyRef.current) {
            try { s.appendBuffer(bytes.buffer); } catch (e) {}
          }
        }, 150);
        return;
      }
      try {
        if (sb.updating) {
          // Si ya está encolando, esperamos a que termine para no romper el buffer
          const tryAppend = () => {
            if (sb.updating) { setTimeout(tryAppend, 50); return; }
            try { sb.appendBuffer(bytes.buffer); } catch (e) {}
          };
          setTimeout(tryAppend, 50);
        } else {
          sb.appendBuffer(bytes.buffer);
        }
      } catch (e) {}
    } catch (e) {}
  }, [setupMediaSource]);

  // Mantener el handler de audio del walkie sincronizado en un ref para que el
  // efecto que crea el WebSocket pueda usarlo sin problemas de orden/ciclo.
  useEffect(() => {
    audioHandlerRef.current = playAudioChunk;
  }, [playAudioChunk]);

  // Botón walkie flotante
  const pttLabel =
    walkieState === "off" ? "🔇 WALKIE OFF" : walkieState === "armed" ? "🎙️ PULSA Y HABLA" : "🔴 HABLANDO…";
  const pttBg =
    walkieState === "off" ? "#475569" : walkieState === "armed" ? "#ef4444" : "#16a34a";
  const pttHint =
    walkieState === "off"
      ? "Toca para activar"
      : walkieState === "armed"
      ? "Mantén para hablar · toca para salir"
      : "Suelta para terminar";

  return (
    <div style={styles.page}>
      <audio ref={audioElRef} playsInline muted={false} preload="auto" />
      <div style={styles.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={styles.btnGhost} onClick={() => router.push("/dashboard")}>← Panel</button>
          {/* Logo: mapita con solo forro/outline en blanco */}
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
            <path d="M9 4v14" />
            <path d="M15 6v14" />
          </svg>
          <div style={{ lineHeight: 1.15 }}>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>Vecino Centinela</h1>
            <span>
              <span style={{ color: myColor, fontSize: 19, fontWeight: 800, letterSpacing: 0.3 }}>{myName || "Usuario"}</span>
              <span style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 500 }}> — mapa en vivo</span>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        </div>
      </div>

      {error && <div style={{ background: "#fecaca", color: "#991b1b", padding: 10, borderRadius: 8, marginBottom: 12 }}>⚠️ {error}</div>}

      <div style={styles.mapWrap}>
        <div style={{
          position: "absolute" as const, bottom: 22, left: 10, zIndex: 1000,
          pointerEvents: "none" as const,
        }}>
          <span style={{ color: "#1d4ed8", fontWeight: 800, fontSize: 13, letterSpacing: 0.5,
            background: "rgba(255,255,255,0.85)", padding: "3px 12px", borderRadius: 10,
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>McBarri Inc LLC @ USA 2026</span>
        </div>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        {!mapInit && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#e2e8f0", color: "#475569" }}>Cargando mapa…</div>}
      </div>

      <div style={styles.panel}>
        <h3 onClick={fitAllUsers} title="Ver todos los usuarios en el mapa" style={{ ...styles.panelTitle, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>👥 Usuarios del vecindario ({liveUsers.length}) <span style={{ fontSize: 11, fontWeight: 600, color: "#2563eb" }}>Maximizar 🔍</span></h3>
        {liveUsers.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No hay usuarios con ubicación registrada en tu vecindario.</p>
        ) : (
          liveUsers.map((u) => {
            const online = !!u.online;
            const conectable = u.latitude != null && u.longitude != null;
            return (
              <div
                key={u.user_id}
                onClick={() => conectable && focusUser(u)}
                style={{
                  ...styles.userRow,
                  cursor: conectable ? "pointer" : "default",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: online ? "#16a34a" : "#9ca3af",
                      boxShadow: online ? "0 0 0 3px rgba(22,163,74,0.2)" : "none",
                    }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.full_name || "Usuario"}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{ ...styles.badge, background: online ? "#dcfce7" : "#f1f5f9", color: online ? "#166534" : "#64748b" }}>
                    {u.code ? u.code + " · " : ""}{u.role || "usuario"}
                  </span>
                  <span style={{ fontSize: 12, color: online ? "#166534" : "#94a3b8" }}>{online ? "🟢 En línea" : "⚪ Desconectado"}</span>
                  {conectable && <span style={{ fontSize: 11, color: "#0ea5e9" }}>📍</span>}
                </span>
              </div>
            );
          })
        )}
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 0 }}>
          Los desconectados muestran su última posición en gris. Toca una fila para centrar el mapa en ese pin.
        </p>
      </div>

      {/* Walkie flotante (derecha): la bocinita de arriba indica si alguien está
          transmitiendo AHORA (gris oscuro/negro = hay voz en el aire, gris claro = canal en silencio). */}
      <div style={{ position: "fixed" as const, right: 24, bottom: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 1500 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" as const, background: "rgba(15,23,42,0.85)", padding: "6px 12px", borderRadius: 12, boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={transmitting ? "#111827" : "#e2e8f0"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: transmitting ? "drop-shadow(0 0 6px rgba(17,24,39,0.9))" : "none", transition: "stroke 0.2s" }}>
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: transmitting ? "#111827" : "#e2e8f0", textTransform: "uppercase" }}>
            {transmitting ? "Transmitiendo…" : "En espera"}
          </span>
        </div>
        <button
          style={{ ...styles.pttBtn, background: pttBg }}
          onPointerDown={pttPress}
          onPointerUp={pttRelease}
          onPointerLeave={() => { if (walkieStateRef.current === "talking") { pressTimerRef.current && clearTimeout(pressTimerRef.current); stopTalk(); setWalkieState("armed"); } }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.9 }}>{pttLabel.split(" ")[0]}</span>
          <span style={{ fontSize: 19, marginTop: 4 }}>{pttLabel.split(" ").slice(1).join(" ")}</span>
          <span style={{ fontSize: 10, marginTop: 8, opacity: 0.75 }}>{pttHint}</span>
        </button>
      </div>

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
