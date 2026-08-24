// Presencia en vivo: mientras el usuario tenga sesión activa (pestaña abierta),
// se registra un heartbeat que marca "en línea" y publica su ubicación GPS.
// Así aparece posicionado en el mapa desde que entra a la aplicación, y es
// detectado como conectado en la tabla de usuarios (fila en verde).

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const KEYS = {
  access: "access_token",
};

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let localPos: { latitude: number; longitude: number } | null = null;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEYS.access);
}

async function beat() {
  const token = getToken();
  if (!token) return;
  try {
    const body = localPos ? { latitude: localPos.latitude, longitude: localPos.longitude } : null;
    const res = await fetch(`${API_BASE}/realtime/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : "{}",
    });
    if (res.status === 401) stop();
  } catch {
    /* silencioso: reintenta en el siguiente latido */
  }
}

function watchLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  try {
    navigator.geolocation.watchPosition(
      (pos) => {
        localPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      },
      () => {
        /* sin permiso de ubicación: aún así cuenta como en línea vía heartbeat */
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
  timer = setInterval(beat, 30000);
}

export function stop() {
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
