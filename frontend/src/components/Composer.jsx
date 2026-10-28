import { useEffect, useState } from "react";
import { BellRing, Send, Users } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import { MultiPick } from "./Form.jsx";
import { ChannelPicker, Modal, Switch, useToast } from "./ui.jsx";

const TEMPLATES = [
  ["No class tomorrow", "No class tomorrow", "We inform you that there will be no class tomorrow. We will let you know about the make-up session."],
  ["Class reminder", "Reminder: class tomorrow", "Don't forget the class tomorrow at the usual time. Please be on time and bring your materials."],
  ["Exam", "Upcoming exam", "An exam is planned next week. Please review the recent lessons."],
  ["Parents meeting", "Parents meeting", "We invite parents to a meeting at the school. Date and time: "],
];

function useChannels() {
  const { school } = useAuth();
  const [ready, setReady] = useState(school.channels || null);
  useEffect(() => { api.get("/settings/public/").then((r) => setReady(r.data.channels || null)).catch(() => {}); }, []);
  return ready;
}

/**
 * Compose and send a message.
 * preset: {group, users:[ids]} to open pre-filled (e.g. from "My students").
 */
export default function Composer({ onClose, onSent, preset = {} }) {
  const { t, tr } = useT(); const { can } = useAuth(); const { toast } = useToast();
  const ready = useChannels();
  const [target, setTarget] = useState(preset.users?.length ? "people" : preset.group ? "group" : can.manage ? "school" : "group");
  const [m, setM] = useState({ title: "", body: "", audience_role: can.manage ? "" : "student", audience_group: preset.group || "", include_parents: true });
  const [users, setUsers] = useState(preset.users || []);
  const [channels, setChannels] = useState([]);
  const [groups, setGroups] = useState([]); const [people, setPeople] = useState([]);
  const [count, setCount] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => {
    api.get("/groups/").then((r) => setGroups(r.data));
    if (can.manage) api.get("/users/", { params: { role: "student,teacher,parent,staff" } })
      .then((r) => setPeople(r.data.map((u) => ({ value: u.id, label: `${u.first_name} ${u.last_name}`.trim() || u.username, hint: t(u.role) }))));
    else api.get("/me/students/").then((r) => setPeople(r.data.map((u) => ({ value: u.id, label: u.name, hint: u.groups.join("، ") }))));
  }, []);
  useEffect(() => { if (ready) setChannels((c) => c.length ? c : Object.keys(ready).filter((k) => ready[k])); }, [ready]);
  const set = (k, v) => setM((s) => ({ ...s, [k]: v }));
  const payload = () => ({
    ...m,
    audience_group: target === "group" ? m.audience_group || null : null,
    audience_users: target === "people" ? users : [],
    audience_role: target === "people" ? "" : m.audience_role,
    channels: channels.join(","),
  });
  useEffect(() => {
    const valid = target === "school" || (target === "group" && m.audience_group) || (target === "people" && users.length);
    if (!valid) { setCount(null); return; }
    const h = setTimeout(() => api.post("/announcements/preview/", payload()).then((r) => setCount(r.data)).catch(() => setCount(null)), 300);
    return () => clearTimeout(h);
  }, [target, m.audience_group, m.audience_role, m.include_parents, users.join()]);
  const useTpl = ([, title, body]) => setM((s) => ({ ...s, title: t(title), body: t(body) }));
  const send = async (e) => {
    e.preventDefault(); setErr("");
    if (target === "people" && !users.length) return setErr(t("Choose at least one person."));
    setBusy(true);
    try {
      const r = await api.post("/announcements/", payload());
      toast(`${t("Message sent. Recipients")}: ${r.data.recipients}`);
      onSent?.(r.data); onClose();
    } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  const roleOpts = can.manage
    ? [["", "Everyone"], ["student", "Students"], ["parent", "Parents"], ["teacher", "Teachers"], ["staff", "Staff"]]
    : [["student", "Students"], ["parent", "Parents only"]];
  return (
    <Modal title={t("New message")} onClose={onClose} wide>
      <form onSubmit={send} className="composer">
        <div className="field full">
          <label>{t("Send to")}</label>
          <div className="seg">
            {can.manage && <button type="button" className={target === "school" ? "on" : ""} onClick={() => setTarget("school")}>{t("Whole school")}</button>}
            <button type="button" className={target === "group" ? "on" : ""} onClick={() => setTarget("group")}>{t(can.manage ? "A class" : "One of my classes")}</button>
            <button type="button" className={target === "people" ? "on" : ""} onClick={() => setTarget("people")}>{t(can.manage ? "Chosen people" : "Chosen students")}</button>
          </div>
        </div>
        <div className="form-grid">
          {target === "group" && (
            <div className="field">
              <label htmlFor="c-group">{t("Class")}<span className="req">*</span></label>
              <select id="c-group" required value={m.audience_group} onChange={(e) => set("audience_group", e.target.value)}>
                <option value="">{t("— choose —")}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name} — {tr({ n: g.level_name, n_ar: g.level_name_ar }, "n")}</option>)}
              </select>
            </div>
          )}
          {target !== "people" && (
            <div className="field">
              <label htmlFor="c-role">{t("Who")}</label>
              <select id="c-role" value={m.audience_role} onChange={(e) => set("audience_role", e.target.value)}>
                {roleOpts.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
              </select>
            </div>
          )}
          {target === "people" && <div className="field full"><label>{t(can.manage ? "People" : "Students")}</label><MultiPick options={people} value={users} onChange={setUsers} /></div>}
          {m.audience_role !== "parent" && (
            <div className="field full"><Switch checked={m.include_parents} onChange={(v) => set("include_parents", v)} label={t("Also send to the students' parents")} /></div>
          )}
        </div>
        <div className="field full">
          <label>{t("Quick templates")}</label>
          <div className="chips">{TEMPLATES.map((x) => <button type="button" key={x[0]} className="chip-btn" onClick={() => useTpl(x)}>{t(x[0])}</button>)}</div>
        </div>
        <div className="form-grid">
          <div className="field full"><label htmlFor="c-title">{t("Title")}<span className="req">*</span></label>
            <input id="c-title" required maxLength={160} value={m.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="field full"><label htmlFor="c-body">{t("Message")}<span className="req">*</span></label>
            <textarea id="c-body" required rows={5} value={m.body} onChange={(e) => set("body", e.target.value)} /></div>
          <div className="field full"><label>{t("Also send by")}</label><ChannelPicker value={channels} onChange={setChannels} ready={ready} /></div>
        </div>
        {err && <p className="alert error">{err}</p>}
        <div className="modal-actions">
          <button className="btn" disabled={busy}><Send size={16} />{busy ? t("Sending…") : t("Send")}</button>
          <button type="button" className="btn ghost" onClick={onClose}>{t("Cancel")}</button>
          {count && <span className="reach"><Users size={16} />{t("Recipients")}: {count.total}
            {Object.entries(count.by_role).map(([r, n]) => <small key={r}>{t(r + "s")}: {n}</small>)}</span>}
        </div>
      </form>
    </Modal>
  );
}

