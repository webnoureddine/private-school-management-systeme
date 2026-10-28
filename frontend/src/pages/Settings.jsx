import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { BellRing, CheckCircle2, Circle, Mail, MessageCircle, Save, Send } from "lucide-react";
import api, { errText } from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import { FormFields } from "../components/Form.jsx";
import { PageHead, Spinner, Switch, useToast } from "../components/ui.jsx";

const PROVIDERS = [{ value: "", label: "Not used" }, { value: "ultramsg", label: "UltraMsg (simple, uses a normal WhatsApp number)" },
  { value: "meta", label: "WhatsApp Cloud API (Meta, official)" }, { value: "twilio", label: "Twilio" }];
const WA_HELP = {
  ultramsg: ["Instance ID", "Token", "Create an instance on ultramsg.com, scan the QR code with the school phone, then copy the instance ID and token."],
  meta: ["Phone number ID", "Permanent access token", "Meta Business > WhatsApp > API setup. Messages to people who did not write first need an approved template with one variable {{1}}."],
  twilio: ["Account SID", "Auth token", "Twilio console > Messaging > WhatsApp senders."],
};

function Status({ ok }) {
  const { t } = useT();
  return ok ? <span className="pill ok"><CheckCircle2 size={13} />{t("Connected")}</span> : <span className="pill"><Circle size={13} />{t("Not connected")}</span>;
}

