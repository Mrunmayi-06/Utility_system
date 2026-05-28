import { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import axios from "axios";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Consumers from "./pages/Consumers";
import ServiceConnections from "./pages/ServiceConnections";
import Meters from "./pages/Meters";
import Records from "./pages/Records";
import Bills from "./pages/Bills";
import Payments from "./pages/Payments";
import TariffPlans from "./pages/TariffPlans";
import ConnectionTariffs from "./pages/ConnectionTariffs";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import ConsumerSearch from "./pages/ConsumerSearch";
import AlertsPage from "./pages/AlertsPage";
import ReportsPage from "./pages/ReportsPage";

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ubms_session") || "null");
    } catch {
      return null;
    }
  });

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    localStorage.setItem("ubms_session", JSON.stringify(user));
  };

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("ut_theme") || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("ut_theme", theme);
    } catch {}
    if (theme === "dark") document.body.classList.add("theme-dark");
    else document.body.classList.remove("theme-dark");
  }, [theme]);

  const handleLogout = () => {
    localStorage.removeItem("ubms_session");
    setCurrentUser(null);
  };

  useEffect(() => {
    if (currentUser?.department) {
      axios.defaults.headers.common["x-department"] = currentUser.department;
      axios.defaults.headers.common["x-user-name"] = currentUser.name || "Unknown";
      axios.defaults.headers.common["x-user-email"] = currentUser.email || "unknown@example.com";
      return;
    }
    delete axios.defaults.headers.common["x-department"];
    delete axios.defaults.headers.common["x-user-name"];
    delete axios.defaults.headers.common["x-user-email"];
  }, [currentUser]);

  return (
    <Router>
      {currentUser ? (
        <div className="app-shell">
          <Sidebar />

          <main className="app-main">
            <header className="app-topbar">
              <div>
                <h1>UtilityTrack</h1>
                <p>Manage consumers, usage, billing, and payments in one unified dashboard.</p>
              </div>
              <div className="topbar-actions">
                <span>{currentUser.name} | {currentUser.department} | Employee</span>
                <button
                  className="theme-toggle"
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                >
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
                <button onClick={handleLogout}>Logout</button>
              </div>
            </header>

            <section className="page-panel">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/consumers" element={<Consumers />} />
                <Route path="/consumer-search" element={<ConsumerSearch />} />
                <Route path="/connections" element={<ServiceConnections department={currentUser.department} />} />
                <Route path="/meters" element={<Meters department={currentUser.department} />} />
                <Route path="/records" element={<Records department={currentUser.department} />} />
                <Route path="/bills" element={<Bills department={currentUser.department} />} />
                <Route path="/payments" element={<Payments department={currentUser.department} />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/reports" element={<ReportsPage />} />

                <Route path="/tariffs" element={<TariffPlans department={currentUser.department} />} />
                <Route path="/connection-tariffs" element={<ConnectionTariffs department={currentUser.department} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </section>
          </main>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage onAuthSuccess={handleAuthSuccess} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Router>
  );
}

export default App;