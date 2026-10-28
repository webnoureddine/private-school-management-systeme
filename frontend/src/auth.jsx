import { createContext, useContext, useEffect, useState } from "react";
import api from "./api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [school, setSchool] = useState({ name: "", currency: "دج" });
  const [loading, setLoading] = useState(!!localStorage.getItem("access"));
  const loadSchool = () => api.get("/settings/public/").then((r) => setSchool(r.data)).catch(() => {});
  const reload = () => api.get("/users/me/").then((r) => setUser(r.data));
  useEffect(() => {
    loadSchool();
    if (!localStorage.getItem("access")) return;
    reload().catch(() => localStorage.removeItem("access")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (school.name) document.title = school.name; }, [school.name]);
  const login = async (username, password) => {
    const { data } = await api.post("/auth/login/", { username: username.trim(), password });
    localStorage.setItem("access", data.access); localStorage.setItem("refresh", data.refresh);
    await reload();
  };
  const logout = () => { localStorage.removeItem("access"); localStorage.removeItem("refresh"); setUser(null); };
  const role = user ? (user.is_superuser ? "admin" : user.role) : null;
  const can = {
    manage: role === "admin" || role === "staff",       // director + secretariat
    director: role === "admin",
    teach: role === "teacher",
    staff: ["admin", "staff", "teacher"].includes(role),  // can take attendance / send messages
    family: role === "student" || role === "parent",
  };
  return <Ctx.Provider value={{ user, role, can, loading, login, logout, reload, setUser, school, loadSchool }}>{children}</Ctx.Provider>;
}
