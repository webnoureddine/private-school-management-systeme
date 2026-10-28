import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, CreditCard, FilePlus2, Plus, Search, Undo2 } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import Form from "../components/Form.jsx";
import { Empty, PageHead, Spinner, Stat, isoDay, useFmt, useToast } from "../components/ui.jsx";

const MONTHS_AR = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export default function Payments() {
  const { can, school } = useAuth(); const { t, lang, loc } = useT(); const f = useFmt(); const { toast, confirm } = useToast();
  const [rows, setRows] = useState(null); const [sum, setSum] = useState(null); const [status, setStatus] = useState("");
  const [q, setQ] = useState(""); const [form, setForm] = useState(null); const cur = school.currency;
  const load = () => {
    api.get("/payments/", { params: { status: status || undefined } }).then((r) => setRows(r.data)).catch((e) => toast(errText(e, t), "error"));
    if (can.manage) api.get("/payments/summary/").then((r) => setSum(r.data));
  };
  useEffect(() => { load(); }, [status]);
  const pay = async (p) => {
    if (p.paid_on && !(await confirm({ title: t("Mark as unpaid?"), body: `${p.student_name} — ${p.label}` }))) return;
    try { await api.post(`/payments/${p.id}/pay/`); toast(p.paid_on ? t("Marked as unpaid") : t("Payment recorded")); load(); } catch (e) { toast(errText(e, t), "error"); }
  };
  const remind = async () => {
    if (!(await confirm({ title: t("Remind unpaid fees?"), body: t("Students and parents with a payment due in the next 3 days or late receive a reminder (at most once a week)."), ok: t("Send reminders") }))) return;
    const r = await api.post("/payments/remind/", { days: 3 }); toast(`${t("Reminders sent")}: ${r.data.reminded}`);
  };
  const next = new Date(); next.setMonth(next.getMonth() + 1, 5);
  const monthName = lang === "ar" ? MONTHS_AR[next.getMonth()] : next.toLocaleDateString(loc, { month: "long" });
  const generate = async (b) => { const r = await api.post("/payments/generate/", b); setForm(null); toast(r.data.created ? `${t("Payments created")}: ${r.data.created}` : t("No new payment: they already exist for this label.")); load(); };
  const create = async (b) => { await api.post("/payments/", b); setForm(null); toast(t("Saved")); load(); };
  const shown = (rows || []).filter((r) => `${r.student_name} ${r.label}`.toLowerCase().includes(q.toLowerCase()));
  return (<div>
    <PageHead title={t("Payments")} sub={can.manage ? t("Monthly fees = total of the student's subscribed modules.") : ""}>
      {can.manage && <>
        <button className="btn ghost" onClick={remind}><BellRing size={17} />{t("Remind unpaid")}</button>
        <button className="btn ghost" onClick={() => setForm("one")}><Plus size={17} />{t("Add a payment")}</button>
        <button className="btn" onClick={() => setForm("gen")}><FilePlus2 size={17} />{t("Generate the month's fees")}</button></>}
    </PageHead>
    {can.manage && sum && <div className="stats">
      <Stat icon={CheckCircle2} value={`${f.money(sum.paid_this_month)} ${cur}`} label={t("Collected this month")} tone="good" />
      <Stat icon={CreditCard} value={`${f.money(sum.unpaid)} ${cur}`} label={t("Still to collect")} tone="warn" hint={`${t("Unpaid")}: ${sum.count_unpaid}`} />
      <Stat icon={BellRing} value={`${f.money(sum.late)} ${cur}`} label={t("Late")} tone={Number(sum.late) ? "bad" : ""} />
    </div>}
    <div className="toolbar">
      <div className="seg">{[["", "All"], ["unpaid", "Unpaid"], ["late", "Late"], ["paid", "Paid"]].map(([v, l]) =>
        <button key={v} className={status === v ? "on" : ""} onClick={() => setStatus(v)}>{t(l)}</button>)}</div>
      {can.manage && <span className="search-in"><Search size={16} /><input placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} /></span>}
    </div>
    <div className="panel">{!rows ? <Spinner /> : shown.length ? <div className="table-wrap"><table>
      <thead><tr><th>{t("Student")}</th><th>{t("Label")}</th><th>{t("Amount")}</th><th>{t("Due date")}</th><th>{t("Status")}</th>{can.manage && <th />}</tr></thead>
      <tbody>{shown.map((p) => (<tr key={p.id}>
        <td><b>{p.student_name}</b></td><td>{p.label}</td><td className="num">{f.money(p.amount)} {cur}</td><td className="num">{f.date(p.due_date)}</td>
        <td><span className={`pill ${p.status === "paid" ? "ok" : p.status === "late" ? "bad" : "warn"}`}>{t(p.status)}{p.paid_on && ` — ${f.date(p.paid_on)}`}</span></td>
        {can.manage && <td className="actions">{p.paid_on
          ? <button className="btn ghost sm" onClick={() => pay(p)}><Undo2 size={15} />{t("Undo")}</button>
          : <button className="btn sm" onClick={() => pay(p)}><CheckCircle2 size={15} />{t("Mark paid")}</button>}</td>}
      </tr>))}</tbody></table></div> : <Empty icon={CreditCard} title={t("No payments.")} />}</div>
    {form === "gen" && <Form title="Generate the month's fees" submitLabel="Generate" onClose={() => setForm(null)} onSubmit={generate}
      initial={{ label: `${t("Fees")} ${monthName} ${next.getFullYear()}`, due_date: isoDay(next) }}
      fields={[{ name: "label", label: "Label", required: true, full: true }, { name: "due_date", label: "Due date", type: "date", required: true },
        { name: "group", label: "Only one class (empty = all)", type: "select", source: { endpoint: "/groups/", label: (x) => x.name } }]} />}
    {form === "one" && <Form title="Add a payment" onClose={() => setForm(null)} onSubmit={create} initial={{ due_date: isoDay() }}
      fields={[{ name: "student", label: "Student", type: "select", required: true, source: { endpoint: "/students/", label: (x) => x.name } },
        { name: "label", label: "Label", required: true }, { name: "amount", label: "Amount", type: "number", required: true },
        { name: "due_date", label: "Due date", type: "date", required: true }, { name: "paid_on", label: "Paid on (empty = unpaid)", type: "date" }]} />}
  </div>);
}
