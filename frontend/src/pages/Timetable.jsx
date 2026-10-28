import { useEffect, useState } from "react";
import { BellRing, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Trash2, Users, XCircle } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import Form from "../components/Form.jsx";
import { CancelModal, RemindModal } from "../components/Composer.jsx";
import { Modal, PageHead, Spinner, isoDay, useFmt, useToast } from "../components/ui.jsx";

const weekStart = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }; // Sunday
const FIELDS = [
  { name: "group", label: "Class", type: "select", required: true, source: { endpoint: "/groups/", label: (x, tr) => `${x.name} — ${tr({ n: x.level_name, n_ar: x.level_name_ar }, "n")}` } },
  { name: "module", label: "Module", type: "select", required: true, source: { endpoint: "/modules/?used=1", label: (x, tr) => `${tr(x, "name")} — ${x.level_name}` } },
  { name: "teacher", label: "Teacher", type: "select", required: true, source: { endpoint: "/users/?role=teacher", label: (x) => `${x.first_name} ${x.last_name}`.trim() || x.username } },
  { name: "room", label: "Room", type: "select", source: { endpoint: "/rooms/", label: (x) => x.name } },
  { name: "start", label: "Start", type: "datetime-local", required: true },
  { name: "end", label: "End", type: "datetime-local", required: true },
  { name: "topic", label: "Lesson topic (shown in reminders)", full: true },
];
const REPEAT = { name: "repeat_weeks", label: "Repeat every week for (weeks)", type: "number", min: 0, help: "0 = only once. Days with a conflict or a closure are skipped." };

