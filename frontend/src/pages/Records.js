import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateNotFuture } from "../utils/dateValidation";
import TableControls from "../components/TableControls";
import Modal from "../components/Modal";
import TableSearch from "../components/TableSearch";

function Records({ department }) {
  const [data, setData] = useState([]);
  const [meters, setMeters] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [searchField, setSearchField] = useState("reading_id");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();

  const [form, setForm] = useState({
    meter_id: "",
    reading_date: "",
    current_reading: "",
    consumption_units: ""
  });

  const [editId, setEditId] = useState(null);

  // FETCH DATA
  const fetchRecords = useCallback(() => {
    const session = (() => {
      try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; }
    })();
    const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;

    Promise.all([
      axios.get("http://127.0.0.1:5000/connections", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
      axios.get("http://127.0.0.1:5000/meters", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
      axios.get("http://127.0.0.1:5000/records", { headers: deptHeader ? { "x-department": deptHeader } : {} })
    ])
      .then(([connectionsRes, metersRes, recordsRes]) => {
        const connectionIds = new Set(
          connectionsRes.data
            .filter((c) => c.service_type === department)
            .map((c) => Number(c.connection_id))
        );

        const filteredMeters = metersRes.data.filter((m) =>
          connectionIds.has(Number(m.connection_id))
        );
        const meterIds = new Set(filteredMeters.map((m) => Number(m.meter_id)));

        const filteredRecords = recordsRes.data
          .filter((r) => meterIds.has(Number(r.meter_id)))
          .sort((a, b) => Number(a.reading_id) - Number(b.reading_id));

        setMeters(filteredMeters);
        setData(filteredRecords);
      })
      .catch(() => {
        setMeters([]);
        setData([]);
      });
  }, [department]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // HANDLE INPUT
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ADD / UPDATE
  const handleSubmit = async () => {
    setError("");
    
    if (
      !form.meter_id ||
      !form.reading_date ||
      form.current_reading === "" ||
      form.consumption_units === ""
    ) {
      setError("Fill all fields");
      return;
    }

    // Validate reading_date is not in future
    const dateError = validateDateNotFuture(form.reading_date);
    if (dateError) {
      setError(dateError);
      return;
    }

    try {
      if (editId) {
        await axios.put(
          `http://127.0.0.1:5000/records/${editId}`,
          form
        );
        console.log("Updated");
      } else {
        const response = await axios.post(
          "http://127.0.0.1:5000/records",
          form
        );
        const apiMessage = response?.data?.message;
        const autoBill = response?.data?.autoBill;
        if (apiMessage) {
          const reasonSuffix = autoBill && !autoBill.created && autoBill.reason
            ? ` (${autoBill.reason})`
            : "";
          setError(`${apiMessage}${reasonSuffix}`);
        }
        console.log("Added");
      }

      // RESET
      setEditId(null);
      setForm({
        meter_id: "",
        reading_date: "",
        current_reading: "",
        consumption_units: ""
      });
      setShowForm(false);

      fetchRecords();

    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save record");
    }
  };

  // DELETE
  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/records/${id}`);
      fetchRecords();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete record");
    }
  };

  const handleEditById = (id) => {
    const record = data.find((r) => Number(r.reading_id) === Number(id));
    if (!record) {
      alert("Record not found");
      return;
    }

    setForm({
      meter_id: record.meter_id,
      reading_date: record.reading_date?.split("T")[0],
      current_reading: record.current_reading,
      consumption_units: record.consumption_units
    });
    setEditId(record.reading_id);
    setShowForm(true);
  };

  const handleDeleteById = async (id) => {
    const record = data.find((r) => Number(r.reading_id) === Number(id));
    if (!record) {
      alert("Record not found");
      return;
    }
    await handleDelete(record.reading_id);
  };

  const getMeterNumber = (meterId) => {
    const meter = meters.find((item) => Number(item.meter_id) === Number(meterId));
    return meter ? meter.meter_number : "";
  };

  const filteredData = data.filter((record) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const valueMap = {
      reading_id: record.reading_id,
      meter_number: getMeterNumber(record.meter_id),
      meter_id: record.meter_id
    };

    return String(valueMap[searchField] ?? "").toLowerCase().includes(term);
  });

  return (
    <div>
      <h1>Reading Records</h1>
      <p style={{ marginTop: "-8px", color: "#3f6761" }}>Department: {department}</p>

      <TableControls
        entityLabel="Record"
        onInsert={() => {
          setEditId(null);
          setForm({
            meter_id: "",
            reading_date: "",
            current_reading: "",
            consumption_units: ""
          });
          setShowForm(true);
        }}
        onEditById={handleEditById}
        onDeleteById={handleDeleteById}
      />

      <TableSearch
        title="Reading Records"
        field={searchField}
        term={searchTerm}
        options={[
          { value: "reading_id", label: "ID" },
          { value: "meter_number", label: "Meter Number" },
          { value: "meter_id", label: "Meter ID" }
        ]}
        onFieldChange={setSearchField}
        onTermChange={setSearchTerm}
      />

      <Modal
        open={showForm}
        title={editId ? "Edit Record" : "Insert Record"}
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
            className="full-span"
            name="meter_id"
            value={form.meter_id}
            onChange={handleChange}
          >
            <option value="">Select Meter</option>
            {meters.map((m) => (
              <option key={m.meter_id} value={m.meter_id}>
                {m.meter_id} - {m.meter_number}
              </option>
            ))}
          </select>

          <input
            type="date"
            max={todayDate}
            name="reading_date"
            value={form.reading_date}
            onChange={handleChange}
          />

          <input
            name="current_reading"
            placeholder="Current Reading"
            value={form.current_reading}
            onChange={handleChange}
          />

          <input
            type="number"
            name="consumption_units"
            placeholder="Consumption Units"
            value={form.consumption_units}
            onChange={handleChange}
          />
        </div>
      </Modal>

      {/* TABLE */}
      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>ID</th>
            <th>Meter ID</th>
            <th>Date</th>
            <th>Current Reading</th>
            <th>Consumption Units</th>
          </tr>
        </thead>

        <tbody>
          {filteredData.map((r) => (
            <tr key={r.reading_id}>
              <td>{r.reading_id}</td>
              <td>{r.meter_id}</td>
              <td>
                {r.reading_date
                  ? r.reading_date.split("T")[0]
                  : ""}
              </td>
              <td>{r.current_reading}</td>
              <td>{r.consumption_units}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Records;