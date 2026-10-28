import { useEffect, useMemo, useState } from "react";
import { Plus, School, Search, Trash2 } from "lucide-react";
import api, { errText } from "../api";
import { useT } from "../i18n.jsx";
import Form from "../components/Form.jsx";
import { Empty, PageHead, Spinner, Switch, isoDay, useFmt, useToast } from "../components/ui.jsx";

/** Who is subscribed to which module. Filter, subscribe one student, or a whole class at once. */
export default function Subscriptions() {
  const { t, tr } = useT(); const f = useFmt(); const { toast, confirm } = useToast();
  const [rows, setRows] = useState(null); const [groups, setGroups] = useState([]); const [mods, setMods] = useState([]);
  const [fg, setFg] = useState(""); const [fm, setFm] = useState(""); const [q, setQ] = useState(""); const [form, setForm] = useState(null);
  const load = () => api.get("/subscriptions/", { params: { group: fg || undefined, module: fm || undefined } }).then((r) => setRows(r.data)).catch((e) => toast(errText(e, t), "error"));
  useEffect(() => { api.get("/groups/").then((r) => setGroups(r.data)); api.get("/modules/", { params: { used: 1 } }).then((r) => setMods(r.data)); }, []);
  useEffect(() => { load(); }, [fg, fm]);
  const shown = useMemo(() => (rows || []).filter((r) => `${r.student_name} ${r.module_name} ${r.module_name_ar}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const toggle = async (r) => { try { await api.patch(`/subscriptions/${r.id}/`, { active: !r.active }); load(); } catch (e) { toast(errText(e, t), "error"); } };
  const del = async (r) => { if (!(await confirm({ title: t("Delete?"), body: `${r.student_name} — ${tr(r, "module_name")}`, danger: true, ok: t("Delete") }))) return; try { await api.delete(`/subscriptions/${r.id}/`); load(); } catch (e) { toast(errText(e, t), "error"); } };
  const addOne = async (b) => { await api.post("/subscriptions/", b); setForm(null); toast(t("Saved")); load(); };
  const addClass = async (b) => { const r = await api.post("/subscriptions/bulk/", b); setForm(null); toast(`${t("New subscriptions")}: ${r.data.created}`); load(); };
  const modLabel = (x) => `${tr(x, "name")} — ${tr({ n: x.level_name, n_ar: x.level_name_ar }, "n")}`;
  const F_ONE = [
    { name: "student", label: "Student", type: "select", required: true, source: { endpoint: "/students/", label: (x) => x.name } },
    { name: "module", label: "Module", type: "select", required: true, source: { endpoint: "/modules/?used=1", label: modLabel } },
    { name: "monthly_fee", label: "Monthly fee", type: "number" }, { name: "start_date", label: "Since", type: "date" }];
  const F_CLASS = [
    { name: "group", label: "Class", type: "select", required: true, source: { endpoint: "/groups/", label: (x, tr2) => `${x.name} — ${tr2({ n: x.level_name, n_ar: x.level_name_ar }, "n")}` } },
    { name: "monthly_fee", label: "Monthly fee per module", type: "number" },
    { name: "modules", label: "Modules", type: "multi", source: { endpoint: "/modules/?used=1", label: modLabel } }];
  return (<div>
    <PageHead title={t("Subscriptions")} sub={t("Each student attends and pays only for the modules he is subscribed to.")}>
      <button className="btn ghost" onClick={() => setForm("class")}><School size={17} />{t("Subscribe a whole class")}</button>
      <button className="btn" onClick={() => setForm("one")}><Plus size={17} />{t("Subscribe a student")}</button>
    </PageHead>
    <div className="toolbar">
      <select value={fg} onChange={(e) => setFg(e.target.value)} aria-label={t("Class")}><option value="">{t("All classes")}</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <select value={fm} onChange={(e) => setFm(e.target.value)} aria-label={t("Module")}><option value="">{t("All modules")}</option>{mods.map((m) => <option key={m.id} value={m.id}>{modLabel(m)}</option>)}</select>
      <span className="search-in"><Search size={16} /><input placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} /></span>
      {rows && <span className="muted small">{shown.length} {t("subscriptions")}</span>}
    </div>
    <div className="panel">{!rows ? <Spinner /> : shown.length ? <div className="table-wrap"><table>
      <thead><tr><th>{t("Student")}</th><th>{t("Class")}</th><th>{t("Module")}</th><th>{t("Since")}</th><th>{t("Monthly fee")}</th><th>{t("Active")}</th><th /></tr></thead>
      <tbody>{shown.map((r) => (<tr key={r.id}><td><b>{r.student_name}</b></td><td>{r.groups_info.join("، ")}</td><td>{tr(r, "module_name")}</td>
        <td className="num">{f.date(r.start_date)}</td><td className="num">{f.money(r.monthly_fee)}</td>
        <td><Switch checked={r.active} onChange={() => toggle(r)} /></td>
        <td className="actions"><button className="icon-btn danger" onClick={() => del(r)} aria-label={t("Delete")}><Trash2 size={16} /></button></td></tr>))}</tbody></table></div>
      : <Empty title={t("Nothing here yet.")} />}</div>
    {form === "one" && <Form title="Subscribe a student" fields={F_ONE} initial={{ start_date: isoDay(), monthly_fee: 0 }} onSubmit={addOne} onClose={() => setForm(null)} />}
    {form === "class" && <Form title="Subscribe a whole class" fields={F_CLASS} initial={{ monthly_fee: 0, modules: [] }} onSubmit={addClass} onClose={() => setForm(null)} />}
  </div>);
}
