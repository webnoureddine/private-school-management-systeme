import { useState } from "react";
import { Eye, EyeOff, GraduationCap } from "lucide-react";
import { useAuth } from "../auth.jsx";
import { errText } from "../api";
import { LangSelect, useT } from "../i18n.jsx";

export default function Login() {
  const { login, school } = useAuth(); const { t } = useT();
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [show, setShow] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await login(u, p); }
    catch (x) { setErr(x.response?.status === 401 ? t("Wrong username or password.") : x.response?.status === 429 ? t("Too many attempts. Wait a minute and try again.") : errText(x, t)); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <section className="login-board" aria-hidden="true">
        <div className="board-inner">
          {school.logo_url ? <img src={school.logo_url} alt="" className="board-logo" /> : <GraduationCap size={44} strokeWidth={1.5} />}
          <h2>{school.name || t("School platform")}</h2>
          <ul>
            <li>{t("Timetable, attendance and grades in one place")}</li>
            <li>{t("Reminders to students and parents by app, email, WhatsApp and Telegram")}</li>
            <li>{t("Fees and subscriptions followed month by month")}</li>
          </ul>
          {(school.phone || school.address) && <p className="board-contact">{school.phone}{school.phone && school.address && " — "}{school.address}</p>}
        </div>
      </section>
      <section className="login-form">
        <div className="login-lang"><LangSelect /></div>
        <form onSubmit={go}>
          <div className="login-brand">
            {school.logo_url ? <img src={school.logo_url} alt="" /> : <span className="brand-mark"><GraduationCap size={22} /></span>}
            <b>{school.name || t("School platform")}</b>
          </div>
          <h1>{t("Sign in")}</h1>
          <p className="sub">{t("Use the username and password given by the school.")}</p>
          <div className="field"><label htmlFor="u">{t("Username")}</label>
            <input id="u" dir="ltr" autoComplete="username" autoFocus value={u} onChange={(e) => setU(e.target.value)} required /></div>
          <div className="field"><label htmlFor="p">{t("Password")}</label>
            <span className="pw"><input id="p" dir="ltr" type={show ? "text" : "password"} autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required />
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={t("Show password")}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></div>
          {err && <p className="alert error">{err}</p>}
          <button className="btn block" disabled={busy}>{busy ? t("Signing in…") : t("Sign in")}</button>
          <p className="muted small center-t">{t("Forgot your password? Ask the school administration to reset it.")}</p>
        </form>
      </section>
    </div>
  );
}
