// ConsumerSearch workbench: lightweight search UI and profile viewer.
import { useState } from "react";
import axios from "axios";

// Reusable presentational table used to render connections, meters, bills, etc.
function DataTable({ title, rows, columns, className = "" }) {
  return (
    <div className={`ops-card ${className}`.trim()}>
      <h3>{title}</h3>
      {!rows.length ? (
        <p className="ops-empty">No data available.</p>
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

function ConsumerSearch() {
  // Component state:
  // `query`: search input; `results`: search hits from /search/consumers
  // `selectedId` / `profile`: currently opened consumer profile; `error` for messages
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  // handleSearch: call the server-side search endpoint which performs
  // a LIKE query across name/contact/id and returns aggregated fields
  // (total_connections, active_connections, unpaid_amount). We limit
  // results on the server to keep responses small and snappy.
  const handleSearch = async (e) => {
    e.preventDefault();
    setError("");
    setProfile(null);
    setSelectedId(null);

    try {
      const session = (() => { try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; } })();
      const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;
      const response = await axios.get("http://127.0.0.1:5000/search/consumers", {
        params: { q: query.trim() },
        headers: deptHeader ? { "x-department": deptHeader } : {}
      });
      setResults(response.data || []);
    } catch (err) {
      setResults([]);
      setError(err?.response?.data?.message || "Failed to search consumers.");
    }
  };

  // openProfile: fetch the detailed consumer profile which joins data from
  // Service_Connection, Meter, reading table (via getReadingTableName()),
  // Bill, Payment and Tariff tables. This is a single endpoint that returns
  // multiple related datasets so the UI can render a unified profile view.
  const openProfile = async (consumerId) => {
    setError("");
    setSelectedId(consumerId);

    try {
      const session = (() => { try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; } })();
      const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;
      const response = await axios.get(`http://127.0.0.1:5000/consumers/${consumerId}/profile`, { headers: deptHeader ? { "x-department": deptHeader } : {} });
      setProfile(response.data || null);
    } catch (err) {
      setProfile(null);
      setError(err?.response?.data?.message || "Failed to load consumer profile.");
    }
  };

  return (
    <div className="ops-shell">
      <h1>Consumer Search Workbench</h1>
      <p className="ops-intro">Search by consumer name, consumer ID, or contact number and get the complete profile in one place.</p>

      <form className="ops-search" onSubmit={handleSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type consumer name / ID / contact"
        />
        <button type="submit">Search</button>
      </form>

      {error && <p className="ops-error">{error}</p>}

      {!!results.length && (
        <div className="ops-card">
          <h3>Search Results</h3>
          <div className="ops-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Type</th>
                  <th>Total Conn.</th>
                  <th>Active Conn.</th>
                  <th>Unpaid Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.consumer_id}>
                    <td>{row.consumer_id}</td>
                    <td>{row.name}</td>
                    <td>{row.contact_no}</td>
                    <td>{row.consumer_type}</td>
                    <td>{row.total_connections}</td>
                    <td>{row.active_connections}</td>
                    <td>{Number(row.unpaid_amount || 0).toFixed(2)}</td>
                    <td>
                      <button type="button" onClick={() => openProfile(row.consumer_id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {profile && (
        <div className="ops-profile-grid">
          <div className="ops-card ops-card-profile">
            <h3>Consumer Profile</h3>
            <div className="ops-profile-fields">
              <p><strong>ID:</strong> {profile.consumer?.consumer_id}</p>
              <p><strong>Name:</strong> {profile.consumer?.name}</p>
              <p><strong>Contact:</strong> {profile.consumer?.contact_no}</p>
              <p><strong>Address:</strong> {profile.consumer?.address}</p>
              <p><strong>Type:</strong> {profile.consumer?.consumer_type}</p>
              <p><strong>Registration:</strong> {profile.consumer?.registration_date?.slice?.(0, 10) || profile.consumer?.registration_date}</p>
            </div>

            <h4 className="ops-subtitle">Quick Stats</h4>
            <div className="ops-kpi-grid">
              <div className="ops-kpi">
                <span>Total Connections</span>
                <strong>{profile.quickStats?.totalConnections}</strong>
              </div>
              <div className="ops-kpi">
                <span>Active Connections</span>
                <strong>{profile.quickStats?.activeConnections}</strong>
              </div>
              <div className="ops-kpi">
                <span>Total Meters</span>
                <strong>{profile.quickStats?.totalMeters}</strong>
              </div>
              <div className="ops-kpi">
                <span>Unpaid Bills</span>
                <strong>{profile.quickStats?.unpaidBills}</strong>
              </div>
              <div className="ops-kpi">
                <span>Unpaid Amount</span>
                <strong>{Number(profile.quickStats?.unpaidAmount || 0).toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <div className="ops-stack">
            <DataTable
              title={`Connections for Consumer #${selectedId}`}
              rows={profile.connections || []}
              columns={[
                { key: "connection_id", label: "Connection ID" },
                { key: "service_type", label: "Service" },
                { key: "connection_status", label: "Status" },
                { key: "installation_address", label: "Address" }
              ]}
            />

            <DataTable
              title="Tariff Plan by Connection"
              rows={(profile.tariffs || []).map((t) => ({
                ...t,
                tariff_id: t.tariff_id ?? "-",
                rate_per_unit: t.rate_per_unit ?? "-",
                fixed_charge: t.fixed_charge ?? "-",
                tax_percentage: t.tax_percentage ?? "-",
                start_date: t.start_date ? t.start_date.split("T")[0] : "-",
                end_date: t.end_date ? t.end_date.split("T")[0] : "Active"
              }))}
              columns={[
                { key: "connection_id", label: "Connection ID" },
                { key: "connection_status", label: "Connection Status" },
                { key: "plan_name", label: "Tariff Plan" },
                { key: "tariff_id", label: "Tariff ID" },
                { key: "rate_per_unit", label: "Rate/Unit" },
                { key: "fixed_charge", label: "Fixed Charge" },
                { key: "tax_percentage", label: "Tax %" },
                { key: "start_date", label: "Start Date" },
                { key: "end_date", label: "End Date" }
              ]}
            />
          </div>

          <DataTable
            title="Meters"
            rows={profile.meters || []}
            className="ops-card-table"
            columns={[
              { key: "meter_id", label: "Meter ID" },
              { key: "meter_number", label: "Meter Number" },
              { key: "meter_status", label: "Status" },
              { key: "installation_date", label: "Install Date" }
            ]}
          />

          <DataTable
            title="Recent Reading Records"
            rows={profile.records || []}
            className="ops-card-table"
            columns={[
              { key: "reading_id", label: "Reading ID" },
              { key: "meter_id", label: "Meter ID" },
              { key: "consumption_units", label: "Units" },
              { key: "reading_date", label: "Reading Date" }
            ]}
          />

          <DataTable
            title="Recent Bills"
            rows={profile.bills || []}
            className="ops-card-table"
            columns={[
              { key: "bill_id", label: "Bill ID" },
              { key: "bill_number", label: "Bill Number" },
              { key: "total_amount", label: "Amount" },
              { key: "payment_status", label: "Status" },
              { key: "due_date", label: "Due Date" }
            ]}
          />

          <DataTable
            title="Recent Payments"
            rows={profile.payments || []}
            className="ops-card-table"
            columns={[
              { key: "payment_id", label: "Payment ID" },
              { key: "bill_id", label: "Bill ID" },
              { key: "amount_paid", label: "Amount Paid" },
              { key: "payment_mode", label: "Mode" },
              { key: "payment_date", label: "Payment Date" }
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default ConsumerSearch;
