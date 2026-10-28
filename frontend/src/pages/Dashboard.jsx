import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, BellRing, CalendarDays, CheckCircle2, ClipboardCheck, CreditCard, GraduationCap, Megaphone, NotebookPen,
  Percent, School, Tags, UserRound, Users, XCircle,
} from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import Composer, { CancelModal, RemindModal } from "../components/Composer.jsx";
import { Empty, Spinner, Stat, useFmt, useToast } from "../components/ui.jsx";

export default function Dashboard() {
  const { user, can, school } = useAuth(); const { t, tr } = useT(); const f = useFmt(); const { toast, confirm } = useToast();
  const [d, setD] = useState(null); const [daily, setDaily] = useState(null); const [mine, setMine] = useState(null);
  const [compose, setCompose] = useState(false); const [allBells, setAllBells] = useState(false); const [remind, setRemind] = useState(null); const [cancel, setCancel] = useState(null);
  const load = () => {
    api.get("/dashboard/").then((r) => setD(r.data));
    if (can.staff) api.get("/daily/").then((r) => setDaily(r.data));
    else {
      const today = new Date(); const to = new Date(); to.setDate(to.getDate() + 7);
      const iso = (x) => x.toISOString().slice(0, 10);
      api.get("/sessions/", { params: { from: iso(today), to: iso(to) } }).then((r) => setMine(r.data));
    }
  };
  useEffect(load, []);
  const runDaily = async () => {
    if (!(await confirm({ title: t("Send tomorrow's reminders now?"), body: t("Students, parents and teachers with a class tomorrow receive a reminder. Late payments are reminded too. Each reminder is sent only once.") }))) return;
    try { const r = await api.post("/cron/daily/"); toast(`${t("Reminders sent")}: ${r.data.reminders} — ${t("Payment reminders")}: ${r.data.payments}`); }
    catch (e) { toast(errText(e, t), "error"); }
  };
  const first = user.first_name || user.username;
  const sm = daily?.summary || {};
  const cur = school.currency || "";
  return (
    <div>
      <div className="hello">
        <div><h1>{t("Hello")} {first}</h1><p className="sub">{f.day(new Date())}</p></div>
        {can.staff && <div className="page-actions">
          <Link className="btn" to="/attendance"><ClipboardCheck size={17} />{t("Take attendance")}</Link>
          <button className="btn ghost" onClick={() => setCompose(true)}><Megaphone size={17} />{t("New message")}</button>
          {can.manage && <button className="btn ghost" onClick={runDaily}><BellRing size={17} />{t("Send tomorrow's reminders")}</button>}
        </div>}
      </div>

      {can.staff && (<>
        <div className="stats">
          <Stat icon={GraduationCap} value={sm.expected_students} label={t("Students expected today")} />
          <Stat icon={CalendarDays} value={sm.sessions} label={t("Classes today")} hint={sm.cancelled ? `${t("Cancelled")}: ${sm.cancelled}` : ""} />
          <Stat icon={ClipboardCheck} value={sm.to_mark} label={t("Classes to mark")} tone={sm.to_mark ? "warn" : ""} />
          <Stat icon={XCircle} value={sm.absent} label={t("Absences today")} tone={sm.absent ? "bad" : ""} />
        </div>
        <section className="panel">
          <div className="panel-head"><h2>{t("Today's bell schedule")}</h2><Link to="/timetable" className="link">{t("Full timetable")}</Link></div>
          {!daily ? <Spinner /> : daily.sessions.length ? (<>
            <ol className={`bells ${allBells ? "" : "collapsible"}`}>
              {daily.sessions.map((s) => {
                const now = new Date(), live = s.status === "planned" && new Date(s.start) <= now && now <= new Date(s.end);
                const past = new Date(s.end) < now;
                return (
                  <li key={s.id} className={`bell-row ${s.status} ${live ? "live" : ""} ${past ? "past" : ""}`}>
                    <span className="bell-time num">{f.time(s.start)}<small>{f.time(s.end)}</small></span>
                    <span className="bell-dot" aria-hidden="true" />
                    <div className="bell-body">
                      <b>{tr(s, "module_name")}</b>
                      <span className="meta">{s.group_name}{can.manage && <> — {s.teacher_name}</>}{s.room_name && <> — {s.room_name}</>}</span>
                      {s.status === "cancelled" && <span className="pill bad">{t("Cancelled")}: {s.cancel_reason}</span>}
                    </div>
                    {s.status !== "cancelled" && <div className="bell-side">
                      {live && <span className="pill live">{t("Now")}</span>}
                      <span className="pill" title={t("Students")}><GraduationCap size={13} />{s.students.length}</span>
                      {s.marked ? <span className="pill ok"><CheckCircle2 size={13} />{t("Marked")}</span>
                        : past || live ? <Link to="/attendance" className="pill warn">{t("To mark")}</Link> : null}
                      {!past && s.status === "planned" && <>
                        <button className="icon-btn" title={t("Remind the students")} aria-label={t("Remind the students")} onClick={() => setRemind(s)}><BellRing size={16} /></button>
                        <button className="icon-btn danger" title={t("Cancel this class")} aria-label={t("Cancel this class")} onClick={() => setCancel(s)}><XCircle size={16} /></button>
                      </>}
                    </div>}
                  </li>
                );
              })}
            </ol>
            {!allBells && daily.sessions.length > 5 && <button className="show-all" onClick={() => setAllBells(true)}>{t("Show all classes")} ({daily.sessions.length})</button>}
          </>) : <Empty icon={CalendarDays} title={t("No classes today.")} />}
        </section>

        <div className="grid2">
          <section className="panel">
            <div className="panel-head"><h2>{t("Attendance rate, last 14 days")}</h2></div>
            {d?.attendance_chart ? <AttendanceChart data={d.attendance_chart} /> : <Spinner />}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>{t("Most absent this month")}</h2></div>
            {d?.most_absent?.length ? <ul className="rank">{d.most_absent.map((x) => (
              <li key={x.id}><Link to={`/students/${x.id}`}>{x.name}</Link><span className="pill bad num">{x.absences}</span></li>))}</ul>
              : <Empty icon={CheckCircle2} title={t("No absences this month.")} />}
          </section>
        </div>

        {can.manage && d && (
          <div className="stats">
            <Stat icon={GraduationCap} value={d.students} label={t("Students")} />
            <Stat icon={UserRound} value={d.teachers} label={t("Teachers")} />
            <Stat icon={School} value={d.groups} label={t("Classes")} />
            <Stat icon={Tags} value={d.subscriptions} label={t("Active subscriptions")} />
            <Stat icon={CreditCard} value={`${f.money(d.paid_month)} ${cur}`} label={t("Collected this month")} tone="good" />
            <Stat icon={AlertTriangle} value={`${f.money(d.late_amount)} ${cur}`} label={t("Late payments")} tone={Number(d.late_amount) ? "bad" : ""} hint={`${t("Unpaid")}: ${d.unpaid}`} />
          </div>
        )}
        {can.manage && d?.channels && !Object.values(d.channels).some(Boolean) && (
          <div className="alert warn"><AlertTriangle size={17} />
            <span>{t("Messages are only delivered inside the app for now.")} {user.is_superuser || user.role === "admin" ? <Link to="/settings">{t("Connect email, WhatsApp or Telegram in Settings.")}</Link> : null}</span></div>
        )}
        {can.teach && d && <div className="stats">
          <Stat icon={Users} value={d.my_students} label={t("My students")} />
          <Stat icon={School} value={d.my_groups} label={t("My classes")} />
        </div>}
      </>)}

      {can.family && (<>
        <div className="stats">
          <Stat icon={Percent} value={d?.attendance_rate != null ? `${d.attendance_rate}%` : "—"} label={t("Attendance rate")} tone="good" />
          <Stat icon={XCircle} value={d?.absences} label={t("Absences")} tone={d?.absences ? "bad" : ""} />
          <Stat icon={CreditCard} value={d?.due_payments?.length} label={t("Payments due")} tone={d?.due_payments?.length ? "warn" : ""} />
          <Stat icon={BellRing} value={d?.unread} label={t("Unread notifications")} />
        </div>
        <section className="panel">
          <div className="panel-head"><h2>{t("Next 7 days")}</h2><Link to="/timetable" className="link">{t("Full timetable")}</Link></div>
          {!mine ? <Spinner /> : mine.length ? <ol className="bells">{mine.map((s) => (
            <li key={s.id} className={`bell-row ${s.status}`}>
              <span className="bell-time num">{f.time(s.start)}<small>{`${new Date(s.start).getDate()}/${new Date(s.start).getMonth() + 1}`}</small></span>
              <span className="bell-dot" aria-hidden="true" />
              <div className="bell-body"><b>{tr(s, "module_name")}</b><span className="meta">{f.day(s.start)} — {s.teacher_name}{s.room_name && ` — ${s.room_name}`}</span>
                {s.topic && <span className="meta">{s.topic}</span>}
                {s.status === "cancelled" && <span className="pill bad">{t("Cancelled")}: {s.cancel_reason}</span>}</div>
            </li>))}</ol> : <Empty icon={CalendarDays} title={t("No classes in the next 7 days.")} />}
        </section>
        <div className="grid2">
          <section className="panel"><div className="panel-head"><h2>{t("Latest grades")}</h2><Link to="/grades" className="link">{t("All grades")}</Link></div>
            {d?.recent_grades?.length ? <ul className="rank">{d.recent_grades.map((g) => (
              <li key={g.id}><span><b>{tr(g, "module_name")}</b> <small className="muted">{g.title}{user.role === "parent" && ` — ${g.student_name}`}</small></span>
                <span className={`pill num ${g.on_20 >= 10 ? "ok" : "bad"}`}>{Number(g.score)}/{Number(g.out_of)}</span></li>))}</ul>
              : <Empty icon={NotebookPen} title={t("No grades yet.")} />}</section>
          <section className="panel"><div className="panel-head"><h2>{t("Payments due")}</h2><Link to="/payments" className="link">{t("All payments")}</Link></div>
            {d?.due_payments?.length ? <ul className="rank">{d.due_payments.map((p) => (
              <li key={p.id}><span><b>{p.label}</b> <small className="muted">{user.role === "parent" && `${p.student_name} — `}{f.date(p.due_date)}</small></span>
                <span className={`pill num ${p.status === "late" ? "bad" : "warn"}`}>{f.money(p.amount)} {cur}</span></li>))}</ul>
              : <Empty icon={CheckCircle2} title={t("Everything is paid.")} />}</section>
        </div>
      </>)}

      {compose && <Composer onClose={() => setCompose(false)} />}
      {remind && <RemindModal session={remind} onClose={() => setRemind(null)} />}
      {cancel && <CancelModal session={cancel} onClose={() => setCancel(null)} onDone={load} />}
    </div>
  );
}

