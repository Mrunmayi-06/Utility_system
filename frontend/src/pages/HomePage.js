import { Link } from "react-router-dom";

const facilities = [
  {
    title: "Consumer Management",
    detail: "Register, edit, and maintain residential and commercial consumer profiles."
  },
  {
    title: "Service Connections",
    detail: "Create and monitor utility connections with department-wise tracking."
  },
  {
    title: "Meter Tracking",
    detail: "Manage meter installations, statuses, and mapping to active connections."
  },
  {
    title: "Reading Records",
    detail: "Store periodic readings and consumption units for accurate billing."
  },
  {
    title: "Smart Billing",
    detail: "Generate bills manually or auto-calculate charges from tariff plans."
  },
  {
    title: "Payment Monitoring",
    detail: "Track payment entries and status updates from unpaid to fully paid."
  }
];

function HomePage() {
  return (
    <div className="home-shell">
      <div className="home-logo" aria-label="UtilityTrack logo">
        UT
      </div>

      <div className="home-overlay" />

      <main className="home-content">
        <p className="home-kicker">UtilityTrack Suite</p>
        <h1>Powerful Utility Operations, One Unified Platform</h1>
        <p className="home-subtitle">
          From consumer onboarding to tariff-driven billing and payment closure, run every utility workflow in one place.
        </p>

        <div className="home-facilities">
          {facilities.map((item) => (
            <article key={item.title} className="facility-card">
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>

        <div className="home-actions">
          <Link to="/auth" className="home-login-btn">Login</Link>
        </div>
      </main>
    </div>
  );
}

export default HomePage;
