import { useEffect, useState } from "react";
import { AlertTriangle, Bell, BellRing, Ban, CheckCheck, CreditCard, Megaphone, UserX } from "lucide-react";
import api from "../api";
import { useT } from "../i18n.jsx";
import { ChannelTags, Empty, PageHead, Spinner, useFmt } from "../components/ui.jsx";

const ICON = { reminder: BellRing, cancel: Ban, closure: AlertTriangle, payment: CreditCard, absence: UserX, message: Megaphone, announcement: Megaphone };

export default function Notifications() {
  const { t } = useT(); const f = useFmt();
  const [rows, setRows] = useState(null); const [only, setOnly] = useState(false);
  const load = () => api.get("/notifications/", { params: { unread: only ? 1 : undefined } }).then((r) => setRows(r.data));
  useEffect(() => { load(); }, [only]);
  const readAll = async () => { await api.post("/notifications/read_all/"); load(); };
  const readOne = async (n) => { if (n.read) return; await api.post(`/notifications/${n.id}/read/`); setRows((r) => r.map((x) => (x.id === n.id ? { ...x, read: true } : x))); };
  return (<div>
    <PageHead title={t("Notifications")}><button className="btn ghost" onClick={readAll}><CheckCheck size={17} />{t("Mark all read")}</button></PageHead>
    <div className="seg mb"><button className={!only ? "on" : ""} onClick={() => setOnly(false)}>{t("All")}</button><button className={only ? "on" : ""} onClick={() => setOnly(true)}>{t("Unread")}</button></div>
    {!rows ? <Spinner /> : rows.length ? <div className="notes">{rows.map((n) => {
      const I = ICON[n.kind] || Bell;
      return (
        <article className={`note ${n.read ? "" : "unread"} k-${n.kind}`} key={n.id} onClick={() => readOne(n)}>
          <span className="note-ic"><I size={18} /></span>
          <div><div className="note-head"><b>{n.title}</b><small className="muted">{f.when(n.created_at)}</small></div>
            <p>{n.body}</p><ChannelTags ok={n.channels_ok} failed={n.channels_failed} pending={n.channels_pending} /></div>
        </article>);
    })}</div> : <div className="panel"><Empty icon={Bell} title={t("No notifications.")} /></div>}
  </div>);
}
