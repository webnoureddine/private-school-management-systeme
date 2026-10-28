import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, KeyRound, Send } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import Crud from "../components/Crud.jsx";
import { Modal, useToast } from "../components/ui.jsx";

const LANGS = [{ value: "ar", label: "العربية" }, { value: "fr", label: "Français" }, { value: "en", label: "English" }];
const fullName = (r) => `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.username;
const groupSrc = { endpoint: "/groups/", label: (x, tr) => `${x.name} — ${tr({ n: x.level_name, n_ar: x.level_name_ar }, "n")}` };

const userFields = (extra = []) => [
  { name: "first_name", label: "First name", required: true }, { name: "last_name", label: "Last name", required: true },
  { name: "username", label: "Username", required: true, ltr: true, help: "Used to sign in. Letters and numbers, no spaces." },
  { name: "password", label: "Password", type: "password", help: "Leave empty to keep the current password (new account: a random one is created)." },
  { name: "phone", label: "Phone (WhatsApp)", type: "tel", placeholder: "0555 12 34 56" }, { name: "email", label: "Email", type: "email" },
  ...extra,
  { name: "language", label: "Language of notifications", type: "select", options: LANGS },
  { name: "is_active", label: "Account active", type: "checkbox" },
  { name: "notify_email", label: "Send notifications by email", type: "checkbox" },
  { name: "notify_whatsapp", label: "Send notifications by WhatsApp", type: "checkbox" },
  { name: "notify_telegram", label: "Send notifications by Telegram", type: "checkbox" },
  { name: "send_welcome", label: "Send the login details and the Telegram link now (WhatsApp / email)", type: "checkbox", show: (v) => !v.id },
];
const D = (role) => ({ role, language: "ar", notify_email: true, notify_whatsapp: true, notify_telegram: true, is_active: true, send_welcome: true });
const contactCol = { key: "phone", label: "Contact", render: (r, tr, t) => <span className="contact"><span dir="ltr">{r.phone || "—"}</span>
  {r.telegram_linked && <span className="pill ok sm">Telegram</span>}</span> };
const nameCol = { key: "first_name", label: "Name", render: (r, tr, t) => <span className="nowrap"><b>{fullName(r)}</b> {!r.is_active && <span className="pill bad sm">{t("inactive")}</span>}<br /><small className="muted" dir="ltr">{r.username}</small></span> };

/** Re-send login details (new password) + Telegram link by WhatsApp/email. */
function Invite({ user }) {
  const { t } = useT(); const { toast, confirm } = useToast(); const [pw, setPw] = useState(null);
  const go = async () => {
    if (!(await confirm({ title: t("Send the login details and the Telegram link?"),
      body: `${fullName(user)} — ${t("A new password is created and sent by WhatsApp / email.")}`, ok: t("Send") }))) return;
    try {
      const r = await api.post(`/users/${user.id}/welcome/`);
      if (r.data.channels.length) toast(`${t("Sent by")}: ${r.data.channels.map((c) => t(c === "email" ? "Email" : c === "whatsapp" ? "WhatsApp" : "Telegram")).join("، ")}`);
      else setPw(r.data);
    } catch (e) { toast(errText(e, t), "error"); }
  };
  return (<>
    <button className="icon-btn" title={t("Send login details")} aria-label={t("Send login details")} onClick={go}><Send size={16} /></button>
    {pw && <Modal title={t("Nothing could be sent")} onClose={() => setPw(null)} small>
      <ul className="why">
        <li><b>WhatsApp:</b> {t(pw.why?.whatsapp === "no_phone" ? "no phone number in this person's file." : "not connected yet (Settings → WhatsApp).")}</li>
        <li><b>{t("Email")}:</b> {t(pw.why?.email === "no_email" ? "no email address in this person's file." : "the school's email server is not configured yet (.env file).")}</li>
      </ul>
      <p>{t("Meanwhile, give these details by hand:")}</p>
      <div className="credentials" dir="ltr"><span>{user.username}</span><b>{pw.password}</b></div>
    </Modal>}
  </>);
}

function ResetPw({ user }) {
  const { t } = useT(); const { toast, confirm } = useToast(); const [pw, setPw] = useState(null);
  const go = async () => {
    if (!(await confirm({ title: t("Reset the password?"), body: `${fullName(user)} — ${t("a new password will be generated.")}`, ok: t("Reset") }))) return;
    try { const r = await api.post(`/users/${user.id}/reset-password/`, {}); setPw(r.data.password); } catch (e) { toast(errText(e, t), "error"); }
  };
  return (<>
    <button className="icon-btn" title={t("Reset password")} aria-label={t("Reset password")} onClick={go}><KeyRound size={16} /></button>
    {pw && <Modal title={t("New password")} onClose={() => setPw(null)} small>
      <p>{t("Give these sign-in details to")} <b>{fullName(user)}</b>:</p>
      <div className="credentials" dir="ltr"><span>{user.username}</span><b>{pw}</b></div>
      <div className="modal-actions"><button className="btn" onClick={() => { navigator.clipboard?.writeText(`${user.username} / ${pw}`); toast(t("Copied")); }}>{t("Copy")}</button></div>
    </Modal>}
  </>);
}

export const Students = () => {
  const { t } = useT();
  return <Crud title="Students" sub="Put each student in a class, then subscribe him to modules from his file." endpoint="/users/" params={{ role: "student" }}
    fields={userFields([{ name: "group_ids", label: "Class", type: "multi", source: groupSrc }])} defaults={{ ...D("student"), group_ids: [] }}
    columns={[nameCol, { key: "groups_info", label: "Class", render: (r) => r.groups_info.join("، ") || "—" },
      { key: "modules_info", label: "Subscribed modules", render: (r, tr) => <div className="chips">{r.modules_info.length ? <>{r.modules_info.slice(0, 4).map((m) => <span className="pill" key={m.name}>{tr(m, "name")}</span>)}
        {r.modules_info.length > 4 && <span className="pill" title={r.modules_info.slice(4).map((m) => tr(m, "name")).join("، ")}>+{r.modules_info.length - 4}</span>}</> : <span className="muted">—</span>}</div> },
      contactCol]}
    rowActions={(r) => <><Link className="icon-btn" title={t("Student file")} aria-label={t("Student file")} to={`/students/${r.id}`}><FileText size={16} /></Link><Invite user={r} /><ResetPw user={r} /></>}
    deleteText="All grades, attendance and payments of this student are deleted too." />;
};

export const Teachers = () => <Crud title="Teachers" sub="Assign teachers to classes in Teaching assignments." endpoint="/users/" params={{ role: "teacher" }}
  columns={[nameCol, contactCol, { key: "email", label: "Email", render: (r) => <span dir="ltr">{r.email || "—"}</span> }]}
  fields={userFields()} defaults={D("teacher")} rowActions={(r) => <><Invite user={r} /><ResetPw user={r} /></>}
  deleteText="A teacher who already has classes is deactivated instead of deleted, to keep the history." />;

export function Staff() {
  const { can } = useAuth();
  const roles = [{ value: "parent", label: "Parent" }, { value: "staff", label: "Secretary / staff" }, ...(can.director ? [{ value: "admin", label: "Director (full access)" }] : [])];
  return <Crud title="Parents & staff" sub="Link each parent to his children: he receives their reminders, absences and payments." endpoint="/users/" params={{ role: "parent,staff,admin" }}
    columns={[nameCol, { key: "role", label: "Role", render: (r, tr, t) => <span className="pill">{t(r.is_superuser ? "admin" : r.role)}</span> },
      { key: "children_info", label: "Children", render: (r) => r.children_info.join("، ") || "—" }, contactCol]}
    fields={userFields([{ name: "role", label: "Role", type: "select", required: true, options: roles },
      { name: "children", label: "Children (for parents)", type: "multi", show: (v) => v.role === "parent", source: { endpoint: "/students/", label: (x) => x.name } }])}
    defaults={{ ...D("parent"), children: [] }} rowActions={(r) => <><Invite user={r} /><ResetPw user={r} /></>} />;
}

const CYCLES = [{ value: "primary", label: "primary" }, { value: "middle", label: "middle" }, { value: "secondary", label: "secondary" }];
export const Levels = () => <Crud title="Levels" sub="School years (1AP … 3AS). The Algerian levels are created automatically." endpoint="/levels/"
  columns={[{ key: "name_ar", label: "Name", render: (r, tr) => <b>{tr(r, "name")}</b> }, { key: "name", label: "Code" }, { key: "cycle", label: "Cycle", render: (r, tr, t) => <span className="pill">{t(r.cycle)}</span> }]}
  fields={[{ name: "name", label: "Code", required: true }, { name: "name_ar", label: "Arabic name" },
    { name: "cycle", label: "Cycle", type: "select", required: true, options: CYCLES }, { name: "order", label: "Order", type: "number" }]}
  defaults={{ cycle: "middle", order: 0 }} deleteText="A level used by classes or modules cannot be deleted." />;

export const Rooms = () => <Crud title="Rooms" endpoint="/rooms/" columns={[{ key: "name", label: "Name" }, { key: "capacity", label: "Capacity" }]}
  fields={[{ name: "name", label: "Name", required: true }, { name: "capacity", label: "Capacity", type: "number" }]} defaults={{ capacity: 30 }} />;

const year = () => { const d = new Date(); const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${y + 1}`; };
export const Groups = () => <Crud title="Classes" sub="A class = a group of students of the same level." endpoint="/groups/"
  columns={[{ key: "name", label: "Name", render: (r) => <b>{r.name}</b> }, { key: "level_name", label: "Level", render: (r, tr) => tr({ n: r.level_name, n_ar: r.level_name_ar }, "n") },
    { key: "year", label: "School year" }, { key: "student_count", label: "Students" }]}
  fields={[{ name: "name", label: "Name", required: true, placeholder: "3AM — group A" }, { name: "year", label: "School year", required: true },
    { name: "level", label: "Level", type: "select", required: true, source: { endpoint: "/levels/", label: (x, tr) => tr(x, "name") } },
    { name: "students", label: "Students", type: "multi", source: { endpoint: "/students/", label: (x) => x.name } }]}
  defaults={{ year: year(), students: [] }} />;

