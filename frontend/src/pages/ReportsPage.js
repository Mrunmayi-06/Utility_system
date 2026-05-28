import { useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateRange } from "../utils/dateValidation";

function ReportsPage() {
  const [form, setForm] = useState({ from: "", to: "" });
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();

  const generate = async (e) => {
    e.preventDefault();
    setError("");

    // Require both dates to be provided
    if (!form.from || !form.to) {
      setError("Please select both start and end dates for the report.");
      setSummary(null);
      return;
    }

    // Validate dates are not in future and range is valid
    const dateValidationError = validateDateRange(form.from, form.to);
    if (dateValidationError) {
      setError(dateValidationError);
      setSummary(null);
      return;
    }

    try {
      const session = (() => { try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; } })();
      const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;
      const response = await axios.get("http://127.0.0.1:5000/reports/department-summary", {
        params: {
          from: form.from || undefined,
          to: form.to || undefined
        },
        headers: deptHeader ? { "x-department": deptHeader } : {}
      });
      setSummary(response.data || null);
    } catch (err) {
      setSummary(null);
      setError(err?.response?.data?.message || "Failed to generate report.");
    }
  };

  return (
    <div className="ops-shell">
      <h1>Department Reports</h1>
      <p>One-click operational report with billing and collection summary.</p>

      <form className="ops-search" onSubmit={generate}>
        <input
          type="date"
          max={todayDate}
          value={form.from}
          onChange={(e) => setForm((prev) => ({ ...prev, from: e.target.value }))}
        />
        <input
          type="date"
          max={todayDate}
          value={form.to}
          onChange={(e) => setForm((prev) => ({ ...prev, to: e.target.value }))}
        />
        <button type="submit">Generate Summary</button>
      </form>

      {error && <p className="ops-error">{error}</p>}

      {summary && (
        <div className="ops-card">
          <h3>{summary.department} Department Summary</h3>
          {summary.period && (
            <p>
              Period: {summary.period.from} to {summary.period.to}
            </p>
          )}

          <div className="ops-kpi-grid">
            <div className="ops-kpi"><span>Consumers</span><strong>{summary.consumers}</strong></div>
            <div className="ops-kpi"><span>Connections</span><strong>{summary.connections}</strong></div>
            <div className="ops-kpi"><span>Meters</span><strong>{summary.meters}</strong></div>
            <div className="ops-kpi"><span>Total Bills</span><strong>{summary.totalBills}</strong></div>
            <div className="ops-kpi"><span>Total Billed</span><strong>{Number(summary.totalBilled || 0).toFixed(2)}</strong></div>
            <div className="ops-kpi"><span>Unpaid Amount</span><strong>{Number(summary.unpaidAmount || 0).toFixed(2)}</strong></div>
            <div className="ops-kpi"><span>Total Paid</span><strong>{Number(summary.totalPaid || 0).toFixed(2)}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
