import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Bell, BookOpen, CalendarDays, ClipboardCheck, CreditCard, DoorOpen, GraduationCap, Layers, LayoutDashboard, Link2,
  LogOut, Megaphone, Menu, MoreHorizontal, NotebookPen, School, Settings, Tags, UserCircle, UserCog, UserRound, Users, X,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth.jsx";
import { LangSelect, useT } from "../i18n.jsx";
import { initials, useFmt } from "./ui.jsx";

// [section, [[path, label, icon, roles]]]
const ALL = ["admin", "staff", "teacher", "student", "parent"];
const MGR = ["admin", "staff"], STAFF = ["admin", "staff", "teacher"];
const NAV = [
  ["", [
    ["/", "Dashboard", LayoutDashboard, ALL],
    ["/attendance", "Daily attendance", ClipboardCheck, STAFF],
    ["/timetable", "Timetable", CalendarDays, ALL],
    ["/my-students", "My students", Users, ["teacher"]],
    ["/messages", "Messages", Megaphone, STAFF],
    ["/my-modules", "My modules", BookOpen, ["teacher", "student", "parent"]],
    ["/grades", "Grades", NotebookPen, ALL.filter((r) => r !== "staff")],
    ["/payments", "Payments", CreditCard, ["admin", "staff", "student", "parent"]],
    ["/notifications", "Notifications", Bell, ALL],
  ]],
  ["People", [
    ["/students", "Students", GraduationCap, MGR],
    ["/subscriptions", "Subscriptions", Tags, MGR],
    ["/teachers", "Teachers", UserRound, MGR],
    ["/staff", "Parents & staff", UserCog, MGR],
  ]],
  ["School", [
    ["/groups", "Classes", School, MGR],
    ["/teachings", "Teaching assignments", Link2, MGR],
    ["/modules", "Modules", BookOpen, MGR],
    ["/levels", "Levels", Layers, MGR],
    ["/rooms", "Rooms", DoorOpen, MGR],
    ["/settings", "Settings", Settings, ["admin"]],
  ]],
  ["", [["/profile", "My profile", UserCircle, ALL]]],
];
const FLAT = NAV.flatMap(([, items]) => items);

// Phone bottom bar: the 4 pages each role uses most (+ "More" opens the full menu)
const TABS = {
  admin: ["/", "/attendance", "/timetable", "/messages"],
  staff: ["/", "/attendance", "/students", "/payments"],
  teacher: ["/", "/attendance", "/my-students", "/messages"],
  parent: ["/", "/timetable", "/grades", "/payments"],
  student: ["/", "/timetable", "/grades", "/payments"],
};
const SHORT = { "/": "Home", "/attendance": "Attendance", "/my-students": "Students" };

