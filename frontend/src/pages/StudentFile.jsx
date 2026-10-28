import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Phone } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import { Empty, Spinner, Stat, Switch, useFmt, useToast } from "../components/ui.jsx";

/** Level + class + every module with its teacher. Admin: switch = subscribe / unsubscribe the student. */
export function ProfileCard({ p, onToggle, onFee }) {
  const { t, tr } = useT(); const { school } = useAuth(); const f = useFmt();
  return (<div>
    {!p.groups.length && <div className="panel"><Empty title={t("Not assigned to any class yet.")} /></div>}
    {p.groups.map((g) => (
      <section className="panel" key={g.id}>
        <div className="panel-head"><h2>{tr(g.level, "name")} — {g.name}</h2><span className="pill">{t(g.level.cycle)}</span></div>
        {onToggle && <p className="muted small pad-x">{t("Use the switch to subscribe the student to a module.")}</p>}
        <ul className="modlist">{g.modules.map((m) => (
          <li key={m.id} className={m.subscribed ? "on" : ""}>
            {onToggle ? <Switch checked={m.subscribed} onChange={() => onToggle(p, m)} /> : <span className={`pill ${m.subscribed ? "ok" : ""}`}>{m.subscribed ? t("Subscribed") : "—"}</span>}
            <div className="info"><b>{tr(m, "name")}</b><small>{m.teacher ? m.teacher.name : t("No teacher yet")} — {t("Coefficient")} {m.coefficient}</small></div>
            {m.subscribed && (onFee
              ? <span className="fee"><input type="number" min="0" className="num" defaultValue={Number(m.monthly_fee)} aria-label={t("Monthly fee")} onBlur={(e) => Number(e.target.value) !== Number(m.monthly_fee) && onFee(m, e.target.value)} />{school.currency}</span>
              : Number(m.monthly_fee) > 0 && <span className="pill num">{f.money(m.monthly_fee)} {school.currency}</span>)}
          </li>))}</ul>
      </section>))}
  </div>);
}

export default function StudentFile() {
  const { id } = useParams(); const { t, tr } = useT(); const { can, school } = useAuth(); const f = useFmt(); const { toast } = useToast();
  const [p, setP] = useState(null);
  const load = () => api.get(`/students/${id}/profile/`).then((r) => setP(r.data)).catch((e) => toast(errText(e, t), "error"));
  useEffect(() => { load(); }, [id]);
  const toggle = async (st, m) => {
    try {
      if (m.subscribed) await api.delete(`/subscriptions/${m.subscription_id}/`);
      else if (m.subscription_id) await api.patch(`/subscriptions/${m.subscription_id}/`, { active: true });
      else await api.post("/subscriptions/", { student: st.id, module: m.id });
      load();
    } catch (e) { toast(errText(e, t), "error"); }
  };
  const fee = async (m, v) => { try { await api.patch(`/subscriptions/${m.subscription_id}/`, { monthly_fee: v || 0 }); toast(t("Saved")); load(); } catch (e) { toast(errText(e, t), "error"); } };
  if (!p) return <Spinner />;
  const a = p.attendance;
  return (<div>
    <Link to={can.manage ? "/students" : "/my-students"} className="back"><ArrowRight size={16} className="flip" />{t("Back")}</Link>
    <div className="page-head"><div><h1>{p.name}</h1><p className="sub" dir="auto">{p.username}{p.phone && <> — <Phone size={13} /> <span dir="ltr">{p.phone}</span></>}</p></div></div>
    <div className="stats">
      <Stat value={a.total ? `${Math.round(100 * (a.total - a.absent) / a.total)}%` : "—"} label={t("Attendance rate")} tone="good" />
      <Stat value={a.absent} label={t("Absences")} tone={a.absent ? "bad" : ""} />
      <Stat value={a.late} label={t("Late arrivals")} />
      <Stat value={p.parents.map((x) => x.name).join("، ") || "—"} label={t("Parents")} />
    </div>
    <ProfileCard p={p} onToggle={can.manage ? toggle : null} onFee={can.manage ? fee : null} />
    <div className="grid2">
      <section className="panel"><div className="panel-head"><h2>{t("Grades")}</h2></div>
        {p.grades.length ? <div className="table-wrap"><table><tbody>{p.grades.map((g) => (
          <tr key={g.id}><td><b>{tr(g, "module_name")}</b><br /><small className="muted">{g.title}</small></td><td className="num">{f.date(g.date)}</td>
            <td><span className={`pill num ${g.on_20 >= 10 ? "ok" : "bad"}`}>{Number(g.score)}/{Number(g.out_of)}</span></td></tr>))}</tbody></table></div>
          : <Empty title={t("No grades yet.")} />}</section>
      {can.manage && <section className="panel"><div className="panel-head"><h2>{t("Payments")}</h2></div>
        {p.payments.length ? <div className="table-wrap"><table><tbody>{p.payments.map((x) => (
          <tr key={x.id}><td>{x.label}</td><td className="num">{f.money(x.amount)} {school.currency}</td>
            <td><span className={`pill ${x.status === "paid" ? "ok" : x.status === "late" ? "bad" : "warn"}`}>{t(x.status)}</span></td></tr>))}</tbody></table></div>
          : <Empty title={t("No payments.")} />}</section>}
    </div>
  </div>);
}
