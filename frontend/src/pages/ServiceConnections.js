import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import TableControls from "../components/TableControls";
import Modal from "../components/Modal";
import TableSearch from "../components/TableSearch";

function ServiceConnections({ department }) {
  const [data, setData] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchField, setSearchField] = useState("connection_id");
  const [searchTerm, setSearchTerm] = useState("");
  const [consumerSearchTerm, setConsumerSearchTerm] = useState("");
  const [showConsumerDropdown, setShowConsumerDropdown] = useState(false);

  const [form, setForm] = useState({
    installation_address: "",
    connection_status: "Active",
    consumer_id: ""
  });

  const fetchData = useCallback(() => {
    const session = (() => {
      try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; }
    })();
    const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;

    axios.get("http://127.0.0.1:5000/connections", { headers: deptHeader ? { "x-department": deptHeader } : {} })
      .then((res) => setData(res.data.filter((d) => d.service_type === department)))
      .catch(() => setData([]));
  }, [department]);

  useEffect(() => {
    fetchData();
    fetchConsumers();
  }, [fetchData]);

  const fetchConsumers = () => {
    axios
      .get("http://127.0.0.1:5000/consumers")
      .then((res) => setConsumers(res.data))
      .catch(() => setConsumers([]));
  };

  const getConsumerName = (consumerId) => {
    const consumer = consumers.find((c) => Number(c.consumer_id) === Number(consumerId));
    return consumer ? consumer.name : "-";
  };

  const getFilteredConsumers = () => {
    const term = consumerSearchTerm.trim().toLowerCase();
    if (!term) return [];
    return consumers.filter((c) =>
      c.name.toLowerCase().includes(term) || 
      String(c.consumer_id).includes(term)
    );
  };

  const handleSubmit = async () => {
    try {
      if (editId) {
        await axios.put(`http://127.0.0.1:5000/connections/${editId}`, {
          ...form,
          service_type: department
        });
      } else {
        await axios.post("http://127.0.0.1:5000/connections", {
          ...form,
          service_type: department
        });
      }

      setEditId(null);
      setForm({
        installation_address: "",
        connection_status: "Active",
        consumer_id: ""
      });
      setConsumerSearchTerm("");
      setShowConsumerDropdown(false);
      setShowForm(false);

      fetchData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to save connection");
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/connections/${id}`);
      fetchData();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete connection");
    }
  };

  const handleEditById = (id) => {
    const connection = data.find((d) => Number(d.connection_id) === Number(id));
    if (!connection) {
      alert("Connection not found");
      return;
    }

    const selectedConsumer = consumers.find((c) => Number(c.consumer_id) === Number(connection.consumer_id));
    setForm({
      installation_address: connection.installation_address || "",
      connection_status: connection.connection_status || "Active",
      consumer_id: connection.consumer_id || ""
    });
    setConsumerSearchTerm(selectedConsumer ? selectedConsumer.name : "");
    setEditId(connection.connection_id);
    setShowForm(true);
  };

  const handleDeleteById = async (id) => {
    const connection = data.find((d) => Number(d.connection_id) === Number(id));
    if (!connection) {
      alert("Connection not found");
      return;
    }
    await handleDelete(connection.connection_id);
  };

  const filteredData = data.filter((connection) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const valueMap = {
      connection_id: connection.connection_id,
      consumer_name: getConsumerName(connection.consumer_id),
      installation_address: connection.installation_address
    };

    return String(valueMap[searchField] ?? "").toLowerCase().includes(term);
  });

  return (
    <div>
      <h1>Service Connections</h1>
      <p style={{ marginTop: "-8px", color: "#3f6761" }}>Department: {department}</p>

      <TableControls
        entityLabel="Connection"
        onInsert={() => {
          setEditId(null);
          setForm({
            installation_address: "",
            connection_status: "Active",
            consumer_id: ""
          });
          setConsumerSearchTerm("");
          setShowConsumerDropdown(false);
          setShowForm(true);
        }}
        onEditById={handleEditById}
        onDeleteById={handleDeleteById}
      />

      <TableSearch
        title="Connections"
        field={searchField}
        term={searchTerm}
        options={[
          { value: "connection_id", label: "ID" },
          { value: "consumer_name", label: "Consumer Name" },
          { value: "installation_address", label: "Address" }
        ]}
        onFieldChange={setSearchField}
        onTermChange={setSearchTerm}
      />

      <Modal
        open={showForm}
        title={editId ? "Edit Connection" : "Insert Connection"}
        onClose={() => setShowForm(false)}
        footer={(
          <>
            <button type="button" className="modal-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" onClick={handleSubmit}>{editId ? "Update" : "Add"}</button>
          </>
        )}
      >
        <div className="modal-grid">
          <input
            className="full-span"
            placeholder="Address"
            value={form.installation_address}
            onChange={(e) => setForm({ ...form, installation_address: e.target.value })}
          />
          <select
            value={form.connection_status}
            onChange={(e) => setForm({ ...form, connection_status: e.target.value })}
          >
            <option>Active</option>
            <option>Disconnected</option>
          </select>

          <div style={{ position: "relative", gridColumn: "1 / -1" }}>
            <input
              type="text"
              placeholder="Search Consumer by Name or ID"
              value={consumerSearchTerm}
              onChange={(e) => {
                setConsumerSearchTerm(e.target.value);
                setShowConsumerDropdown(true);
              }}
              onFocus={() => setShowConsumerDropdown(true)}
              style={{ width: "100%", padding: "8px", boxSizing: "border-box" }}
            />
            {showConsumerDropdown && consumerSearchTerm && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                backgroundColor: "white",
                border: "1px solid #ccc",
                borderRadius: "4px",
                zIndex: 1000,
                maxHeight: "200px",
                overflowY: "auto",
                marginTop: "4px"
              }}>
                {getFilteredConsumers().length > 0 ? (
                  getFilteredConsumers().map((c) => (
                    <div
                      key={c.consumer_id}
                      onClick={() => {
                        setForm({ ...form, consumer_id: c.consumer_id });
                        setConsumerSearchTerm(`${c.name} (ID: ${c.consumer_id})`);
                        setShowConsumerDropdown(false);
                      }}
                      style={{
                        padding: "10px",
                        cursor: "pointer",
                        borderBottom: "1px solid #eee",
                        fontSize: "14px"
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = "#f5f5f5"}
                      onMouseLeave={(e) => e.target.style.backgroundColor = "white"}
                    >
                      {c.consumer_id} - {c.name}
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "10px", color: "#999" }}>No consumers found</div>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <table border="1">
        <thead>
          <tr>
            <th>ID</th>
            <th>Installation Address</th>
            <th>Status</th>
            <th>Consumer ID</th>
            <th>Consumer Name</th>
          </tr>
        </thead>
        <tbody>
          {filteredData.map(d => (
            <tr key={d.connection_id}>
              <td>{d.connection_id}</td>
              <td>{d.installation_address}</td>
              <td>{d.connection_status}</td>
              <td>{d.consumer_id}</td>
              <td>{getConsumerName(d.consumer_id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ServiceConnections;