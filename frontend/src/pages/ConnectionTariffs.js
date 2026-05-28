import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateNotFuture } from "../utils/dateValidation";
import TableControls from "../components/TableControls";
import Modal from "../components/Modal";
import TableSearch from "../components/TableSearch";

function ConnectionTariffs({ department }) {
  const [data, setData] = useState([]);
  const [connections, setConnections] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchField, setSearchField] = useState("connection_tariff_id");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();

  const [form, setForm] = useState({
    connection_id: "",
    tariff_id: "",
    start_date: "",
    end_date: ""
  });

  const fetchData = useCallback(() => {
    const session = (() => { try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; } })();
    const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;

    Promise.all([
      axios.get("http://127.0.0.1:5000/connections", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
      axios.get("http://127.0.0.1:5000/tariffs", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
      axios.get("http://127.0.0.1:5000/connection-tariffs", { headers: deptHeader ? { "x-department": deptHeader } : {} })
    ]).then(([connectionsRes, tariffsRes, connectionTariffsRes]) => {
      const filteredConnections = connectionsRes.data.filter(
        (c) => c.service_type === department
      ).sort((a, b) => Number(a.connection_id) - Number(b.connection_id));
      const filteredTariffs = tariffsRes.data.filter(
        (t) => t.service_type === department
      ).sort((a, b) => Number(a.tariff_id) - Number(b.tariff_id));

      const connectionIds = new Set(filteredConnections.map((c) => Number(c.connection_id)));
      const tariffIds = new Set(filteredTariffs.map((t) => Number(t.tariff_id)));

      const filteredConnectionTariffs = connectionTariffsRes.data.filter(
        (ct) =>
          connectionIds.has(Number(ct.connection_id)) &&
          tariffIds.has(Number(ct.tariff_id))
      ).sort((a, b) => Number(a.connection_tariff_id) - Number(b.connection_tariff_id));

      setConnections(filteredConnections);
      setTariffs(filteredTariffs);
      setData(filteredConnectionTariffs);
    }).catch(() => {
      setConnections([]);
      setTariffs([]);
      setData([]);
    });
  }, [department]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    setError("");
    
    // Validate start_date and end_date are not in future
    if (form.start_date) {
      const startError = validateDateNotFuture(form.start_date);
      if (startError) {
        setError(startError);
        return;
      }
    }
    
    if (form.end_date) {
      const endError = validateDateNotFuture(form.end_date);
      if (endError) {
        setError(endError);
        return;
      }
    }
    
    try {
      if (editId) {
        await axios.put(`http://127.0.0.1:5000/connection-tariffs/${editId}`, form);
      } else {
        await axios.post("http://127.0.0.1:5000/connection-tariffs", form);
      }

      setEditId(null);
      setForm({
        connection_id: "",
        tariff_id: "",
        start_date: "",
        end_date: ""
      });
      setShowForm(false);

      fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save connection tariff");
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/connection-tariffs/${id}`);
      fetchData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete connection tariff");
    }
  };

  const handleEditById = (id) => {
    const row = data.find((d) => Number(d.connection_tariff_id) === Number(id));
    if (!row) {
      alert("Connection tariff not found");
      return;
    }

    setForm({
      connection_id: row.connection_id,
      tariff_id: row.tariff_id,
      start_date: row.start_date?.split("T")[0] || "",
      end_date: row.end_date?.split("T")[0] || ""
    });
    setEditId(row.connection_tariff_id);
    setShowForm(true);
  };

  const handleDeleteById = async (id) => {
    const row = data.find((d) => Number(d.connection_tariff_id) === Number(id));
    if (!row) {
      alert("Connection tariff not found");
      return;
    }
    await handleDelete(row.connection_tariff_id);
  };

  const filteredData = data.filter((row) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const valueMap = {
      connection_tariff_id: row.connection_tariff_id,
      connection_id: row.connection_id,
      tariff_id: row.plan_name || row.tariff_id
    };

    return String(valueMap[searchField] ?? "").toLowerCase().includes(term);
  });

  return (
    <div>
      <h1>Connection Tariffs</h1>
      <p style={{ marginTop: "-8px", color: "#3f6761" }}>Department: {department}</p>

      <TableControls
        entityLabel="Connection Tariff"
        onInsert={() => {
          setEditId(null);
          setForm({
            connection_id: "",
            tariff_id: "",
            start_date: "",
            end_date: ""
          });
          setShowForm(true);
        }}
        onEditById={handleEditById}
        onDeleteById={handleDeleteById}
      />

      <TableSearch
        title="Connection Tariffs"
        field={searchField}
        term={searchTerm}
        options={[
          { value: "connection_tariff_id", label: "ID" },
          { value: "connection_id", label: "Connection ID" },
          { value: "tariff_id", label: "Tariff / Plan" }
        ]}
        onFieldChange={setSearchField}
        onTermChange={setSearchTerm}
      />

      <Modal
        open={showForm}
        title={editId ? "Edit Connection Tariff" : "Insert Connection Tariff"}
        onClose={() => setShowForm(false)}
        footer={(
          <>
            <button type="button" className="modal-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" onClick={handleSubmit}>{editId ? "Update" : "Add"}</button>
          </>
        )}
      >
        {error && <p style={{color: '#ef4444', fontWeight: 600, marginBottom: '10px'}}>{error}</p>}
        <div className="modal-grid">
          <select
            value={form.connection_id}
            onChange={(e) => setForm({ ...form, connection_id: e.target.value })}
          >
            <option value="">Select Connection</option>
            {connections.map((c) => (
              <option key={c.connection_id} value={c.connection_id}>
                {c.connection_id}
              </option>
            ))}
          </select>
          <select
            value={form.tariff_id}
            onChange={(e) => setForm({ ...form, tariff_id: e.target.value })}
          >
            <option value="">Select Plan</option>
            {tariffs.map((t) => (
              <option key={t.tariff_id} value={t.tariff_id}>
                {t.consumer_type} - Tariff #{t.tariff_id}
              </option>
            ))}
          </select>
          <input
            type="date"
            max={todayDate}
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <input
            type="date"
            max={todayDate}
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>
      </Modal>

      <table border="1">
        <thead>
          <tr>
            <th>ID</th>
            <th>Connection</th>
            <th>Tariff</th>
            <th>Start Date</th>
            <th>End Date</th>
          </tr>
        </thead>
        <tbody>
          {filteredData.map(d => (
            <tr key={d.connection_tariff_id}>
              <td>{d.connection_tariff_id}</td>
              <td>{d.connection_id}</td>
              <td>{d.plan_name || d.tariff_id}</td>
              <td>{d.start_date ? d.start_date.split("T")[0] : "-"}</td>
              <td>{d.end_date ? d.end_date.split("T")[0] : "Active"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ConnectionTariffs;