/** Teacher/admin: remind the students of one session right now (+ optional note). */
export function RemindModal({ session, onClose, onDone }) {
  const { t, tr } = useT(); const { toast } = useToast(); const ready = useChannels();
  const [note, setNote] = useState(""); const [parents, setParents] = useState(true);
  const [channels, setChannels] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { if (ready) setChannels(Object.keys(ready).filter((k) => ready[k])); }, [ready]);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api.post(`/sessions/${session.id}/remind/`, { note, channels, include_parents: parents });
      toast(`${t("Reminder sent. Recipients")}: ${r.data.notified}`); onDone?.(); onClose();
    } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  return (
    <Modal title={t("Remind the students")} onClose={onClose}>
      <form onSubmit={go}>
        <p className="lead-line"><BellRing size={17} /> <b>{tr(session, "module_name")}</b> — {session.group_name}</p>
        <p className="muted small">{t("Every student subscribed to this session receives the date, time and topic. Add a note if needed.")}</p>
        <div className="form-grid">
          <div className="field full"><label htmlFor="r-note">{t("Note (optional)")}</label>
            <textarea id="r-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. Bring your calculator")} /></div>
          <div className="field full"><Switch checked={parents} onChange={setParents} label={t("Also send to the students' parents")} /></div>
          <div className="field full"><label>{t("Also send by")}</label><ChannelPicker value={channels} onChange={setChannels} ready={ready} /></div>
        </div>
        {err && <p className="alert error">{err}</p>}
        <div className="modal-actions">
          <button className="btn" disabled={busy}><BellRing size={16} />{busy ? t("Sending…") : t("Send reminder")}</button>
          <button type="button" className="btn ghost" onClick={onClose}>{t("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Cancel a session; everyone concerned is notified. */
export function CancelModal({ session, onClose, onDone }) {
  const { t, tr } = useT(); const { toast } = useToast(); const ready = useChannels();
  const [reason, setReason] = useState(""); const [channels, setChannels] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { if (ready) setChannels(Object.keys(ready).filter((k) => ready[k])); }, [ready]);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api.post(`/sessions/${session.id}/cancel/`, { reason, channels });
      toast(`${t("Class cancelled.")} ${t("People notified")}: ${r.data.notified}`); onDone?.(); onClose();
    } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  const reasons = ["Teacher absent", "Bad weather", "Power cut", "Exam period"];
  return (
    <Modal title={t("Cancel this class")} onClose={onClose}>
      <form onSubmit={go}>
        <p className="lead-line"><b>{tr(session, "module_name")}</b> — {session.group_name}</p>
        <div className="form-grid">
          <div className="field full"><label htmlFor="cx-r">{t("Reason")}<span className="req">*</span></label>
            <input id="cx-r" required value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="chips" style={{ marginTop: 8 }}>{reasons.map((r) => <button type="button" key={r} className="chip-btn" onClick={() => setReason(t(r))}>{t(r)}</button>)}</div></div>
          <div className="field full"><label>{t("Notify by")}</label><ChannelPicker value={channels} onChange={setChannels} ready={ready} /></div>
        </div>
        <p className="muted small">{t("Students, their parents and the teacher are notified.")}</p>
        {err && <p className="alert error">{err}</p>}
        <div className="modal-actions">
          <button className="btn danger" disabled={busy}>{busy ? t("Sending…") : t("Cancel the class and notify")}</button>
          <button type="button" className="btn ghost" onClick={onClose}>{t("Back")}</button>
        </div>
      </form>
    </Modal>
  );
}
