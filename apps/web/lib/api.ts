export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export async function apiRequest(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("vc_access_token") : null;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...options, headers, cache: "no-store" });
}

export async function apiGet(path: string) {
  const response = await apiRequest(path);
  if (!response.ok) return null;
  return response.json();
}
