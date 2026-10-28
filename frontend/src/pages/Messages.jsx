import { useEffect, useState } from "react";
import { Ban, Megaphone, Plus, Trash2 } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import Composer from "../components/Composer.jsx";
import Form from "../components/Form.jsx";
import { Empty, PageHead, Spinner, useFmt, useToast } from "../components/ui.jsx";

export default function Messages() {
  const { can } = useAuth(); const { t } = useT(); const f = useFmt(); const { toast, confirm } = useToast();
  const [tab, setTab] = useState("sent");
  const [rows, setRows] = useState(null); const [closures, setClosures] = useState(null);
  const [compose, setCompose] = useState(false); const [closing, setClosing] = useState(false);
  const load = () => {
    api.get("/announcements/").then((r) => setRows(r.data)).catch((e) => toast(errText(e, t), "error"));
    if (can.manage) api.get("/closures/").then((r) => setClosures(r.data));
  };
  useEffect(load, []);
  const audience = (a) => {
    if (a.session_label) return `${t("Class session")}: ${a.session_label}`;
    const parts = [];
    if (a.group_name) parts.push(`${t("Class")} ${a.group_name}`);
    if (a.users_names.length) parts.push(a.users_names.slice(0, 3).join("، ") + (a.users_names.length > 3 ? ` +${a.users_names.length - 3}` : ""));
    if (!parts.length) parts.push(t("Whole school"));
    if (a.audience_role) parts.push(t(a.audience_role + "s"));
    if (a.include_parents && a.audience_role !== "parent") parts.push(t("with parents"));
    return parts.join(" — ");
  };
  const closeSchool = async (b) => {
    const ok = await confirm({ title: t("Close the school on this day?"), body: t("All classes of that day are cancelled and everyone concerned is notified."), danger: true, ok: t("Close and notify") });
    if (!ok) return;
    await api.post("/closures/", b); setClosing(false); toast(t("Closure saved. Everyone concerned was notified.")); load();
  };
  const delMsg = async (a) => {
    if (!(await confirm({ title: t("Delete from history?"), body: t("The message was already delivered; it is only removed from this list."), danger: true, ok: t("Delete") }))) return;
    await api.delete(`/announcements/${a.id}/`); load();
  };
  return (<div>
    <PageHead title={t("Messages")} sub={t(can.manage ? "Send news, reminders and alerts to students, parents and teachers." : "Send a message or a reminder to your students and their parents.")}>
      {can.manage && <button className="btn ghost danger-t" onClick={() => setClosing(true)}><Ban size={17} />{t("Close the school")}</button>}
      <button className="btn" onClick={() => setCompose(true)}><Plus size={17} />{t("New message")}</button>
    </PageHead>
    {can.manage && <div className="seg mb">
      <button className={tab === "sent" ? "on" : ""} onClick={() => setTab("sent")}>{t("Sent messages")}</button>
      <button className={tab === "closures" ? "on" : ""} onClick={() => setTab("closures")}>{t("Closures")}</button>
    </div>}
    {tab === "sent" && (!rows ? <Spinner /> : rows.length ? (
      <div className="msg-list">{rows.map((a) => (
        <article className="panel msg" key={a.id}>
          <div className="msg-head"><h3>{a.title}</h3><span className="muted small">{f.when(a.created_at)}</span></div>
          <p className="msg-body">{a.body}</p>
          <div className="msg-foot">
            <span className="meta">{audience(a)}{can.manage && a.created_by_name && ` — ${t("by")} ${a.created_by_name}`}</span>
            <span className="chips">
              <span className="pill">{t("Recipients")}: {a.recipients}</span>
              <span className="pill ok">{t("Read")}: {a.delivered.read}</span>
              {["email", "whatsapp", "telegram"].map((c) => a.delivered[c] > 0 && <span key={c} className="pill">{{ email: t("Email"), whatsapp: "WhatsApp", telegram: "Telegram" }[c]} {a.delivered[c]}</span>)}
              {a.delivered.pending > 0 && <span className="pill warn">{a.delivered.pending} {t("sending")}</span>}
              {a.delivered.failed > 0 && <span className="pill bad">{a.delivered.failed} {t("failed")}</span>}
              {can.manage && <button className="icon-btn sm danger" onClick={() => delMsg(a)} aria-label={t("Delete")}><Trash2 size={15} /></button>}
            </span>
          </div>
        </article>))}</div>
    ) : <div className="panel"><Empty icon={Megaphone} title={t("No messages sent yet.")}>
      <button className="btn" onClick={() => setCompose(true)}><Plus size={16} />{t("New message")}</button></Empty></div>)}
    {tab === "closures" && (
      <div className="panel">{!closures ? <Spinner /> : closures.length ? <div className="table-wrap"><table>
        <thead><tr><th>{t("Date")}</th><th>{t("Reason")}</th><th>{t("Concerns")}</th><th>{t("Notified")}</th></tr></thead>
        <tbody>{closures.map((c) => <tr key={c.id}><td className="num">{f.date(c.date)}</td><td>{c.reason}</td><td>{c.group_name || t("Whole school")}</td>
          <td><span className={`pill ${c.notified ? "ok" : ""}`}>{c.notified ? t("Yes") : t("No")}</span></td></tr>)}</tbody></table></div>
        : <Empty icon={Ban} title={t("No closures.")} />}</div>)}
    {compose && <Composer onClose={() => setCompose(false)} onSent={load} />}
    {closing && <Form title="Close the school" submitLabel="Close and notify" onClose={() => setClosing(false)} onSubmit={closeSchool} fields={[
      { name: "date", label: "Date", type: "date", required: true },
      { name: "group", label: "Only one class (empty = whole school)", type: "select", source: { endpoint: "/groups/", label: (x) => x.name } },
      { name: "reason", label: "Reason", required: true, full: true, placeholder: "Snow, power cut, public holiday…" }]} />}
  </div>);
}
