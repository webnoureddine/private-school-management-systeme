import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone, Search, Send, Users } from "lucide-react";
import api from "../api";
import { useT } from "../i18n.jsx";
import Composer from "../components/Composer.jsx";
import { Empty, PageHead, Spinner } from "../components/ui.jsx";

/** Teacher: every student he teaches, grouped by class. Select some (or a whole class) and message them. */
export default function MyStudents() {
  const { t, tr } = useT();
  const [rows, setRows] = useState(null); const [groups, setGroups] = useState([]);
  const [fg, setFg] = useState(""); const [q, setQ] = useState(""); const [sel, setSel] = useState([]);
  const [compose, setCompose] = useState(null);
  useEffect(() => { api.get("/me/students/").then((r) => setRows(r.data)); api.get("/groups/").then((r) => setGroups(r.data)); }, []);
  const shown = useMemo(() => (rows || []).filter((r) => (!fg || r.group_ids.includes(Number(fg))) && r.name.toLowerCase().includes(q.toLowerCase())), [rows, fg, q]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allOn = shown.length > 0 && shown.every((r) => sel.includes(r.id));
  return (<div>
    <PageHead title={t("My students")} sub={t("Students of your classes who are subscribed to your modules.")}>
      {fg && <button className="btn ghost" onClick={() => setCompose({ group: fg })}><Megaphone size={17} />{t("Message the whole class")}</button>}
      <button className="btn" disabled={!sel.length} onClick={() => setCompose({ users: sel })}><Send size={17} />{t("Message selected")} {sel.length > 0 && `(${sel.length})`}</button>
    </PageHead>
    <div className="toolbar">
      <select value={fg} onChange={(e) => setFg(e.target.value)} aria-label={t("Class")}><option value="">{t("All my classes")}</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <span className="search-in"><Search size={16} /><input placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} /></span>
    </div>
    <div className="panel">{!rows ? <Spinner /> : shown.length ? <div className="table-wrap"><table>
      <thead><tr><th className="th-check"><input type="checkbox" aria-label={t("Select all")} checked={allOn} onChange={() => setSel(allOn ? sel.filter((x) => !shown.some((r) => r.id === x)) : [...new Set([...sel, ...shown.map((r) => r.id)])])} /></th>
        <th>{t("Student")}</th><th>{t("Class")}</th><th>{t("Modules")}</th><th>{t("Contact")}</th><th /></tr></thead>
      <tbody>{shown.map((r) => (
        <tr key={r.id} className={sel.includes(r.id) ? "selected" : ""}>
          <td><input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={r.name} /></td>
          <td><b>{r.name}</b></td><td>{r.groups.join("، ")}</td>
          <td><div className="chips">{r.modules.map((m, i) => <span className="pill" key={i}>{tr(m, "name")}</span>)}</div></td>
          <td className="small"><span dir="ltr">{r.phone || "—"}</span>{r.telegram_linked && <span className="pill ok sm">Telegram</span>}</td>
          <td><Link className="link" to={`/students/${r.id}`}>{t("File")}</Link></td>
        </tr>))}</tbody></table></div>
      : <Empty icon={Users} title={t("No students yet.")}>{t("The administration assigns you to classes and subscribes students to your modules.")}</Empty>}</div>
    {compose && <Composer preset={compose} onClose={() => setCompose(null)} onSent={() => setSel([])} />}
  </div>);
}
