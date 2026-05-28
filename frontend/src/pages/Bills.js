import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateNotFuture } from "../utils/dateValidation";
import TableControls from "../components/TableControls";
import Modal from "../components/Modal";
import TableSearch from "../components/TableSearch";

function Bills({ department }) {
  const [data, setData] = useState([]);
  const [connections, setConnections] = useState([]);
  const [records, setRecords] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [searchField, setSearchField] = useState("bill_id");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();

  const [form, setForm] = useState({
    bill_number: "",
    billing_period: "",
    total_amount: "",
    due_date: "",
    payment_status: "Unpaid",
    connection_id: "",
    reading_id: ""
  });

  const [editId, setEditId] = useState(null);

  const getDepartmentHeader = () => {
    try {
      const session = JSON.parse(localStorage.getItem("ubms_session") || "null");
      return (axios.defaults.headers?.common?.["x-department"]) || session?.department || null;
    } catch {
      return (axios.defaults.headers?.common?.["x-department"]) || null;
    }
  };

  // FETCH DATA
  const fetchBills = useCallback(() => {
    const deptHeader = getDepartmentHeader();
    Promise.all([
      axios.get("http://127.0.0.1:5000/connections", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
      axios.get("http://127.0.0.1:5000/meters", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
      axios.get("http://127.0.0.1:5000/records", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
      axios.get("http://127.0.0.1:5000/bills", { headers: deptHeader ? { "x-department": deptHeader } : {} })
    ])
      .then(([connectionsRes, metersRes, recordsRes, billsRes]) => {
        const filteredConnections = connectionsRes.data.filter(
          (c) => c.service_type === department
        );
        const connectionIds = new Set(filteredConnections.map((c) => Number(c.connection_id)));

        const meterIds = new Set(
          metersRes.data
            .filter((m) => connectionIds.has(Number(m.connection_id)))
            .map((m) => Number(m.meter_id))
        );

        const filteredRecords = recordsRes.data
          .filter((r) => meterIds.has(Number(r.meter_id)))
          .sort((a, b) => Number(a.reading_id) - Number(b.reading_id));

        const filteredBills = billsRes.data
          .filter((b) => connectionIds.has(Number(b.connection_id)))
          .sort((a, b) => Number(a.bill_id) - Number(b.bill_id));

        setConnections(filteredConnections);
        setRecords(filteredRecords);
        setData(filteredBills);
      })
      .catch((err) => console.log(err));
  }, [department]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // HANDLE INPUT
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ADD / UPDATE
  const handleSubmit = async () => {
    setError("");
    
    if (
      !form.bill_number ||
      !form.total_amount ||
      !form.connection_id ||
      !form.reading_id
    ) {
      setError("Fill required fields");
      return;
    }

    // Validate due_date is not in future (if provided)
    if (form.due_date) {
      const dateError = validateDateNotFuture(form.due_date);
      if (dateError) {
        setError(dateError);
        return;
      }
    }

    try {
      if (editId) {
        await axios.put(`http://127.0.0.1:5000/bills/${editId}`, form);
        console.log("Updated");
      } else {
        await axios.post("http://127.0.0.1:5000/bills", form);
        console.log("Added");
      }

      // RESET
      setEditId(null);
      setForm({
        bill_number: "",
        billing_period: "",
        total_amount: "",
        due_date: "",
        payment_status: "Unpaid",
        connection_id: "",
        reading_id: ""
      });
      setShowForm(false);

      fetchBills();

    } catch (err) {
      const message = err?.response?.data?.message || "Failed to save bill";
      const detail = err?.response?.data?.error;
      setError(detail ? `${message}: ${detail}` : message);
    }
  };

  const handleGenerateBill = async () => {
    if (!form.bill_number || !form.connection_id || !form.reading_id || !form.due_date) {
      alert("Bill number, due date, connection and record are required to auto-generate.");
      return;
    }

    try {
      await axios.post("http://127.0.0.1:5000/bills/generate", {
        bill_number: form.bill_number,
        billing_period: form.billing_period,
        due_date: form.due_date,
        connection_id: form.connection_id,
        reading_id: form.reading_id
      });

      setEditId(null);
      setForm({
        bill_number: "",
        billing_period: "",
        total_amount: "",
        due_date: "",
        payment_status: "Unpaid",
        connection_id: "",
        reading_id: ""
      });
      setShowForm(false);
      fetchBills();
      alert("Bill generated from tariff plan successfully");
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to generate bill";
      const detail = err?.response?.data?.error;
      alert(detail ? `${message}: ${detail}` : message);
    }
  };

  // DELETE
  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/bills/${id}`);
      fetchBills();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete bill");
    }
  };

  const handleEditById = (id) => {
    const bill = data.find((b) => Number(b.bill_id) === Number(id));
    if (!bill) {
      alert("Bill not found");
      return;
    }

    setForm({
      bill_number: bill.bill_number,
      billing_period: bill.billing_period,
      total_amount: bill.total_amount,
      due_date: bill.due_date?.split("T")[0],
      payment_status: bill.payment_status,
      connection_id: bill.connection_id,
      reading_id: bill.reading_id
    });
    setEditId(bill.bill_id);
    setShowForm(true);
  };

  const handleDeleteById = async (id) => {
    const bill = data.find((b) => Number(b.bill_id) === Number(id));
    if (!bill) {
      alert("Bill not found");
      return;
    }
    await handleDelete(bill.bill_id);
  };

  const filteredData = data.filter((bill) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const valueMap = {
      bill_id: bill.bill_id,
      bill_number: bill.bill_number
    };

    return String(valueMap[searchField] ?? "").toLowerCase().includes(term);
  });

  return (
    <div>
      <h1>Bills</h1>
      <p style={{ marginTop: "-8px", color: "#3f6761" }}>Department: {department}</p>

      <TableControls
        entityLabel="Bill"
        onInsert={() => {
          setEditId(null);
          setForm({
            bill_number: "",
            billing_period: "",
            total_amount: "",
            due_date: "",
            payment_status: "Unpaid",
            connection_id: "",
            reading_id: ""
          });
          setShowForm(true);
        }}
        onEditById={handleEditById}
        onDeleteById={handleDeleteById}
      />

      <TableSearch
        title="Bills"
        field={searchField}
        term={searchTerm}
        options={[
          { value: "bill_id", label: "ID" },
          { value: "bill_number", label: "Bill Number" }
        ]}
        onFieldChange={setSearchField}
        onTermChange={setSearchTerm}
      />

      <Modal
        open={showForm}
        title={editId ? "Edit Bill" : "Insert Bill"}
        onClose={() => setShowForm(false)}
        footer={(
          <>
            <button type="button" className="modal-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" onClick={handleSubmit}>{editId ? "Update" : "Add"}</button>
            {!editId && (
              <button type="button" onClick={handleGenerateBill}>Generate Auto Amount</button>
            )}
          </>
        )}
      >
        {error && <p style={{color: '#ef4444', fontWeight: 600, marginBottom: '10px'}}>{error}</p>}
        <div className="modal-grid">
          <input
            name="bill_number"
            placeholder="Bill Number"
            value={form.bill_number}
            onChange={handleChange}
          />
          <input
            name="billing_period"
            placeholder="Billing Period"
            value={form.billing_period}
            onChange={handleChange}
          />
          <input
            name="total_amount"
            placeholder="Total Amount"
            value={form.total_amount}
            onChange={handleChange}
          />
          <input
            type="date"
            max={todayDate}
            name="due_date"
            value={form.due_date}
            onChange={handleChange}
          />
          <select
            name="payment_status"
            value={form.payment_status}
            onChange={handleChange}
          >
            <option>Unpaid</option>
            <option>Partial</option>
            <option>Paid</option>
          </select>
          <select
            name="connection_id"
            value={form.connection_id}
            onChange={handleChange}
          >
            <option value="">Select Connection</option>
            {connections.map((c) => (
              <option key={c.connection_id} value={c.connection_id}>
                {c.connection_id}
              </option>
            ))}
          </select>
          <select
            className="full-span"
            name="reading_id"
            value={form.reading_id}
            onChange={handleChange}
          >
            <option value="">Select Record</option>
            {records.map((r) => (
              <option key={r.reading_id} value={r.reading_id}>
                {r.reading_id}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      {/* TABLE */}
      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>ID</th>
            <th>Bill No</th>
            <th>Billing Period</th>
            <th>Amount</th>
            <th>Due Date</th>
            <th>Status</th>
            <th>Connection</th>
            <th>Record</th>
          </tr>
        </thead>

        <tbody>
          {filteredData.map(b => (
            <tr key={b.bill_id}>
              <td>{b.bill_id}</td>
              <td>{b.bill_number}</td>
              <td>{b.billing_period}</td>
              <td>{b.total_amount}</td>
              <td>{b.due_date ? b.due_date.split("T")[0] : ""}</td>
              <td>{b.payment_status}</td>
              <td>{b.connection_id}</td>
              <td>{b.reading_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Bills;