import { useEffect, useState } from "react";
import axios from "axios";

function Dashboard() {
  const [summary, setSummary] = useState({
    consumers: 0,
    totalConnections: 0,
    activeMeters: 0,
    pendingBills: 0,
    totalRevenue: 0
  });

  useEffect(() => {
    axios
      .get("http://127.0.0.1:5000/dashboard/summary")
      .then((res) => setSummary(res.data))
      .catch(() => {
        // Keep fallback values when API is unavailable.
      });
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="dashboard-grid">
        <Card title="Total Consumers" value={summary.consumers} />
        <Card title="Total Connections" value={summary.totalConnections} />
        <Card title="Active Meters" value={summary.activeMeters} />
        <Card title="Pending Bills" value={summary.pendingBills} />
        <Card title="Revenue Collected" value={`Rs. ${summary.totalRevenue}`} />
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="dash-card">
      <h3>{title}</h3>
      <h2>{value}</h2>
    </div>
  );
}

export default Dashboard;