export default function Settings() {
  const { t } = useT(); const { toast } = useToast(); const { loadSchool } = useAuth();
  const [s, setS] = useState(null); const [busy, setBusy] = useState(""); const [testTo, setTestTo] = useState({ phone: "", email: "" });
  const load = () => api.get("/settings/").then((r) => setS(r.data));
  useEffect(() => { load(); }, []);
  if (!s) return <Spinner />;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async (keys, label = "Saved") => {
    setBusy("save");
    try { const body = Object.fromEntries(keys.map((k) => [k, s[k]])); const r = await api.patch("/settings/", body); setS(r.data); loadSchool(); toast(t(label)); }
    catch (e) { toast(errText(e, t), "error"); } finally { setBusy(""); }
  };
  const test = async (channel) => {
    setBusy(channel);
    try { await api.post("/settings/test/", { channel, ...testTo }); toast(t("Test message sent. Check your phone or inbox.")); }
    catch (e) { toast(`${t("Test failed")}: ${e.response?.data?.error || errText(e, t)}`, "error"); } finally { setBusy(""); }
  };
  const tgSetup = async () => {
    setBusy("tg");
    try {
      await api.patch("/settings/", { telegram_bot_token: s.telegram_bot_token });
      const r = await api.post("/settings/telegram/", {});
      toast(r.data.webhook ? `${t("Telegram bot connected")}: @${r.data.bot}` : `@${r.data.bot} — ${t("Webhook not set (needs HTTPS). Run the scheduler to link users.")}`, r.data.webhook ? "ok" : "error");
      load();
    } catch (e) { toast(errText(e, t), "error"); } finally { setBusy(""); }
  };
  const runNow = async () => { setBusy("run"); try { const r = await api.post("/cron/daily/"); toast(`${t("Reminders sent")}: ${r.data.reminders} — ${t("Payment reminders")}: ${r.data.payments}`); } finally { setBusy(""); } };
  const SCHOOL = [{ name: "name", label: "School name", required: true, full: true }, { name: "phone", label: "Phone", type: "tel" }, { name: "email", label: "Email", type: "email" },
    { name: "address", label: "Address", full: true }, { name: "logo_url", label: "Logo URL (optional)", ltr: true, full: true },
    { name: "currency", label: "Currency" }, { name: "country_code", label: "Country phone code", ltr: true, help: "213 Algeria, 212 Morocco, 216 Tunisia" }];
  const AUTO = [{ name: "reminder_hour", label: "Send tomorrow's reminders at (hour)", type: "number", min: 0, help: "0–23. Example: 18 = 6 pm." },
    { name: "payment_reminder_days", label: "Remind payments this many days before the due date", type: "number", min: 0 }];
  const wa = WA_HELP[s.whatsapp_provider];
  const WA = s.whatsapp_provider ? [
    { name: "whatsapp_phone_id", label: wa[0], ltr: true }, { name: "whatsapp_token", label: wa[1], ltr: true },
    ...(s.whatsapp_provider === "twilio" ? [{ name: "whatsapp_from", label: "Sender number", ltr: true, placeholder: "+14155238886" }] : []),
    ...(s.whatsapp_provider === "meta" ? [{ name: "whatsapp_template", label: "Template name", ltr: true }, { name: "whatsapp_template_lang", label: "Template language", ltr: true }] : []),
  ] : [];
  const opts = {};
  return (<div className="settings">
    <PageHead title={t("Settings")} sub={t("School identity and the channels used to reach students and parents.")} />

    <section className="panel form-panel">
      <div className="panel-head"><h2>{t("School")}</h2></div>
      <FormFields fields={SCHOOL} v={s} set={set} opts={opts} />
      <div className="form-actions"><button className="btn" disabled={busy === "save"} onClick={() => save(SCHOOL.map((f) => f.name))}><Save size={16} />{t("Save")}</button></div>
    </section>

    <section className="panel form-panel">
      <div className="panel-head"><h2><BellRing size={18} /> {t("Automatic reminders")}</h2></div>
      <p className="muted small">{t("Every day at this hour, students and parents with a class tomorrow get a reminder, and teachers get the list of their classes. The scheduler must be running on the server (see the installation guide).")}</p>
      <FormFields fields={AUTO} v={s} set={set} opts={opts} />
      <div className="form-actions"><button className="btn" onClick={() => save(AUTO.map((f) => f.name))}><Save size={16} />{t("Save")}</button>
        <button className="btn ghost" disabled={busy === "run"} onClick={runNow}>{t("Send tomorrow's reminders now")}</button></div>
    </section>

    <section className="panel form-panel">
      <div className="panel-head"><h2>{t("Test messages go to")}</h2></div>
      <div className="form-grid">
        <div className="field"><label>{t("Phone (WhatsApp)")}</label><input dir="ltr" value={testTo.phone} onChange={(e) => setTestTo({ ...testTo, phone: e.target.value })} placeholder="0555 12 34 56" /></div>
        <div className="field"><label>{t("Email")}</label><input dir="ltr" type="email" value={testTo.email} onChange={(e) => setTestTo({ ...testTo, email: e.target.value })} /></div>
      </div>
      <small className="help">{t("Empty = your own profile phone and email.")}</small>
    </section>

    <div className="grid3">
      <section className="panel chan-panel">
        <div className="panel-head"><h2><Mail size={18} /> {t("Email")}</h2><Status ok={s.channels.email} /></div>
        {s.email_configured
          ? <><Switch checked={s.email_enabled} onChange={(v) => { set("email_enabled", v); api.patch("/settings/", { email_enabled: v }).then((r) => setS(r.data)); }} label={t("Send emails")} />
            <div className="form-actions"><button className="btn ghost" disabled={busy === "email"} onClick={() => test("email")}>{t("Send a test")}</button></div></>
          : <p className="muted small">{t("The email server (SMTP) is set by the technician in the server's .env file (EMAIL_HOST_USER, EMAIL_HOST_PASSWORD). A Gmail address with an app password works.")}</p>}
      </section>

      <section className="panel chan-panel">
        <div className="panel-head"><h2><MessageCircle size={18} /> WhatsApp</h2><Status ok={s.channels.whatsapp} /></div>
        <div className="form-grid one">
          <div className="field"><label>{t("Provider")}</label>
            <select value={s.whatsapp_provider} onChange={(e) => set("whatsapp_provider", e.target.value)}>{PROVIDERS.map((p) => <option key={p.value} value={p.value}>{t(p.label)}</option>)}</select></div>
        </div>
        {wa && <p className="muted small">{t(wa[2])}</p>}
        <FormFields fields={WA} v={s} set={set} opts={opts} />
        <div className="form-actions"><button className="btn" onClick={() => save(["whatsapp_provider", ...WA.map((f) => f.name)])}><Save size={16} />{t("Save")}</button>
          {s.channels.whatsapp && <button className="btn ghost" disabled={busy === "whatsapp"} onClick={() => test("whatsapp")}>{t("Send a test")}</button>}</div>
      </section>

      <section className="panel chan-panel">
        <div className="panel-head"><h2><Send size={18} /> Telegram</h2><Status ok={s.channels.telegram} /></div>
        <p className="muted small">{t("Create a bot with @BotFather in Telegram, paste its token here and press Connect. Each user then links his account in one click from his profile.")}</p>
        <div className="form-grid one">
          <div className="field"><label>{t("Bot token")}</label><input dir="ltr" value={s.telegram_bot_token} onChange={(e) => set("telegram_bot_token", e.target.value)} placeholder="123456:ABC-DEF…" /></div>
        </div>
        {s.telegram_bot_username && <TelegramInvite bot={s.telegram_bot_username} school={s.name} />}
        <div className="form-actions"><button className="btn" disabled={busy === "tg" || !s.telegram_bot_token} onClick={tgSetup}>{t("Connect")}</button>
          {s.channels.telegram && <button className="btn ghost" disabled={busy === "telegram"} onClick={() => test("telegram")}>{t("Send a test")}</button>}</div>
      </section>
    </div>
  </div>);
}

