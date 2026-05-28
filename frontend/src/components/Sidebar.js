import { NavLink } from "react-router-dom";

function Sidebar() {
  const navItems = [
    { to: "/", label: "Dashboard" },
    { to: "/consumers", label: "Consumers" },
    { to: "/consumer-search", label: "Consumer Search" },
    { to: "/connections", label: "Connections" },
    { to: "/meters", label: "Meters" },
    { to: "/records", label: "Reading Records" },
    { to: "/tariffs", label: "Tariff Plans" },
    { to: "/connection-tariffs", label: "Connection Tariffs" },
    { to: "/bills", label: "Bills" },
    { to: "/payments", label: "Payments" },
    { to: "/reports", label: "Reports" }
  ];

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <h2>UtilityTrack</h2>
        <p>UtilityTrack Suite</p>
      </div>

      <ul className="sidebar-nav">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `sidebar-link${isActive ? " sidebar-link-active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default Sidebar;