/** Copies each table header into its cells (data-label) so tables can turn into cards on phones. */
function useResponsiveTables(ref) {
  useEffect(() => {
    const label = () => ref.current?.querySelectorAll("table").forEach((tb) => {
      const heads = [...tb.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      if (!heads.length) return;
      tb.querySelectorAll("tbody tr").forEach((tr) => [...tr.children].forEach((td, i) => {
        if (heads[i] && td.getAttribute("data-label") !== heads[i]) td.setAttribute("data-label", heads[i]);
      }));
    });
    label();
    const mo = new MutationObserver(label);
    mo.observe(ref.current, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
}

export default function Layout({ children }) {
  const { user, role, logout, school } = useAuth(); const { t } = useT(); const loc = useLocation();
  const [unread, setUnread] = useState(0); const [open, setOpen] = useState(false);
  const mainRef = useRef();
  useResponsiveTables(mainRef);
  const load = () => api.get("/notifications/count/").then((r) => setUnread(r.data.unread)).catch(() => {});
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);
  useEffect(() => { setOpen(false); load(); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; }, [open]);
  const name = user.first_name ? `${user.first_name} ${user.last_name}` : user.username;
  const current = FLAT.find(([to]) => (to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to)));
  const tabs = (TABS[role] || TABS.student).map((p) => FLAT.find(([to]) => to === p)).filter(Boolean);
  const inTabs = tabs.some(([to]) => to === current?.[0]);
  return (
    <div className="shell">
      <aside className={open ? "open" : ""} aria-label={t("Menu")}>
        <div className="brand">
          {school.logo_url ? <img src={school.logo_url} alt="" /> : <span className="brand-mark"><GraduationCap size={19} /></span>}
          <b>{school.name || t("School")}</b>
          <button className="icon-btn only-mobile" onClick={() => setOpen(false)} aria-label={t("Close")}><X size={20} /></button>
        </div>
        <nav>
          {NAV.map(([section, items], i) => {
            const vis = items.filter(([, , , roles]) => roles.includes(role));
            if (!vis.length) return null;
            return (
              <div key={i} className="nav-sec">
                {section && <div className="nav-title">{t(section)}</div>}
                {vis.map(([to, label, Icon]) => (
                  <NavLink key={to} to={to} end={to === "/"}>
                    <Icon size={19} strokeWidth={1.8} /><span>{t(label)}</span>
                    {to === "/notifications" && unread > 0 && <em className="nav-badge">{unread}</em>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="aside-foot">
          <Link to="/profile" className="me"><span className="avatar">{initials(name)}</span><span><b>{name}</b><small>{t(role)}</small></span></Link>
          <div className="aside-tools"><LangSelect /><button className="btn ghost sm" onClick={logout}><LogOut size={16} />{t("Log out")}</button></div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <span className="top-title">
            {school.logo_url ? <img src={school.logo_url} alt="" className="only-mobile top-logo" /> : <span className="brand-mark sm only-mobile"><GraduationCap size={16} /></span>}
            <b>{current ? t(current[1]) : school.name}</b>
          </span>
          <div className="top-end">
            <span className="only-desktop"><LangSelect /></span>
            <BellMenu unread={unread} reload={load} />
            <Link to="/profile" className="top-avatar" title={t("My profile")} aria-label={t("My profile")}>{initials(name)}</Link>
          </div>
        </header>
        <main ref={mainRef}>{children}</main>
      </div>
      <nav className="tabbar" aria-label={t("Menu")}>
        {tabs.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"}><Icon size={22} strokeWidth={1.8} /><span>{t(SHORT[to] || label)}</span></NavLink>
        ))}
        <button className={open || (!inTabs && current) ? "active" : ""} onClick={() => setOpen(true)}>
          <MoreHorizontal size={22} /><span>{t("More")}</span>{unread > 0 && <em className="tab-dot" />}
        </button>
      </nav>
    </div>
  );
}

function BellMenu({ unread, reload }) {
  const { t } = useT(); const f = useFmt();
  const [open, setOpen] = useState(false); const [rows, setRows] = useState([]);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    api.get("/notifications/", { params: { limit: 6 } }).then((r) => setRows(r.data));
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const readAll = async () => { await api.post("/notifications/read_all/"); setRows((r) => r.map((x) => ({ ...x, read: true }))); reload(); };
  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={t("Notifications")} aria-expanded={open}>
        <Bell size={21} />{unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dd-head"><b>{t("Notifications")}</b>{unread > 0 && <button className="link" onClick={readAll}>{t("Mark all read")}</button>}</div>
          <div className="dd-list">
            {rows.length ? rows.map((n) => (
              <div key={n.id} className={`dd-item ${n.read ? "" : "unread"}`}><b>{n.title}</b><p>{n.body}</p><small>{f.when(n.created_at)}</small></div>
            )) : <p className="muted pad">{t("No notifications.")}</p>}
          </div>
          <Link className="dd-foot" to="/notifications" onClick={() => setOpen(false)}>{t("See all")}</Link>
        </div>
      )}
    </div>
  );
}