export const Modules = () => <Crud title="Modules" sub="Subjects taught at each level." endpoint="/modules/"
  columns={[{ key: "name", label: "Name", render: (r, tr) => <b>{tr(r, "name")}</b> }, { key: "level_name", label: "Level", render: (r, tr) => tr({ n: r.level_name, n_ar: r.level_name_ar }, "n") },
    { key: "teacher_names", label: "Teachers", render: (r) => r.teacher_names.join("، ") || "—" }, { key: "hours_per_week", label: "Hours / week" }, { key: "coefficient", label: "Coefficient" }]}
  fields={[{ name: "name_ar", label: "Arabic name", required: true }, { name: "name", label: "French name", required: true },
    { name: "level", label: "Level", type: "select", required: true, source: { endpoint: "/levels/", label: (x, tr) => tr(x, "name") } },
    { name: "hours_per_week", label: "Hours per week", type: "number" }, { name: "session_minutes", label: "Minutes per session", type: "number" }, { name: "coefficient", label: "Coefficient", type: "number" }]}
  defaults={{ hours_per_week: 2, session_minutes: 60, coefficient: 1 }} />;

export const Teachings = () => <Crud title="Teaching assignments" sub="Who teaches which module to which class. Teachers then see these students." endpoint="/teachings/"
  columns={[{ key: "group_name", label: "Class", render: (r) => <b>{r.group_name}</b> }, { key: "level_name", label: "Level", render: (r, tr) => tr({ n: r.level_name, n_ar: r.level_name_ar }, "n") },
    { key: "module_name", label: "Module", render: (r, tr) => tr(r, "module_name") }, { key: "teacher_name", label: "Teacher" }]}
  fields={[{ name: "group", label: "Class", type: "select", required: true, source: groupSrc },
    { name: "module", label: "Module", type: "select", required: true, source: { endpoint: "/modules/", label: (x, tr) => `${tr(x, "name")} — ${tr({ n: x.level_name, n_ar: x.level_name_ar }, "n")}` } },
    { name: "teacher", label: "Teacher", type: "select", required: true, source: { endpoint: "/users/?role=teacher", label: fullName } }]} />;
