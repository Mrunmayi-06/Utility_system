import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateNotFuture } from "../utils/dateValidation";
import TableControls from "../components/TableControls";
import Modal from "../components/Modal";
import TableSearch from "../components/TableSearch";

function TariffPlans({ department }) {
  const [data, setData] = useState([]);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchField, setSearchField] = useState("tariff_id");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();

  const [form, setForm] = useState({
    consumer_type: "Residential",
    rate_per_unit: "",
    fixed_charge: "",
    tax_percentage: "",
    effective_from: ""
  });

  const fetchData = useCallback(() => {
    const session = (() => { try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; } })();
    const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;

    axios.get("http://127.0.0.1:5000/tariffs", { headers: deptHeader ? { "x-department": deptHeader } : {} })
      .then((res) => {
        const sortedTariffs = res.data
          .filter((t) => t.service_type === department)
          .sort((a, b) => Number(a.tariff_id) - Number(b.tariff_id));
        setData(sortedTariffs);
      })
      .catch(() => setData([]));
  }, [department]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    setError("");
    
    // Validate effective_from is not in future (if provided)
    if (form.effective_from) {
      const dateError = validateDateNotFuture(form.effective_from);
      if (dateError) {
        setError(dateError);
        return;
      }
    }
    
    try {
      if (editId) {
        await axios.put(`http://127.0.0.1:5000/tariffs/${editId}`, {
          ...form,
          service_type: department
        });
      } else {
        await axios.post("http://127.0.0.1:5000/tariffs", {
          ...form,
          service_type: department
        });
      }

      setEditId(null);
      setForm({
        consumer_type: "Residential",
        rate_per_unit: "",
        fixed_charge: "",
        tax_percentage: "",
        effective_from: ""
      });
      setShowForm(false);

      fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save tariff");
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/tariffs/${id}`);
      fetchData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete tariff");
    }
  };

  const handleEditById = (id) => {
    const tariff = data.find((t) => Number(t.tariff_id) === Number(id));
    if (!tariff) {
      alert("Tariff not found");
      return;
    }

    setForm({
      consumer_type: tariff.consumer_type,
      rate_per_unit: tariff.rate_per_unit,
      fixed_charge: tariff.fixed_charge,
      tax_percentage: tariff.tax_percentage,
      effective_from: tariff.effective_from?.split("T")[0] || ""
    });
    setEditId(tariff.tariff_id);
    setShowForm(true);
  };

  const handleDeleteById = async (id) => {
    const tariff = data.find((t) => Number(t.tariff_id) === Number(id));
    if (!tariff) {
      alert("Tariff not found");
      return;
    }
    await handleDelete(tariff.tariff_id);
  };

  const filteredData = data.filter((tariff) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const valueMap = {
      tariff_id: tariff.tariff_id,
      consumer_type: tariff.consumer_type
    };

    return String(valueMap[searchField] ?? "").toLowerCase().includes(term);
  });

  return (
    <div>
      <h1>Tariff Plans</h1>
      <p style={{ marginTop: "-8px", color: "#3f6761" }}>Department: {department}</p>

      <TableControls
        entityLabel="Tariff"
        onInsert={() => {
          setEditId(null);
          setForm({
            consumer_type: "Residential",
            rate_per_unit: "",
            fixed_charge: "",
            tax_percentage: "",
            effective_from: ""
          });
          setShowForm(true);
        }}
        onEditById={handleEditById}
        onDeleteById={handleDeleteById}
      />

      <TableSearch
        title="Tariffs"
        field={searchField}
        term={searchTerm}
        options={[
          { value: "tariff_id", label: "ID" },
          { value: "consumer_type", label: "Consumer Type" }
        ]}
        onFieldChange={setSearchField}
        onTermChange={setSearchTerm}
      />

      <Modal
        open={showForm}
        title={editId ? "Edit Tariff" : "Insert Tariff"}
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
            value={form.consumer_type}
            onChange={(e) => setForm({ ...form, consumer_type: e.target.value })}
          >
            <option>Residential</option>
            <option>Commercial</option>
            <option>Industrial</option>
          </select>
          <input
            placeholder="Rate per Unit"
            value={form.rate_per_unit}
            onChange={(e) => setForm({ ...form, rate_per_unit: e.target.value })}
          />
          <input
            placeholder="Fixed Charge"
            value={form.fixed_charge}
            onChange={(e) => setForm({ ...form, fixed_charge: e.target.value })}
          />
          <input
            placeholder="Tax %"
            value={form.tax_percentage}
            onChange={(e) => setForm({ ...form, tax_percentage: e.target.value })}
          />
          <input
            className="full-span"
            type="date"
            max={todayDate}
            value={form.effective_from}
            onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
          />
        </div>
      </Modal>

      <table border="1">
        <thead>
          <tr>
            <th>ID</th>
            <th>Consumer Type</th>
            <th>Rate</th>
            <th>Charge</th>
            <th>Tax %</th>
            <th>Effective From</th>
          </tr>
        </thead>

        <tbody>
          {filteredData.map(t => (
            <tr key={t.tariff_id}>
              <td>{t.tariff_id}</td>
              <td>{t.consumer_type}</td>
              <td>{t.rate_per_unit}</td>
              <td>{t.fixed_charge}</td>
              <td>{t.tax_percentage}</td>
              <td>{t.effective_from ? t.effective_from.split("T")[0] : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TariffPlans;