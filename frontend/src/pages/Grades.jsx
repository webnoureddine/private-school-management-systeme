import { useEffect, useMemo, useState } from "react";
import { ClipboardList, NotebookPen, Plus, Search } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import Crud from "../components/Crud.jsx";
import { Empty, Modal, PageHead, Spinner, isoDay, useFmt, useToast } from "../components/ui.jsx";

export default function Grades() {
  const { can } = useAuth();
  return can.family ? <FamilyGrades /> : <StaffGrades />;
}

function StaffGrades() {
  const { t } = useT(); const f = useFmt();
  const [bulk, setBulk] = useState(false); const [k, setK] = useState(0);
  return (<>
    <Crud key={k} title="Grades" endpoint="/grades/" sub="Enter one exam for a whole class with “Enter a class exam”."
      toolbar={<button className="btn ghost" onClick={() => setBulk(true)}><ClipboardList size={17} />{t("Enter a class exam")}</button>}
      columns={[{ key: "student_name", label: "Student", render: (r) => <b>{r.student_name}</b> }, { key: "module_name", label: "Module", render: (r, tr) => tr(r, "module_name") },
        { key: "title", label: "Exam" }, { key: "score", label: "Score", render: (r) => <span className={`pill num ${r.on_20 >= 10 ? "ok" : "bad"}`}>{Number(r.score)}/{Number(r.out_of)}</span> },
        { key: "date", label: "Date", render: (r) => <span className="num">{f.date(r.date)}</span> }]}
      fields={[{ name: "student", label: "Student", type: "select", required: true, source: { endpoint: "/students/", label: (x) => x.name } },
        { name: "module", label: "Module", type: "select", required: true, source: { endpoint: "/modules/?used=1", label: (x, tr) => `${tr(x, "name")} — ${x.level_name}` } },
        { name: "title", label: "Exam", required: true, placeholder: "Test 1, Term exam…" }, { name: "date", label: "Date", type: "date" },
        { name: "score", label: "Score", type: "number", required: true, min: 0 }, { name: "out_of", label: "Out of", type: "number" }]}
      defaults={{ out_of: 20, date: isoDay() }} />
    {bulk && <BulkGrades onClose={() => setBulk(false)} onDone={() => { setBulk(false); setK(k + 1); }} />}
  </>);
}

/** Class exam: pick class + module, type all scores in one table. */
function BulkGrades({ onClose, onDone }) {
  const { t, tr } = useT(); const { can } = useAuth(); const { toast } = useToast();
  const [pairs, setPairs] = useState([]); const [pick, setPick] = useState(""); const [students, setStudents] = useState([]);
  const [m, setM] = useState({ title: "", out_of: 20, date: isoDay() }); const [scores, setScores] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (can.teach) api.get("/me/teaching/").then((r) => setPairs(r.data.map((x) => ({ group: x.group_id, module: x.module_id, label: `${x.group} — ${tr({ n: x.module, n_ar: x.module_ar }, "n")}` }))));
    else api.get("/teachings/").then((r) => setPairs(r.data.map((x) => ({ group: x.group, module: x.module, label: `${x.group_name} — ${tr(x, "module_name")}` }))));
  }, []);
  useEffect(() => {
    if (!pick) return setStudents([]);
    const p = pairs[pick];
    api.get("/subscriptions/", { params: { group: p.group, module: p.module } }).then((r) => setStudents(r.data.filter((s) => s.active).map((s) => ({ id: s.student, name: s.student_name }))));
  }, [pick]);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const p = pairs[pick];
      const r = await api.post("/grades/bulk/", { ...m, module: p.module, scores: Object.entries(scores).map(([student, score]) => ({ student: Number(student), score })) });
      toast(`${t("Grades saved")}: ${r.data.saved}`); onDone();
    } catch (x) { toast(errText(x, t), "error"); } finally { setBusy(false); }
  };
  return (<Modal title={t("Enter a class exam")} onClose={onClose} wide>
    <form onSubmit={save}>
      <div className="form-grid">
        <div className="field full"><label>{t("Class and module")}<span className="req">*</span></label>
          <select required value={pick} onChange={(e) => setPick(e.target.value)}><option value="">{t("— choose —")}</option>{pairs.map((p, i) => <option key={i} value={i}>{p.label}</option>)}</select></div>
        <div className="field"><label>{t("Exam")}<span className="req">*</span></label><input required value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} /></div>
        <div className="field"><label>{t("Date")}</label><input type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} /></div>
        <div className="field"><label>{t("Out of")}</label><input type="number" min="1" dir="ltr" value={m.out_of} onChange={(e) => setM({ ...m, out_of: e.target.value })} /></div>
      </div>
      {pick && (students.length ? <div className="score-grid">{students.map((s) => (
        <label key={s.id}><span>{s.name}</span><input type="number" min="0" max={m.out_of} step="0.25" dir="ltr" className="num" value={scores[s.id] ?? ""} onChange={(e) => setScores({ ...scores, [s.id]: e.target.value })} /></label>))}</div>
        : <p className="muted">{t("No subscribed students for this class.")}</p>)}
      <div className="modal-actions"><button className="btn" disabled={busy || !pick}>{busy ? t("Saving…") : t("Save grades")}</button><button type="button" className="btn ghost" onClick={onClose}>{t("Cancel")}</button></div>
    </form>
  </Modal>);
}

function FamilyGrades() {
  const { t, tr } = useT(); const f = useFmt(); const { user } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/grades/").then((r) => setRows(r.data)); }, []);
  const groups = useMemo(() => {
    const m = {};
    (rows || []).forEach((g) => { const k = `${g.student}:${g.module}`; (m[k] ||= { key: k, student: g.student_name, module: g, list: [] }).list.push(g); });
    return Object.values(m).map((x) => ({ ...x, avg: x.list.reduce((s, g) => s + g.on_20, 0) / x.list.length }));
  }, [rows]);
  return (<div><PageHead title={t("Grades")} />
    {!rows ? <Spinner /> : groups.length ? <div className="cards">{groups.map((x) => (
      <section className="panel grade-card" key={x.key}>
        <div className="panel-head"><h2>{tr(x.module, "module_name")}</h2><span className={`avg num ${x.avg >= 10 ? "ok" : "bad"}`}>{x.avg.toFixed(2)}<small>/20</small></span></div>
        {user.role === "parent" && <p className="muted small pad-x">{x.student}</p>}
        <ul className="rank">{x.list.map((g) => <li key={g.id}><span>{g.title} <small className="muted">{f.date(g.date)}</small></span><b className="num">{Number(g.score)}/{Number(g.out_of)}</b></li>)}</ul>
      </section>))}</div> : <div className="panel"><Empty icon={NotebookPen} title={t("No grades yet.")} /></div>}
  </div>);
}
