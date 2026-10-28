import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardCheck, GraduationCap, Save, Search, X, XCircle } from "lucide-react";
import api, { errText } from "../api";
import { useT } from "../i18n.jsx";
import { CancelModal, RemindModal } from "../components/Composer.jsx";
import { Empty, PageHead, Spinner, Stat, isoDay, useFmt, useToast } from "../components/ui.jsx";

/** Daily roll call: every session of the day with the students SUBSCRIBED to it. One tap = present/absent. */
export default function Attendance() {
  const { t, tr, dir } = useT(); const f = useFmt(); const { toast } = useToast();
  const [day, setDay] = useState(isoDay());
  const [data, setData] = useState(null); const [st, setSt] = useState({}); const [view, setView] = useState("sessions");
  const [q, setQ] = useState(""); const [saving, setSaving] = useState(null);
  const [remind, setRemind] = useState(null); const [cancel, setCancel] = useState(null);
  const load = () => api.get("/daily/", { params: { date: day } }).then((r) => {
    setData(r.data); const m = {};
    r.data.sessions.forEach((s) => s.students.forEach((x) => { m[`${s.id}:${x.id}`] = { present: x.present ?? true, late: x.late_minutes || 0 }; }));
    setSt(m);
  }).catch((e) => toast(errText(e, t), "error"));
  useEffect(() => { setData(null); load(); }, [day]);
  const shift = (n) => { const d = new Date(day + "T12:00"); d.setDate(d.getDate() + n); setDay(isoDay(d)); };
  const key = (sid, id) => `${sid}:${id}`;
  const set = (sid, id, patch) => setSt((s) => ({ ...s, [key(sid, id)]: { ...s[key(sid, id)], ...patch } }));
  const all = (s, present) => s.students.forEach((x) => set(s.id, x.id, { present }));
  const save = async (s) => {
    setSaving(s.id);
    try {
      const r = await api.post(`/sessions/${s.id}/attendance/`, s.students.map((x) => ({ student: x.id, present: st[key(s.id, x.id)].present, late_minutes: Number(st[key(s.id, x.id)].late) || 0 })));
      toast(r.data.alerts ? `${t("Attendance saved.")} ${t("Absence alerts sent")}: ${r.data.alerts}` : t("Attendance saved.")); load();
    } catch (e) { toast(errText(e, t), "error"); } finally { setSaving(null); }
  };
  const sm = data?.summary || {};
  const byStudent = useMemo(() => {
    const m = {};
    (data?.sessions || []).filter((s) => s.status !== "cancelled").forEach((s) => s.students.forEach((x) => {
      (m[x.id] ||= { id: x.id, name: x.name, rows: [] }).rows.push({ s, present: x.present });
    }));
    return Object.values(m).filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, q]);
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft, Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const isToday = day === isoDay();

  return (<div>
    <PageHead title={t("Daily attendance")} sub={t("Only students subscribed to the module are listed.")}>
      <div className="daybar">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label={t("Previous day")}><Prev size={18} /></button>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button className="icon-btn" onClick={() => shift(1)} aria-label={t("Next day")}><Next size={18} /></button>
        {!isToday && <button className="btn ghost sm" onClick={() => setDay(isoDay())}>{t("Today")}</button>}
      </div>
    </PageHead>
    <div className="stats">
      <Stat icon={GraduationCap} value={sm.expected_students} label={t("Students expected")} />
      <Stat icon={CalendarDays} value={sm.sessions} label={t("Classes")} />
      <Stat icon={ClipboardCheck} value={sm.to_mark} label={t("Classes to mark")} tone={sm.to_mark ? "warn" : ""} />
      <Stat icon={XCircle} value={sm.absent} label={t("Absences")} tone={sm.absent ? "bad" : ""} />
    </div>
    <div className="toolbar">
      <div className="seg">
        <button className={view === "sessions" ? "on" : ""} onClick={() => setView("sessions")}>{t("By class")}</button>
        <button className={view === "students" ? "on" : ""} onClick={() => setView("students")}>{t("By student")}</button>
      </div>
      {view === "students" && <span className="search-in"><Search size={16} /><input placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} /></span>}
    </div>
    {!data ? <Spinner /> : !data.sessions.length ? <div className="panel"><Empty icon={CalendarDays} title={t("No classes on this day.")} /></div> : null}
    {view === "sessions" && data?.sessions.map((s) => {
      const absent = s.students.filter((x) => st[key(s.id, x.id)]?.present === false).length;
      const future = new Date(s.start) > new Date();
      return (
        <section className={`panel roll ${s.status}`} key={s.id}>
          <div className="roll-head">
            <div>
              <span className="num roll-time" dir="ltr">{f.time(s.start)} – {f.time(s.end)}</span>
              <h3>{tr(s, "module_name")}</h3>
              <span className="meta">{s.group_name} — {tr({ n: s.level_name, n_ar: s.level_name_ar }, "n")} — {s.teacher_name}{s.room_name && ` — ${s.room_name}`}</span>
              {s.topic && <span className="meta">{t("Topic")}: {s.topic}</span>}
            </div>
            <div className="roll-tags">
              {s.status === "cancelled" ? <span className="pill bad">{t("Cancelled")}: {s.cancel_reason}</span> : <>
                <span className="pill" title={t("Students")}><GraduationCap size={13} />{s.students.length}</span>
                {absent > 0 && <span className="pill bad">{t("Absent")}: {absent}</span>}
                <span className={`pill ${s.marked ? "ok" : "warn"}`}>{s.marked ? t("Marked") : t("To mark")}</span>
                {s.status === "planned" && future && <>
                  <button className="btn ghost sm" onClick={() => setRemind(s)}><BellRing size={15} />{t("Remind")}</button>
                  <button className="btn ghost sm danger-t" onClick={() => setCancel(s)}><XCircle size={15} />{t("Cancel")}</button></>}
              </>}
            </div>
          </div>
          {s.status !== "cancelled" && (s.students.length ? (<>
            <div className="roster">{s.students.map((x) => {
              const v = st[key(s.id, x.id)] || { present: true, late: 0 };
              return (
                <div className={`stu ${v.present ? "" : "is-absent"}`} key={x.id}>
                  <span className="nm" title={x.name}>{x.name}</span>
                  {v.present && <input className="late num" type="number" min="0" aria-label={t("Late (min)")} title={t("Late (min)")} placeholder={t("late")} value={v.late || ""} onChange={(e) => set(s.id, x.id, { late: e.target.value })} />}
                  <span className="pm" role="group">
                    <button className={`p ${v.present ? "on" : ""}`} aria-pressed={v.present} title={t("Present")} onClick={() => set(s.id, x.id, { present: true })}><Check size={16} /></button>
                    <button className={`a ${!v.present ? "on" : ""}`} aria-pressed={!v.present} title={t("Absent")} onClick={() => set(s.id, x.id, { present: false })}><X size={16} /></button>
                  </span>
                </div>);
            })}</div>
            <div className="roll-foot">
              <button className="btn" disabled={saving === s.id} onClick={() => save(s)}><Save size={16} />{saving === s.id ? t("Saving…") : t("Save attendance")}</button>
              <button className="btn ghost sm" onClick={() => all(s, true)}>{t("Everyone present")}</button>
              <button className="btn ghost sm" onClick={() => all(s, false)}>{t("Everyone absent")}</button>
              <span className="muted small">{t("Absent students and their parents are notified once.")}</span>
            </div></>)
            : <p className="muted pad">{t("No subscribed students for this class.")}</p>)}
        </section>);
    })}
    {view === "students" && data && data.sessions.length > 0 && (
      <div className="panel"><div className="table-wrap"><table>
        <thead><tr><th>{t("Student")}</th><th>{t("Classes of the day")}</th></tr></thead>
        <tbody>{byStudent.map((x) => (
          <tr key={x.id}><td><b>{x.name}</b></td><td><div className="chips">{x.rows.map(({ s, present }) => (
            <span className={`pill ${present === false ? "bad" : present ? "ok" : ""}`} key={s.id}>{f.time(s.start)} {tr(s, "module_name")}</span>))}</div></td></tr>))}
          {!byStudent.length && <tr><td colSpan="2"><Empty title={t("Nothing found.")} /></td></tr>}</tbody></table></div></div>)}
    {remind && <RemindModal session={remind} onClose={() => setRemind(null)} />}
    {cancel && <CancelModal session={cancel} onClose={() => setCancel(null)} onDone={load} />}
  </div>);
}
