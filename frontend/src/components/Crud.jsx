import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import api, { errText } from "../api";
import { useT } from "../i18n.jsx";
import Form from "./Form.jsx";
import { Empty, PageHead, Spinner, useToast } from "./ui.jsx";

/** List + search + create/edit/delete for one API endpoint. */
export default function Crud({ title, sub, endpoint, columns, fields, canEdit = true, defaults = {}, params, rowActions,
  toolbar, deleteText, editFields, toForm = (r) => r, emptyText }) {
  const { t, tr } = useT(); const { toast, confirm } = useToast();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const load = () => api.get(endpoint, { params }).then((r) => setRows(r.data)).catch((e) => { setRows([]); toast(errText(e, t), "error"); });
  useEffect(() => { load(); }, [endpoint, JSON.stringify(params)]);
  const save = async (body) => {
    if (edit.id) await api.patch(`${endpoint}${edit.id}/`, body); else await api.post(endpoint, body);
    setEdit(null); toast(t("Saved")); load();
  };
  const del = async (r) => {
    if (!(await confirm({ title: t("Delete?"), body: t(deleteText || "This cannot be undone."), danger: true, ok: t("Delete") }))) return;
    try { await api.delete(`${endpoint}${r.id}/`); toast(t("Deleted")); load(); } catch (e) { toast(errText(e, t), "error"); }
  };
  const shown = useMemo(() => (rows || []).filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())), [rows, q]);
  return (
    <div>
      <PageHead title={t(title)} sub={sub && t(sub)}>
        {toolbar}
        {canEdit && <button className="btn" onClick={() => setEdit({ ...defaults })}><Plus size={17} />{t("Add")}</button>}
      </PageHead>
      <div className="panel">
        <div className="panel-tools">
          <span className="search-in"><Search size={16} /><input placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} /></span>
          {rows && <span className="muted small">{shown.length} / {rows.length}</span>}
        </div>
        {!rows ? <Spinner /> : shown.length ? (
          <div className="table-wrap"><table>
            <thead><tr>{columns.map((c) => <th key={c.key}>{t(c.label)}</th>)}{(canEdit || rowActions) && <th className="th-actions" />}</tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => <td key={c.key} data-label={t(c.label)}>{c.render ? c.render(r, tr, t) : String(r[c.key] ?? "—")}</td>)}
                {(canEdit || rowActions) && <td className="actions">{rowActions && rowActions(r, load)}
                  {canEdit && <><button className="icon-btn" title={t("Edit")} aria-label={t("Edit")} onClick={() => setEdit(toForm(r))}><Pencil size={16} /></button>
                    <button className="icon-btn danger" title={t("Delete")} aria-label={t("Delete")} onClick={() => del(r)}><Trash2 size={16} /></button></>}</td>}
              </tr>))}
            </tbody></table></div>
        ) : <Empty title={q ? t("Nothing found.") : t(emptyText || "Nothing here yet.")}>{canEdit && !q && <button className="btn ghost" onClick={() => setEdit({ ...defaults })}><Plus size={16} />{t("Add")}</button>}</Empty>}
      </div>
      {edit && <Form title={edit.id ? `${t("Edit")}: ${t(title)}` : `${t("Add")}: ${t(title)}`} fields={edit.id && editFields ? editFields : fields}
        initial={edit} onSubmit={save} onClose={() => setEdit(null)} />}
    </div>
  );
}
