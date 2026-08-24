// Presencia en vivo + pipeline de telemetría redundante.
// Mientras el usuario tenga sesión activa (pestaña abierta), se registra un
// heartbeat que marca "en línea" y publica su ubicación GPS.
//
// PIPELINE REDUNDANTE (Opción A):
// 1. Si la ubicación GPS falla o se desactiva, se reporta vía banderas y el
//    servidor puede resolver por IP (fallback) marcando baja precisión.
// 2. Si NO hay red, cada latido se encola LOCALMENTE (localStorage). Al
//    recuperar conexión (evento 'online'), se reenvía toda la cola como log.
// 3. Se registran eventos de presencia (gps_off, gps_denied, network_off,
//    reconnect, device_off) en el canal de telemetría del servidor.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const KEYS = {
  access: "access_token",
};
const QUEUE_KEY = "presence_offline_queue"; // cola de latidos sin enviar

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let localPos: { latitude: number; longitude: number } | null = null;
let gpsDenied = false; // el permiso fue denegado
let gpsTimeout = false; // GPS no da señal a tiempo
let gpsOff = false; // navegador pide permiso pero no hay respuesta (desactivado)

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEYS.access);
}

// IP pública del cliente (solo lectura, para fallback en servidor).
let publicIP: string | null = null;
async function fetchPublicIP() {
  if (publicIP || typeof window === "undefined") return;
  try {
    const r = await fetch("https://api.ipify.org?format=json", { mode: "cors" });
    const j = await r.json();
    publicIP = j.ip ?? null;
  } catch {
    publicIP = null;
  }
}

// ─────────────────────────────────────────────
// Cola offline (localStorage)
// ─────────────────────────────────────────────
function loadQueue(): any[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveQueue(q: any[]) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200))); // límite sanidad
    } catch {
      /* almacenamiento lleno: descartar los más viejos */
    }
  }
}

// Reenvía toda la cola acumulada al servidor como evento de reconexión.
async function flushQueue() {
  const queue = loadQueue();
  if (queue.length === 0) return;
  try {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE}/realtime/presence-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        kind: "reconnect",
        message: `Reconexión: reenviando ${queue.length} latidos acumulados offline`,
        source: "gps",
        confidence: "low",
        queued_count: queue.length,
        ip_publica: publicIP,
        queued: queue,
      }),
    });
    if (res.ok) {
      window.localStorage.removeItem(QUEUE_KEY);
    }
  } catch {
    /* sin red aún: se reintenta en el próximo latido */
  }
}

// Reporta un evento de presencia al servidor (canal de telemetría).
async function reportEvent(kind: string, message: string, opts: any = {}) {
  const token = getToken();
  if (!token) return;
  try {
    await fetch(`${API_BASE}/realtime/presence-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        kind,
        message,
        latitude: opts.latitude ?? localPos?.latitude ?? null,
        longitude: opts.longitude ?? localPos?.longitude ?? null,
        source: opts.source ?? "gps",
        confidence: opts.confidence ?? "low",
        ip_publica: publicIP,
      }),
    });
  } catch {
    /* sin red: lo encolamos junto a los latidos */
    const q = loadQueue();
    q.push({ kind, message, t: Date.now() });
    saveQueue(q);
  }
}

async function beat() {
  const token = getToken();
  if (!token) return;
  const body: any = {};
  if (localPos) {
    body.latitude = localPos.latitude;
    body.longitude = localPos.longitude;
    body.source = "gps";
    body.confidence = "high";
  }
  body.gps_off = gpsOff;
  body.gps_denied = gpsDenied;
  body.ip_publica = publicIP;

  const queue = loadQueue();
  body.queued_count = queue.length; // si >0, el servidor registra reconnect

  try {
    const res = await fetch(`${API_BASE}/realtime/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      stop();
      return;
    }
    if (res.ok) {
      // Si había cola y el servidor confirmó, vaciarla si ya flusheamos.
      if (body.queued_count > 0) {
        await flushQueue();
      }
    }
  } catch {
    // Sin conexión: encolar este latido para reenvío diferido.
    const q = loadQueue();
    q.push({ latitude: localPos?.latitude ?? null, longitude: localPos?.longitude ?? null, t: Date.now() });
    saveQueue(q);
  }
}

function watchLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    gpsOff = true;
    return;
  }
  try {
    navigator.geolocation.watchPosition(
      (pos) => {
        localPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        gpsDenied = false;
        gpsTimeout = false;
        gpsOff = false;
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          if (!gpsDenied) {
            gpsDenied = true;
            reportEvent("gps_denied", "Permiso de ubicación denegado por el usuario");
          }
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          gpsOff = true;
          reportEvent("gps_off", "GPS desactivado o sin señal: continúa presencia vía heartbeat");
        } else {
          // TIMEOUT: GPS no da posición a tiempo
          gpsTimeout = true;
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  } catch {
    /* ignorar */
  }
}

export function start() {
  if (started) return;
  if (typeof window === "undefined") return;
  started = true;
  beat(); // latido inicial inmediato
  watchLocation();
  fetchPublicIP();

  // Reintento de la cola acumulada apenas se recupera la conexión.
  window.addEventListener("online", () => {
    flushQueue();
    if (!timer) timer = setInterval(beat, 30000);
  });
  window.addEventListener("offline", () => {
    reportEvent("network_off", "Se perdió la conexión de red: activando cola local de latidos");
  });
  // El navegador se va a segundo plano (pestaña oculta): registrar apagado de dispositivo.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      reportEvent("device_off", "Aplicación en segundo plano: la presencia puede interrumpirse");
    }
  });

  timer = setInterval(beat, 30000);
}

export function stop() {
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
