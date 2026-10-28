import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

api.interceptors.request.use((c) => {
  const t = localStorage.getItem("access");
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

let refreshing = null;
api.interceptors.response.use((r) => r, async (e) => {
  const cfg = e.config || {};
  if (e.response?.status === 401 && !cfg._retry && !cfg.url?.includes("auth/")) {
    const refresh = localStorage.getItem("refresh");
    if (refresh) {
      cfg._retry = true;
      try {
        refreshing ||= axios.post(`${api.defaults.baseURL}/auth/refresh/`, { refresh }).finally(() => { refreshing = null; });
        const { data } = await refreshing;
        localStorage.setItem("access", data.access);
        if (data.refresh) localStorage.setItem("refresh", data.refresh);
        return api(cfg);
      } catch { /* fall through to logout */ }
    }
    localStorage.removeItem("access"); localStorage.removeItem("refresh");
    if (location.pathname !== "/login") location.href = "/login";
  }
  return Promise.reject(e);
});

/** Readable error message from a DRF error response. */
export const errText = (e, t = (s) => s) => {
  const d = e?.response?.data;
  if (!e?.response) return t("Connection problem. Check your internet and try again.");
  if (e.response.status === 403) return t("You are not allowed to do this.");
  if (e.response.status >= 500) return t("Server error. Please try again.");
  if (!d) return e.message;
  if (typeof d === "string") return d.slice(0, 200);
  const flat = (v) => (Array.isArray(v) ? v.map(flat).join(" ") : typeof v === "object" ? Object.values(v).map(flat).join(" ") : String(v));
  return Object.entries(d).map(([k, v]) => (["detail", "non_field_errors"].includes(k) ? t(flat(v)) : `${t(k)}: ${t(flat(v))}`)).join(" — ");
};

export default api;
