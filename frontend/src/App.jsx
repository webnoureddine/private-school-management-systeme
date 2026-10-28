import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Timetable from "./pages/Timetable.jsx";
import Attendance from "./pages/Attendance.jsx";
import Messages from "./pages/Messages.jsx";
import Notifications from "./pages/Notifications.jsx";
import MyModules from "./pages/MyModules.jsx";
import MyStudents from "./pages/MyStudents.jsx";
import Subscriptions from "./pages/Subscriptions.jsx";
import StudentFile from "./pages/StudentFile.jsx";
import Grades from "./pages/Grades.jsx";
import Payments from "./pages/Payments.jsx";
import Settings from "./pages/Settings.jsx";
import Profile from "./pages/Profile.jsx";
import { Students, Teachers, Staff, Levels, Groups, Modules, Teachings, Rooms } from "./pages/Resources.jsx";

export default function App() {
  const { user, can, loading } = useAuth();
  if (loading) return <div className="boot"><span className="spinner" /></div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  const M = (el) => (can.manage ? el : <Navigate to="/" />);
  const S = (el) => (can.staff ? el : <Navigate to="/" />);
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/login" element={<Navigate to="/" />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/attendance" element={S(<Attendance />)} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/payments" element={can.teach ? <Navigate to="/" /> : <Payments />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/messages" element={S(<Messages />)} />
        <Route path="/my-students" element={S(<MyStudents />)} />
        <Route path="/my-modules" element={<MyModules />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/students" element={M(<Students />)} />
        <Route path="/students/:id" element={S(<StudentFile />)} />
        <Route path="/subscriptions" element={M(<Subscriptions />)} />
        <Route path="/teachers" element={M(<Teachers />)} />
        <Route path="/staff" element={M(<Staff />)} />
        <Route path="/groups" element={M(<Groups />)} />
        <Route path="/levels" element={M(<Levels />)} />
        <Route path="/modules" element={M(<Modules />)} />
        <Route path="/teachings" element={M(<Teachings />)} />
        <Route path="/rooms" element={M(<Rooms />)} />
        <Route path="/settings" element={can.director ? <Settings /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
