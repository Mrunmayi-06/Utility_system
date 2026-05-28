import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateNotFuture } from "../utils/dateValidation";
import TableControls from "../components/TableControls";
import Modal from "../components/Modal";
import TableSearch from "../components/TableSearch";

function Meters({ department }) {
  const [data, setData] = useState([]);
  const [connections, setConnections] = useState([]);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchField, setSearchField] = useState("meter_id");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();

  const [form, setForm] = useState({
    meter_number: "",
    installation_date: "",
    meter_status: "Active",
    connection_id: ""
  });

  const fetchData = useCallback(() => {
    const session = (() => { try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; } })();
    const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;

    Promise.all([
      axios.get("http://127.0.0.1:5000/connections", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
      axios.get("http://127.0.0.1:5000/meters", { headers: deptHeader ? { "x-department": deptHeader } : {} })
    ]).then(([connectionsRes, metersRes]) => {
      const departmentConnections = connectionsRes.data.filter(
        (c) => c.service_type === department
      );
      const connectionIds = new Set(departmentConnections.map((c) => Number(c.connection_id)));
      const filteredMeters = metersRes.data.filter((m) => connectionIds.has(Number(m.connection_id)));

      setConnections(departmentConnections);
      setData(filteredMeters);
    }).catch(() => {
      setConnections([]);
      setData([]);
    });
  }, [department]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    setError("");
    
    if (!form.meter_number || !form.installation_date || !form.meter_status || !form.connection_id) {
      setError("Please fill all meter fields.");
      return;
    }

    // Validate installation_date is not in future
    const dateError = validateDateNotFuture(form.installation_date);
    if (dateError) {
      setError(dateError);
      return;
    }

    try {
      if (editId) {
        await axios.put(`http://127.0.0.1:5000/meters/${editId}`, form);
      } else {
        await axios.post("http://127.0.0.1:5000/meters", form);
      }

      setEditId(null);
      setForm({
        meter_number: "",
        installation_date: "",
        meter_status: "Active",
        connection_id: ""
      });
      setShowForm(false);
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save meter");
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/meters/${id}`);
      fetchData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete meter");
    }
  };

  const handleEditById = (id) => {
    const meter = data.find((d) => Number(d.meter_id) === Number(id));
    if (!meter) {
      alert("Meter not found");
      return;
    }

    setForm({
      meter_number: meter.meter_number || "",
      installation_date: meter.installation_date?.split("T")[0] || "",
      meter_status: meter.meter_status || "Active",
      connection_id: meter.connection_id || ""
    });
    setEditId(meter.meter_id);
    setShowForm(true);
  };

  const handleDeleteById = async (id) => {
    const meter = data.find((d) => Number(d.meter_id) === Number(id));
    if (!meter) {
      alert("Meter not found");
      return;
    }
    await handleDelete(meter.meter_id);
  };

  const filteredData = data.filter((meter) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const valueMap = {
      meter_id: meter.meter_id,
      meter_number: meter.meter_number,
      connection_id: meter.connection_id
    };

    return String(valueMap[searchField] ?? "").toLowerCase().includes(term);
  });

  return (
    <div>
      <h1>Meters</h1>
      <p style={{ marginTop: "-8px", color: "#3f6761" }}>Department: {department}</p>

      <TableControls
        entityLabel="Meter"
        onInsert={() => {
          setEditId(null);
          setForm({
            meter_number: "",
            installation_date: "",
            meter_status: "Active",
            connection_id: ""
          });
          setShowForm(true);
        }}
        onEditById={handleEditById}
        onDeleteById={handleDeleteById}
      />

      <TableSearch
        title="Meters"
        field={searchField}
        term={searchTerm}
        options={[
          { value: "meter_id", label: "ID" },
          { value: "meter_number", label: "Meter Number" },
          { value: "connection_id", label: "Connection ID" }
        ]}
        onFieldChange={setSearchField}
        onTermChange={setSearchTerm}
      />

      <Modal
        open={showForm}
        title={editId ? "Edit Meter" : "Insert Meter"}
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
          <input
            className="full-span"
            placeholder="Meter Number"
            value={form.meter_number}
            onChange={(e) => setForm({ ...form, meter_number: e.target.value })}
          />
          <input
            type="date"
            max={todayDate}
            value={form.installation_date}
            onChange={(e) => setForm({ ...form, installation_date: e.target.value })}
          />
          <select
            value={form.meter_status}
            onChange={(e) => setForm({ ...form, meter_status: e.target.value })}
          >
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <select
            className="full-span"
            value={form.connection_id}
            onChange={(e) => setForm({ ...form, connection_id: e.target.value })}
          >
            <option value="">Select Connection</option>
            {connections.map((c) => (
              <option key={c.connection_id} value={c.connection_id}>{c.connection_id}</option>
            ))}
          </select>
        </div>
      </Modal>

      <table border="1" cellPadding="10" style={{ marginTop: "20px" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Meter Number</th>
            <th>Installation Date</th>
            <th>Status</th>
            <th>Connection ID</th>
          </tr>
        </thead>
        <tbody>
          {filteredData.map((d) => (
            <tr key={d.meter_id}>
              <td>{d.meter_id}</td>
              <td>{d.meter_number}</td>
              <td>{d.installation_date ? d.installation_date.split("T")[0] : ""}</td>
              <td>{d.meter_status}</td>
              <td>{d.connection_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Meters;