function AttendanceChart({ data }) {
  const { loc, t } = useT();
  const W = 560, H = 170, P = 26, bw = (W - P * 2) / data.length;
  const has = data.some((x) => x.rate != null);
  if (!has) return <Empty icon={ClipboardCheck} title={t("No attendance recorded yet.")} />;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="chart" role="img" aria-label={t("Attendance rate, last 14 days")}>
      {[50, 75, 100].map((y) => { const yy = H - (y / 100) * (H - 10); return <g key={y}><line x1={P} x2={W - P} y1={yy} y2={yy} className="grid" /><text x={W - P + 4} y={yy + 4} className="axis">{y}%</text></g>; })}
      {data.map((x, i) => {
        const h = x.rate == null ? 0 : (x.rate / 100) * (H - 10);
        const dd = new Date(x.date + "T12:00");
        return (<g key={x.date}>
          {x.rate != null ? <rect x={P + i * bw + bw * 0.18} y={H - h} width={bw * 0.64} height={h} rx="3" className={x.rate < 85 ? "bar low" : "bar"}><title>{x.rate}%</title></rect>
            : <rect x={P + i * bw + bw * 0.18} y={H - 2} width={bw * 0.64} height="2" className="bar none" />}
          {i % 2 === 1 && <text x={P + i * bw + bw / 2} y={H + 16} textAnchor="middle" className="axis">{`${dd.getDate()}/${dd.getMonth() + 1}`}</text>}
        </g>);
      })}
    </svg>
  );
}
