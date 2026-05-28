import { useEffect, useState } from "react";
import axios from "axios";

function AlertSection({ title, rows, columns }) {
  return (
    <div className="ops-card">
      <h3>{title}</h3>
      {!rows?.length ? (
        <p className="ops-empty">No records.</p>
      ) : (
        <div className="ops-table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key}>{row[column.key] ?? "-"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AlertsPage() {
  const [alerts, setAlerts] = useState({
    overdueBills: [],
    disconnectedConnections: [],
    noRecentReading: [],
    highConsumption: []
  });
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get("http://127.0.0.1:5000/alerts")
      .then((response) => setAlerts(response.data || {}))
      .catch((err) => setError(err?.response?.data?.message || "Failed to fetch alerts"));
  }, []);

  return (
    <div className="ops-shell">
      <h1>Operational Alerts</h1>
      <p>System-generated alerts for overdue billing, disconnections, missing readings, and abnormal usage.</p>
      {error && <p className="ops-error">{error}</p>}

      <div className="ops-profile-grid">
        <AlertSection
          title="Overdue Bills"
          rows={alerts.overdueBills || []}
          columns={[
            { key: "bill_id", label: "Bill ID" },
            { key: "consumer_name", label: "Consumer" },
            { key: "connection_id", label: "Connection" },
            { key: "due_date", label: "Due Date" },
            { key: "total_amount", label: "Amount" }
          ]}
        />

        <AlertSection
          title="Disconnected Connections"
          rows={alerts.disconnectedConnections || []}
          columns={[
            { key: "connection_id", label: "Connection ID" },
            { key: "consumer_name", label: "Consumer" },
            { key: "connection_status", label: "Status" },
            { key: "installation_address", label: "Address" }
          ]}
        />

        <AlertSection
          title="No Recent Reading (45+ Days)"
          rows={alerts.noRecentReading || []}
          columns={[
            { key: "meter_id", label: "Meter ID" },
            { key: "meter_number", label: "Meter Number" },
            { key: "consumer_name", label: "Consumer" },
            { key: "last_reading_date", label: "Last Reading" }
          ]}
        />

        <AlertSection
          title="High Consumption (Last 31 Days)"
          rows={alerts.highConsumption || []}
          columns={[
            { key: "reading_id", label: "Reading ID" },
            { key: "consumer_name", label: "Consumer" },
            { key: "meter_id", label: "Meter" },
            { key: "consumption_units", label: "Units" },
            { key: "reading_date", label: "Date" }
          ]}
        />
      </div>
    </div>
  );
}

export default AlertsPage;
