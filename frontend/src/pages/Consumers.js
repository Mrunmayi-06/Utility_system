// React and HTTP client
import { useEffect, useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateNotFuture } from "../utils/dateValidation";

// Shared UI components used across pages
import TableControls from "../components/TableControls";
import Modal from "../components/Modal";
import TableSearch from "../components/TableSearch";

function Consumers() {
  // Local component state
  // `data`: consumer rows fetched from API
  const [data, setData] = useState([]);
  // `showForm`: controls modal visibility for insert/edit
  const [showForm, setShowForm] = useState(false);
  // `searchField` / `searchTerm`: client-side filtering controls
  const [searchField, setSearchField] = useState("consumer_id");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    name: "",
    address: "",
    contact_no: "",
    consumer_type: "Residential",
    registration_date: ""
  });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();

  // On mount fetch the consumer list once.
  useEffect(() => {
    fetchConsumers();
  }, []);

  // fetchConsumers: loads consumers from the backend API.
  // It tries to use a globally set axios default header first, then falls
  // back to parsing `localStorage.ubms_session` for the department value.
  // The department is sent as `x-department` to scope the results.
  const fetchConsumers = () => {
    const session = (() => {
      try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; }
    })();
    const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;

    axios.get("http://127.0.0.1:5000/consumers", { headers: deptHeader ? { "x-department": deptHeader } : {} })
      .then(res => setData(res.data))
      .catch(() => setData([]));
  };

  // Generic handler for controlled form inputs used in the modal.
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // handleSubmit: validate and send create/update requests to the API.
  // Uses POST for create and PUT for update (when editId is set).
  const handleSubmit = async () => {
    if (!form.name || !form.address || !form.registration_date) {
      setError("Fill all fields");
      return;
    }

    // Validate registration_date is not in future
    const dateError = validateDateNotFuture(form.registration_date);
    if (dateError) {
      setError(dateError);
      return;
    }

    try {
      if (editId) {
        await axios.put(`http://127.0.0.1:5000/consumers/${editId}`, form);
        console.log("Updated");
      } else {
        await axios.post("http://127.0.0.1:5000/consumers", form);
        console.log("Added");
      }

      // reset form state and refresh list
      setEditId(null);
      setForm({
        name: "",
        address: "",
        contact_no: "",
        consumer_type: "Residential",
        registration_date: ""
      });
      setShowForm(false);
      setError("");

      fetchConsumers();

    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save consumer");
    }
  };

  // Delete consumer by id and refresh the list.
  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/consumers/${id}`);
      fetchConsumers();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete consumer");
    }
  };

  // Pre-fill the modal form with existing consumer data for editing.
  const handleEditById = (id) => {
    const consumer = data.find((c) => Number(c.consumer_id) === Number(id));
    if (!consumer) {
      alert("Consumer not found");
      return;
    }

    setForm({
      name: consumer.name,
      address: consumer.address,
      contact_no: consumer.contact_no,
      consumer_type: consumer.consumer_type,
      registration_date: consumer.registration_date?.split("T")[0] || ""
    });
    setEditId(consumer.consumer_id);
    setShowForm(true);
  };

  const handleDeleteById = async (id) => {
    const consumer = data.find((c) => Number(c.consumer_id) === Number(id));
    if (!consumer) {
      alert("Consumer not found");
      return;
    }
    await handleDelete(consumer.consumer_id);
  };

  // Client-side filtering for quick search responsiveness.
  const filteredData = data.filter((consumer) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const valueMap = {
      consumer_id: consumer.consumer_id,
      name: consumer.name
    };

    return String(valueMap[searchField] ?? "").toLowerCase().includes(term);
  });

  return (
    <div>
      <h1>Consumers</h1>

      <TableControls
        entityLabel="Consumer"
        onInsert={() => {
          setEditId(null);
          setForm({
            name: "",
            address: "",
            contact_no: "",
            consumer_type: "Residential",
            registration_date: ""
          });
          setShowForm(true);
        }}
        onEditById={handleEditById}
        onDeleteById={handleDeleteById}
      />

      <TableSearch
        title="Consumers"
        field={searchField}
        term={searchTerm}
        options={[
          { value: "consumer_id", label: "ID" },
          { value: "name", label: "Name" }
        ]}
        onFieldChange={setSearchField}
        onTermChange={setSearchTerm}
      />

      <Modal
        open={showForm}
        title={editId ? "Edit Consumer" : "Insert Consumer"}
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
            name="name"
            placeholder="Name"
            value={form.name}
            onChange={handleChange}
          />
          <input
            className="full-span"
            name="address"
            placeholder="Address"
            value={form.address}
            onChange={handleChange}
          />
          <input
            name="contact_no"
            placeholder="Contact"
            value={form.contact_no}
            onChange={handleChange}
          />
          <select
            name="consumer_type"
            value={form.consumer_type}
            onChange={handleChange}
          >
            <option>Residential</option>
            <option>Commercial</option>
            <option>Industrial</option>
          </select>
          <input
            className="full-span"
            type="date"
            max={todayDate}
            name="registration_date"
            value={form.registration_date}
            onChange={handleChange}
          />
        </div>
      </Modal>

      {/* TABLE */}
      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Address</th>
            <th>Contact</th>
            <th>Type</th>
            <th>Registration Date</th>
          </tr>
        </thead>

        <tbody>
          {filteredData.map((c) => (
            <tr key={c.consumer_id}>
              <td>{c.consumer_id}</td>
              <td>{c.name}</td>
              <td>{c.address}</td>
              <td>{c.contact_no}</td>
              <td>{c.consumer_type}</td>
              <td>{c.registration_date ? c.registration_date.split("T")[0] : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Consumers;