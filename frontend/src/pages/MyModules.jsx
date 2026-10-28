import { useEffect, useState } from "react";
import { BookOpen , GraduationCap } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth.jsx";
import { useT } from "../i18n.jsx";
import { Empty, PageHead, Spinner } from "../components/ui.jsx";
import { ProfileCard } from "./StudentFile.jsx";

export default function MyModules() {
  const { can, user } = useAuth(); const { t, tr } = useT();
  const [data, setData] = useState(null);
  useEffect(() => { api.get(can.teach ? "/me/teaching/" : "/me/profile/").then((r) => setData(r.data)); }, []);
  if (!data) return <Spinner />;
  return (<div>
    <PageHead title={t("My modules")} />
    {can.teach ? (data.length ? <div className="cards">{data.map((r) => (
      <div className="panel mod-card" key={r.id}><BookOpen size={20} /><b>{tr({ n: r.module, n_ar: r.module_ar }, "n")}</b>
        <span>{r.group} — {tr({ n: r.level, n_ar: r.level_ar }, "n")}</span><span className="pill" title={t("Students")}><GraduationCap size={13} />{r.students}</span></div>))}</div>
      : <div className="panel"><Empty title={t("Not assigned to any class yet.")} /></div>)
      : data.length ? data.map((p) => <div key={p.id}>{user.role === "parent" && <h2 className="child-name">{p.name}</h2>}<ProfileCard p={p} /></div>)
      : <div className="panel"><Empty title={t("No linked students.")}>{t("Ask the school to link your children to your account.")}</Empty></div>}
  </div>);
}
