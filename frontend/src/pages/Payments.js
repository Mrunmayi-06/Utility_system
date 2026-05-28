import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateNotFuture } from "../utils/dateValidation";
import TableControls from "../components/TableControls";
import Modal from "../components/Modal";
import TableSearch from "../components/TableSearch";

function Payments({ department }) {
  const [data, setData] = useState([]);
  const [bills, setBills] = useState([]);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchField, setSearchField] = useState("payment_id");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();
  const [form, setForm] = useState({
    payment_date: "",
    amount_paid: "",
    payment_mode: "Cash",
    bill_id: ""
  });
  const session = (() => { try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; } })();
  const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;

  const fetchData = useCallback(() => {
    Promise.all([
        axios.get("http://127.0.0.1:5000/connections", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
        axios.get("http://127.0.0.1:5000/bills", { headers: deptHeader ? { "x-department": deptHeader } : {} }),
        axios.get("http://127.0.0.1:5000/payments", { headers: deptHeader ? { "x-department": deptHeader } : {} })
    ])
      .then(([connectionsRes, billsRes, paymentsRes]) => {
        const connectionIds = new Set(
          connectionsRes.data
            .filter((c) => c.service_type === department)
            .map((c) => Number(c.connection_id))
        );

        const filteredBills = billsRes.data.filter((b) =>
          connectionIds.has(Number(b.connection_id))
        );
        const billIds = new Set(filteredBills.map((b) => Number(b.bill_id)));

        const filteredPayments = paymentsRes.data.filter((p) =>
          billIds.has(Number(p.bill_id))
        );

        setBills(filteredBills);
        setData(filteredPayments);
      })
      .catch(() => {
        setBills([]);
        setData([]);
      });
  }, [department, deptHeader]);

      
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    setError("");
    
    if (!form.payment_date || !form.amount_paid || !form.bill_id) {
      setError("Fill all required fields");
      return;
    }

    // Validate payment_date is not in future
    const dateError = validateDateNotFuture(form.payment_date);
    if (dateError) {
      setError(dateError);
      return;
    }

    try {
      if (editId) {
        await axios.put(`http://127.0.0.1:5000/payments/${editId}`, form);
      } else {
        await axios.post("http://127.0.0.1:5000/payments", form);
      }

      setEditId(null);
      setForm({
        payment_date: "",
        amount_paid: "",
        payment_mode: "Cash",
        bill_id: ""
      });
      setShowForm(false);
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save payment");
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/payments/${id}`);
      fetchData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete payment");
    }
  };

  const handleEditById = (id) => {
    const payment = data.find((p) => Number(p.payment_id) === Number(id));
    if (!payment) {
      alert("Payment not found");
      return;
    }

    setForm({
      payment_date: payment.payment_date?.split("T")[0],
      amount_paid: payment.amount_paid,
      payment_mode: payment.payment_mode || "Cash",
      bill_id: String(payment.bill_id)
    });
    setEditId(payment.payment_id);
    setShowForm(true);
  };

  const handleDeleteById = async (id) => {
    const payment = data.find((p) => Number(p.payment_id) === Number(id));
    if (!payment) {
      alert("Payment not found");
      return;
    }
    await handleDelete(payment.payment_id);
  };

  const getBillNumber = (billId) => {
    const bill = bills.find((item) => Number(item.bill_id) === Number(billId));
    return bill ? bill.bill_number : "";
  };

  const filteredData = data.filter((payment) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const valueMap = {
      payment_id: payment.payment_id,
      bill_number: getBillNumber(payment.bill_id)
    };

    return String(valueMap[searchField] ?? "").toLowerCase().includes(term);
  });

  return (
    <div>
      <h1>Payments</h1>
      <p style={{ marginTop: "-8px", color: "#3f6761" }}>Department: {department}</p>

      <TableControls
        entityLabel="Payment"
        onInsert={() => {
          setEditId(null);
          setForm({
            payment_date: "",
            amount_paid: "",
            payment_mode: "Cash",
            bill_id: ""
          });
          setShowForm(true);
        }}
        onEditById={handleEditById}
        onDeleteById={handleDeleteById}
      />

      <TableSearch
        title="Payments"
        field={searchField}
        term={searchTerm}
        options={[
          { value: "payment_id", label: "ID" },
          { value: "bill_number", label: "Bill Number" }
        ]}
        onFieldChange={setSearchField}
        onTermChange={setSearchTerm}
      />

      <Modal
        open={showForm}
        title={editId ? "Edit Payment" : "Insert Payment"}
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
            type="date"
            max={todayDate}
            value={form.payment_date}
            onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
          />
          <input
            placeholder="Amount"
            value={form.amount_paid}
            onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
          />
          <select
            value={form.payment_mode}
            onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
          >
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
            <option value="NetBanking">Net Banking</option>
          </select>
          <select
            className="full-span"
            value={form.bill_id}
            onChange={(e) => setForm({ ...form, bill_id: e.target.value })}
          >
            <option value="">Select Bill</option>
            {bills.map((b) => (
              <option key={b.bill_id} value={b.bill_id}>
                {b.bill_id} - {b.bill_number} ({b.payment_status})
              </option>
            ))}
          </select>
        </div>
      </Modal>

      <table border="1" cellPadding="10" style={{ marginTop: "20px" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Mode</th>
            <th>Bill ID</th>
          </tr>
        </thead>
        <tbody>
          {filteredData.map((p) => (
            <tr key={p.payment_id}>
              <td>{p.payment_id}</td>
              <td>{p.payment_date?.split("T")[0]}</td>
              <td>{p.amount_paid}</td>
              <td>{p.payment_mode}</td>
              <td>{p.bill_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Payments;