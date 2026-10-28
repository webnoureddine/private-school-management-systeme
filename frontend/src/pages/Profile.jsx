import { useEffect, useRef, useState } from "react";
import { KeyRound, Save, Send, Unlink } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import { FormFields } from "../components/Form.jsx";
import { PageHead, Switch, useToast } from "../components/ui.jsx";

export default function Profile() {
  const { user, setUser, role } = useAuth(); const { t, setLang } = useT(); const { toast } = useToast();
  const [v, setV] = useState({ ...user }); const [tg, setTg] = useState(null);
  const [pw, setPw] = useState({ old_password: "", new_password: "", confirm: "" });
  useEffect(() => { api.get("/users/me/telegram/").then((r) => setTg(r.data)).catch(() => {}); }, []);
  const set = (k, x) => setV((s) => ({ ...s, [k]: x }));
  const save = async (keys) => {
    try { const r = await api.patch("/users/me/", Object.fromEntries(keys.map((k) => [k, v[k]]))); setUser(r.data); setV(r.data); toast(t("Saved")); if (keys.includes("language")) setLang(r.data.language); }
    catch (e) { toast(errText(e, t), "error"); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) return toast(t("The two passwords are different."), "error");
    try { await api.post("/users/me/password/", pw); setPw({ old_password: "", new_password: "", confirm: "" }); toast(t("Password changed")); }
    catch (x) { toast(x.response?.data?.old_password ? t("Current password is wrong.") : x.response?.data?.new_password ? t("At least 8 characters.") : errText(x, t), "error"); }
  };
  const unlink = async () => { await api.delete("/users/me/telegram/"); setTg({ ...tg, linked: false }); set("notify_telegram", false); toast(t("Telegram disconnected")); };
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const linked = async () => {
    clearInterval(timer.current);
    const r = await api.get("/users/me/"); setUser(r.data); setV(r.data); setTg((x) => ({ ...x, linked: true }));
  };
  const check = async (quiet) => {
    try {
      const r = await api.post("/users/me/telegram/");
      if (r.data.linked) { await linked(); toast(t("Telegram connected. You will receive notifications there.")); return true; }
      if (!quiet) toast(r.data.status === "webhook" ? t("Telegram sends messages to the website address. Open the platform from its public HTTPS address and try again.")
        : r.data.status === "error: network" ? t("Cannot reach Telegram. Check the internet connection of the server.")
        : r.data.status?.startsWith?.("error") ? `${t("Telegram refused the bot token. Check it in Settings.")} (${r.data.status.slice(7)})`
        : t("Telegram has not received your Start yet. Press «Connect Telegram», then Start in the bot, and try again."), "error");
    } catch (e) { if (!quiet) toast(errText(e, t), "error"); }
    return false;
  };
  const openLink = () => { // after opening the bot, check automatically every 4 s for 2 minutes
    clearInterval(timer.current); let n = 0;
    timer.current = setInterval(async () => { n += 1; if ((await check(true)) || n >= 30) clearInterval(timer.current); }, 4000);
  };
  const INFO = [{ name: "first_name", label: "First name" }, { name: "last_name", label: "Last name" },
    { name: "phone", label: "Phone (WhatsApp)", type: "tel" }, { name: "email", label: "Email", type: "email" },
    { name: "language", label: "Language", type: "select", options: [{ value: "ar", label: "العربية" }, { value: "fr", label: "Français" }, { value: "en", label: "English" }] }];
  return (<div className="settings">
    <PageHead title={t("My profile")} sub={`${user.username} — ${t(role)}`} />
    <section className="panel form-panel"><div className="panel-head"><h2>{t("My information")}</h2></div>
      <FormFields fields={INFO} v={v} set={set} opts={{}} />
      <div className="form-actions"><button className="btn" onClick={() => save(INFO.map((f) => f.name))}><Save size={16} />{t("Save")}</button></div></section>

    <section className="panel form-panel"><div className="panel-head"><h2>{t("How do you want to be notified?")}</h2></div>
      <p className="muted small">{t("You always see notifications in the app. Choose extra channels:")}</p>
      <div className="switch-list">
        <Switch checked={v.notify_email} onChange={(x) => set("notify_email", x)} label={`${t("Email")}${v.email ? "" : ` (${t("add your email above")})`}`} />
        <Switch checked={v.notify_whatsapp} onChange={(x) => set("notify_whatsapp", x)} label={`WhatsApp${v.phone ? "" : ` (${t("add your phone above")})`}`} />
        <Switch checked={v.notify_telegram} disabled={!tg?.linked} onChange={(x) => set("notify_telegram", x)} label={`Telegram${tg?.linked ? "" : ` (${t("connect it below")})`}`} />
      </div>
      <div className="form-actions"><button className="btn" onClick={() => save(["notify_email", "notify_whatsapp", "notify_telegram"])}><Save size={16} />{t("Save")}</button></div>
      <div className="tg-box">
        <Send size={20} />
        {tg?.linked ? <><span>{t("Your Telegram is connected.")}</span><button className="btn ghost sm" onClick={unlink}><Unlink size={15} />{t("Disconnect")}</button></>
          : tg?.link ? <><span>{t("Open the school bot in Telegram and press Start. That's all.")}</span>
            <a className="btn sm" href={tg.link} target="_blank" rel="noreferrer" onClick={openLink}>{t("Connect Telegram")}</a>
            <button className="btn ghost sm" onClick={() => check(false)}>{t("I pressed Start")}</button></>
          : <span className="muted">{t("Telegram is not set up by the school yet.")}</span>}
      </div>
    </section>

    <section className="panel form-panel"><div className="panel-head"><h2><KeyRound size={18} /> {t("Change password")}</h2></div>
      <form onSubmit={changePw}><div className="form-grid">
        <div className="field full"><label>{t("Current password")}</label><input type="password" dir="ltr" required autoComplete="current-password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} /></div>
        <div className="field"><label>{t("New password")}</label><input type="password" dir="ltr" required minLength={8} autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></div>
        <div className="field"><label>{t("Repeat the new password")}</label><input type="password" dir="ltr" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
      </div><div className="form-actions"><button className="btn">{t("Change password")}</button></div></form>
    </section>
  </div>);
}