export default function Timetable() {
  const { can } = useAuth(); const { t, tr, loc, dir } = useT(); const f = useFmt(); const { toast, confirm } = useToast();
  const [week, setWeek] = useState(weekStart(new Date()));
  const [rows, setRows] = useState(null); const [form, setForm] = useState(null); const [open, setOpen] = useState(null);
  const [remind, setRemind] = useState(null); const [cancel, setCancel] = useState(null);
  const [groups, setGroups] = useState([]); const [teachers, setTeachers] = useState([]);
  const [fg, setFg] = useState(""); const [ft, setFt] = useState("");
  const days = [...Array(7)].map((_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d; });
  const load = () => api.get("/sessions/", { params: { from: isoDay(days[0]), to: isoDay(days[6]), group: fg || undefined, teacher: ft || undefined } })
    .then((r) => setRows(r.data)).catch((e) => toast(errText(e, t), "error"));
  useEffect(() => { load(); }, [week, fg, ft]);
  useEffect(() => {
    if (!can.staff) return;
    api.get("/groups/").then((r) => setGroups(r.data));
    if (can.manage) api.get("/users/", { params: { role: "teacher" } }).then((r) => setTeachers(r.data));
  }, []);
  const shift = (n) => { const d = new Date(week); d.setDate(d.getDate() + n * 7); setWeek(d); };
  const save = async (b) => {
    if (form.id) { await api.patch(`/sessions/${form.id}/`, b); toast(t("Saved")); }
    else { const r = await api.post("/sessions/", b); toast(`${t("Classes created")}: ${r.data.created}${r.data.skipped?.length ? ` — ${t("Skipped")}: ${r.data.skipped.join("، ")}` : ""}`); }
    setForm(null); setOpen(null); load();
  };
  const del = async (s) => {
    if (!(await confirm({ title: t("Delete this class?"), body: t("Use \"Cancel\" instead if students must be notified. Deleting removes its attendance too."), danger: true, ok: t("Delete") }))) return;
    try { await api.delete(`/sessions/${s.id}/`); setOpen(null); load(); toast(t("Deleted")); } catch (e) { toast(errText(e, t), "error"); }
  };
  const restore = async (s) => { try { await api.post(`/sessions/${s.id}/restore/`); setOpen(null); load(); } catch (e) { toast(errText(e, t), "error"); } };
  const newAt = (d) => { const s = new Date(d); s.setHours(8, 0, 0, 0); const e = new Date(s); e.setHours(9); setForm({ start: s.toISOString(), end: e.toISOString(), repeat_weeks: 0 }); };
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft, Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const today = new Date().toDateString();
  return (<div>
    <PageHead title={t("Timetable")}>
      {can.manage && <button className="btn" onClick={() => newAt(new Date())}><Plus size={17} />{t("New class")}</button>}
    </PageHead>
    <div className="toolbar">
      <div className="daybar">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label={t("Previous week")}><Prev size={18} /></button>
        <b className="num">{days[0].toLocaleDateString(loc, { day: "numeric", month: "short" })} – {days[6].toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" })}</b>
        <button className="icon-btn" onClick={() => shift(1)} aria-label={t("Next week")}><Next size={18} /></button>
        <button className="btn ghost sm" onClick={() => setWeek(weekStart(new Date()))}>{t("This week")}</button>
      </div>
      {can.staff && groups.length > 0 && <select value={fg} onChange={(e) => setFg(e.target.value)} aria-label={t("Class")}>
        <option value="">{t("All classes")}</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
      {can.manage && <select value={ft} onChange={(e) => setFt(e.target.value)} aria-label={t("Teacher")}>
        <option value="">{t("All teachers")}</option>{teachers.map((x) => <option key={x.id} value={x.id}>{x.first_name} {x.last_name}</option>)}</select>}
    </div>
    {!rows ? <Spinner /> : (
      <div className="week" style={{ "--cols": days.filter((d) => rows.some((s) => new Date(s.start).toDateString() === d.toDateString()) || (d.getDay() !== 5 && d.getDay() !== 6) || d.toDateString() === today).length }}>
        {days.map((d) => {
          const list = rows.filter((s) => new Date(s.start).toDateString() === d.toDateString());
          if (!list.length && (d.getDay() === 5 || d.getDay() === 6) && d.toDateString() !== today) return null; // empty weekend
          return (
            <div className={`day ${d.toDateString() === today ? "today" : ""}`} key={d.toISOString()}>
              <div className="day-head"><b>{d.toLocaleDateString(loc, { weekday: "long" })}</b><span className="num">{d.toLocaleDateString(loc, { day: "numeric", month: "numeric" })}</span>
                {can.manage && <button className="icon-btn sm" onClick={() => newAt(d)} aria-label={t("New class")}><Plus size={15} /></button>}</div>
              {list.map((s) => (
                <button className={`slot ${s.status}`} key={s.id} onClick={() => setOpen(s)}>
                  <span className="num slot-time" dir="ltr">{f.time(s.start)} – {f.time(s.end)}</span>
                  <b>{tr(s, "module_name")}</b>
                  <small>{s.group_name}</small>
                  {can.manage || can.family ? <small>{s.teacher_name}</small> : null}
                  {s.status === "cancelled" && <small className="bad-t">{t("Cancelled")}</small>}
                </button>))}
              {!list.length && <span className="day-empty">—</span>}
            </div>);
        })}
      </div>
    )}
    {open && (
      <Modal title={tr(open, "module_name")} onClose={() => setOpen(null)} small>
        <dl className="facts">
          <dt>{t("When")}</dt><dd>{f.day(open.start)}، <span className="num" dir="ltr">{f.time(open.start)} – {f.time(open.end)}</span></dd>
          <dt>{t("Class")}</dt><dd>{open.group_name}</dd>
          <dt>{t("Teacher")}</dt><dd>{open.teacher_name}</dd>
          {open.room_name && <><dt>{t("Room")}</dt><dd>{open.room_name}</dd></>}
          {open.topic && <><dt>{t("Topic")}</dt><dd>{open.topic}</dd></>}
          {can.staff && <><dt>{t("Students expected")}</dt><dd className="num"><Users size={14} /> {open.expected}</dd></>}
          <dt>{t("Status")}</dt><dd><span className={`pill ${open.status === "cancelled" ? "bad" : open.status === "done" ? "ok" : ""}`}>{t(open.status)}</span>
            {open.cancel_reason && <> {open.cancel_reason}</>}</dd>
        </dl>
        {can.staff && <div className="modal-actions wrap">
          {open.status === "planned" && <><button className="btn" onClick={() => { setRemind(open); setOpen(null); }}><BellRing size={16} />{t("Remind the students")}</button>
            <button className="btn ghost danger-t" onClick={() => { setCancel(open); setOpen(null); }}><XCircle size={16} />{t("Cancel")}</button></>}
          {can.manage && open.status === "cancelled" && <button className="btn ghost" onClick={() => restore(open)}><RotateCcw size={16} />{t("Restore")}</button>}
          {can.manage && <button className="btn ghost" onClick={() => setForm(open)}><Pencil size={16} />{t("Edit")}</button>}
          {can.manage && <button className="icon-btn danger" onClick={() => del(open)} aria-label={t("Delete")} title={t("Delete")}><Trash2 size={17} /></button>}
        </div>}
      </Modal>
    )}
    {form && <Form title={form.id ? "Edit class" : "New class"} fields={form.id ? FIELDS : [...FIELDS, REPEAT]} initial={form} onSubmit={save} onClose={() => setForm(null)} wide />}
    {remind && <RemindModal session={remind} onClose={() => setRemind(null)} />}
    {cancel && <CancelModal session={cancel} onClose={() => setCancel(null)} onDone={load} />}
  </div>);
}
