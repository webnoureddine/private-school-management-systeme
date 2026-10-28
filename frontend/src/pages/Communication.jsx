import { useEffect, useState } from "react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";

export default function Communication() {
  const { user } = useAuth(); const { t } = useT();
  const isAdmin = user.role === "admin" || user.is_superuser;
  const [groups, setGroups] = useState([]); const [msg, setMsg] = useState("");
  const [c, setC] = useState({ date: "", reason: "", group: "" });
  const [a, setA] = useState({ title: "", body: "", audience_role: "", audience_group: "" });
  useEffect(() => { api.get("/groups/").then((r) => setGroups(r.data)); }, []);
  const closure = async (e) => {
    e.preventDefault();
    if (!confirm(t("This cancels ALL classes that day and notifies everyone concerned. Continue?"))) return;
    try { await api.post("/closures/", { ...c, group: c.group || null }); setMsg(t("✅ Closure created — students and teachers notified.")); setC({ date: "", reason: "", group: "" }); } catch (x) { setMsg(errText(x)); }
  };
  const announce = async (e) => {
    e.preventDefault();
    try { await api.post("/announcements/", { ...a, audience_group: a.audience_group || null }); setMsg(t("✅ Announcement sent.")); setA({ title: "", body: "", audience_role: "", audience_group: "" }); } catch (x) { setMsg(errText(x)); }
  };
  if (!isAdmin) return <div><h1>{t("Communication")}</h1><p className="muted">{t("To cancel a class, open the Timetable and press Cancel on the session. Everyone concerned is notified automatically.")}</p></div>;
  const opt = (g) => <option key={g.id} value={g.id}>{g.name} ({g.level_name})</option>;
  return (<div><h1>{t("Communication")}</h1>{msg && <p className="notice">{msg}</p>}
    <div className="grid2">
      <form className="card form" onSubmit={closure}><h3>{t("🚫 Close school / a class group")}</h3>
        <label>{t("Date")}<input type="date" required value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} /></label>
        <label>{t("Reason")}<input required value={c.reason} onChange={(e) => setC({ ...c, reason: e.target.value })} placeholder={t("Heavy snow, electricity cut, national holiday…")} /></label>
        <label>{t("Class (empty = whole school)")}<select value={c.group} onChange={(e) => setC({ ...c, group: e.target.value })}><option value="">{t("Whole school")}</option>{groups.map(opt)}</select></label>
        <button className="danger">{t("Close & notify everyone")}</button></form>
      <form className="card form" onSubmit={announce}><h3>{t("📣 Announcement")}</h3>
        <label>{t("Title")}<input required value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} /></label>
        <label>{t("Message")}<textarea required value={a.body} onChange={(e) => setA({ ...a, body: e.target.value })} /></label>
        <label>{t("Audience")}<select value={a.audience_role} onChange={(e) => setA({ ...a, audience_role: e.target.value })}>
          <option value="">{t("Everyone")}</option><option value="student">{t("Students")}</option><option value="teacher">{t("Teachers")}</option><option value="parent">{t("Parents")}</option><option value="staff">{t("Staff")}</option></select></label>
        <label>{t("Class")}<select value={a.audience_group} onChange={(e) => setA({ ...a, audience_group: e.target.value })}><option value="">{t("All")}</option>{groups.map(opt)}</select></label>
        <button>{t("Send")}</button></form>
    </div></div>);
}
