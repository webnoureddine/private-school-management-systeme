import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X, Mail, MessageCircle, Send, Bell, Inbox } from "lucide-react";
import { useT } from "../i18n.jsx";

/* ---------------------------------------------------------------- toasts + confirm */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const [ask, setAsk] = useState(null);
  const push = useCallback((text, kind = "ok") => {
    const id = Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  /** await confirm({title, body, danger, ok}) -> true/false */
  const confirm = useCallback((o) => new Promise((resolve) => setAsk({ ...o, resolve })), []);
  const close = (v) => { ask?.resolve(v); setAsk(null); };
  return (
    <ToastCtx.Provider value={{ toast: push, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => <div key={x.id} className={`toast ${x.kind}`}>{x.text}</div>)}
      </div>
      {ask && <ConfirmBox o={ask} onClose={close} />}
    </ToastCtx.Provider>
  );
}

function ConfirmBox({ o, onClose }) {
  const { t } = useT();
  return (
    <Modal title={o.title} onClose={() => onClose(false)} small>
      {o.body && <p className="confirm-body">{o.body}</p>}
      <div className="modal-actions">
        <button className={o.danger ? "btn danger" : "btn"} autoFocus onClick={() => onClose(true)}>{o.ok || t("Confirm")}</button>
        <button className="btn ghost" onClick={() => onClose(false)}>{t("Cancel")}</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- modal */
export function Modal({ title, children, onClose, small, wide }) {
  const ref = useRef();
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${small ? "small" : ""} ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="close"><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page bits */
export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Stat({ icon: Icon, value, label, tone = "", hint }) {
  return (
    <div className={`stat ${tone}`}>
      {Icon && <span className="stat-ic"><Icon size={20} /></span>}
      <div><b className="num">{value ?? "…"}</b><span>{label}</span>{hint && <small>{hint}</small>}</div>
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children }) {
  return <div className="empty"><Icon size={34} strokeWidth={1.5} /><b>{title}</b>{children && <div className="empty-sub">{children}</div>}</div>;
}

export const Spinner = () => <div className="loading"><span className="spinner" /></div>;

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className={`switch ${disabled ? "disabled" : ""}`}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />{label && <span className="switch-label">{label}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------- channels */
export const CHANNELS = [
  { key: "email", label: "Email", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "telegram", label: "Telegram", icon: Send },
];

/** In-app is always on. `ready` = {email:bool,...} from the server (null = unknown). */
export function ChannelPicker({ value, onChange, ready }) {
  const { t } = useT();
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="channels">
      <span className="chan on fixed"><Bell size={15} />{t("In the app")}</span>
      {CHANNELS.map(({ key, label, icon: I }) => {
        const off = ready && !ready[key];
        return (
          <button type="button" key={key} disabled={off} title={off ? t("Not configured yet (Settings page)") : ""}
            className={`chan ${value.includes(key) ? "on" : ""}`} onClick={() => toggle(key)} aria-pressed={value.includes(key)}>
            <I size={15} />{t(label)}
          </button>
        );
      })}
    </div>
  );
}

const CH_LABEL = { app: "In the app", email: "Email", whatsapp: "WhatsApp", telegram: "Telegram" };
export function ChannelTags({ ok = "", failed = "", pending = "" }) {
  const { t } = useT();
  const list = (s) => s.split(",").filter(Boolean);
  return (
    <span className="chan-tags">
      {list(ok).map((c) => <span key={c} className="ctag ok">{t(CH_LABEL[c] || c)}</span>)}
      {list(pending).map((c) => <span key={c} className="ctag wait">{t(CH_LABEL[c] || c)} …</span>)}
      {list(failed).map((c) => <span key={c} className="ctag bad">{t(CH_LABEL[c] || c)} ✕</span>)}
    </span>
  );
}

/* ---------------------------------------------------------------- formatting */
export function useFmt() {
  const { loc } = useT();
  return {
    time: (iso) => new Date(iso).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false }),
    date: (iso) => (iso ? new Date(iso.length === 10 ? iso + "T12:00" : iso).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" }) : "—"),
    day: (iso) => new Date(iso).toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" }),
    when: (iso) => new Date(iso).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }),
    money: (v) => Number(v || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/\u202f|\u00a0/g, " "),
  };
}

export const isoDay = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const initials = (name = "?") => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
