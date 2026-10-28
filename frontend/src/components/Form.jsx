import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import api, { errText } from "../api";
import { useT } from "../i18n.jsx";
import { Modal, Switch } from "./ui.jsx";

export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Checkbox list with search: much easier than Ctrl-click multi-selects, works on phones. */
export function MultiPick({ options, value = [], onChange, height = 200 }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const shown = options.filter((o) => String(o.label).toLowerCase().includes(q.toLowerCase()));
  const set = new Set(value.map(String));
  const toggle = (v) => onChange(set.has(String(v)) ? value.filter((x) => String(x) !== String(v)) : [...value, v]);
  return (
    <div className="multipick">
      <div className="mp-head">
        <span className="search-in"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search…")} /></span>
        <button type="button" className="link" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.value)])])}>{t("Select all")}</button>
        {value.length > 0 && <button type="button" className="link" onClick={() => onChange([])}>{t("Clear")}</button>}
        <span className="count">{value.length}</span>
      </div>
      <div className="mp-list" style={{ maxHeight: height }}>
        {shown.map((o) => (
          <label key={o.value} className={set.has(String(o.value)) ? "on" : ""}>
            <input type="checkbox" checked={set.has(String(o.value))} onChange={() => toggle(o.value)} />
            <span>{o.label}</span>{o.hint && <small>{o.hint}</small>}
          </label>
        ))}
        {!shown.length && <p className="muted pad">{t("Nothing found.")}</p>}
      </div>
    </div>
  );
}

/** Generic form. fields: {name,label,type,required,options|source:{endpoint,value,label},full,help,show(v)} */
export function FormFields({ fields, v, set, opts }) {
  const { t } = useT();
  return (
    <div className="form-grid">
      {fields.filter((f) => !f.show || f.show(v)).map((f) => {
        const options = f.options || opts[f.name] || [];
        const val = v[f.name] ?? (f.type === "multi" ? [] : "");
        const id = `f-${f.name}`;
        if (f.type === "checkbox")
          return <div className="field full" key={f.name}><Switch checked={v[f.name]} onChange={(x) => set(f.name, x)} label={t(f.label)} /></div>;
        return (
          <div className={`field ${f.full || ["multi", "textarea"].includes(f.type) ? "full" : ""}`} key={f.name}>
            <label htmlFor={id}>{t(f.label)}{f.required && <span className="req">*</span>}</label>
            {f.type === "select" ? (
              <select id={id} required={f.required} value={val ?? ""} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">{t("— choose —")}</option>
                {options.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
              </select>
            ) : f.type === "multi" ? (
              <MultiPick options={options} value={val} onChange={(x) => set(f.name, x)} />
            ) : f.type === "textarea" ? (
              <textarea id={id} required={f.required} value={val} onChange={(e) => set(f.name, e.target.value)} rows={4} />
            ) : (
              <input id={id} type={f.type || "text"} required={f.required && !(f.type === "password")} step={f.type === "number" ? "any" : undefined}
                min={f.min} dir={["email", "tel", "password", "number"].includes(f.type) || f.ltr ? "ltr" : undefined}
                value={val} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder ? t(f.placeholder) : undefined}
                autoComplete={f.type === "password" ? "new-password" : "off"} />
            )}
            {f.help && <small className="help">{t(f.help)}</small>}
          </div>
        );
      })}
    </div>
  );
}

export function useOptions(fields) {
  const { tr } = useT();
  const [opts, setOpts] = useState({});
  const key = fields.filter((f) => f.source).map((f) => f.source.endpoint).join("|");
  useEffect(() => {
    fields.filter((f) => f.source).forEach((f) =>
      api.get(f.source.endpoint).then((r) => setOpts((o) => ({
        ...o, [f.name]: r.data.map((x) => ({ value: x[f.source.value || "id"], label: f.source.label(x, tr), hint: f.source.hint?.(x, tr) })),
      }))).catch(() => {}));
  }, [key]);
  return opts;
}

export default function Form({ title, fields, initial = {}, onSubmit, onClose, submitLabel = "Save", wide }) {
  const { t } = useT();
  const [v, setV] = useState(() => {
    const o = { ...initial };
    fields.forEach((f) => { if (f.type === "datetime-local") o[f.name] = toLocalInput(o[f.name]); });
    return o;
  });
  const opts = useOptions(fields);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const body = { ...v };
    fields.forEach((f) => {
      if (f.type === "number" && body[f.name] === "") body[f.name] = f.required ? body[f.name] : null;
      if (["date", "select", "datetime-local"].includes(f.type) && body[f.name] === "" && !f.required) body[f.name] = null;
      if (f.type === "password" && !body[f.name]) delete body[f.name];
      if (f.type === "datetime-local" && body[f.name]) body[f.name] = new Date(body[f.name]).toISOString();
    });
    try { await onSubmit(body); } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  return (
    <Modal title={t(title)} onClose={onClose} wide={wide ?? fields.length > 6}>
      <form onSubmit={submit}>
        <FormFields fields={fields} v={v} set={set} opts={opts} />
        {err && <p className="alert error">{err}</p>}
        <div className="modal-actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? t("Saving…") : t(submitLabel)}</button>
          <button type="button" className="btn ghost" onClick={onClose}>{t("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}