/** The school's bot link + QR code. Parents/students/teachers scan it, press Start, share their phone: done. */
function TelegramInvite({ bot, school }) {
  const { t } = useT(); const { toast } = useToast();
  const url = `https://t.me/${bot.replace(/^@/, "")}`;
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: "#2c3280" } }).then(setQr); }, [url]);
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return toast(t("Allow pop-ups to print."), "error");
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${school}</title>
      <style>body{font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;text-align:center;padding:40px;color:#18231f}
      h1{font-size:30px;margin:0 0 6px}h2{font-weight:500;color:#4a5852;margin:0 0 26px}img{width:300px;height:300px}
      ol{display:inline-block;text-align:right;font-size:19px;line-height:2;margin:22px 0}.u{direction:ltr;font-size:20px;font-weight:700}
      .fr{color:#6f7c76;font-size:15px;margin-top:20px;direction:ltr}</style></head><body>
      <h1>${school}</h1><h2>استقبلوا إشعارات المدرسة على تيليغرام</h2><img src="${qr}"><div class="u">${url}</div>
      <ol><li>امسحوا الرمز بكاميرا الهاتف (أو افتحوا الرابط)</li><li>اضغطوا <b>Start</b></li>
      <li>اضغطوا <b>«📱 مشاركة رقم هاتفي»</b></li><li>انتهى! ستصلكم مواعيد الحصص والغيابات والإعلانات</li></ol>
      <p>استعملوا نفس رقم الهاتف المسجَّل لدى المدرسة.</p>
      <p class="fr">Scannez · Start · « Partager mon numéro » — avec le numéro donné à l'école.</p>
      <script>window.onload=()=>setTimeout(()=>print(),300)</script></body></html>`);
    w.document.close();
  };
  return (
    <div className="tg-invite">
      {qr && <img src={qr} alt={t("QR code of the school bot")} />}
      <div>
        <p className="small">{t("Share this link or QR code with parents, students and teachers. They press Start, then «Share my phone number»: their account is linked automatically using the phone registered at the school.")}</p>
        <p className="small" dir="ltr"><a href={url} target="_blank" rel="noreferrer">{url}</a></p>
        <div className="chips">
          <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(url); toast(t("Copied")); }}>{t("Copy the link")}</button>
          <button className="btn ghost sm" onClick={print}>{t("Print the invitation")}</button>
        </div>
      </div>
    </div>
  );
}
