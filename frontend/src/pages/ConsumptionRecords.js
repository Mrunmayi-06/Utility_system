import { useEffect, useState } from "react";
import axios from "axios";
import { getTodayDateString, validateDateNotFuture } from "../utils/dateValidation";

function Records() {
  const [meters, setMeters] = useState([]);
  const [form, setForm] = useState({});
  const [editId] = useState(null);
  const [error, setError] = useState("");
  const todayDate = getTodayDateString();

  useEffect(() => {
    const session = (() => { try { return JSON.parse(localStorage.getItem("ubms_session") || "null"); } catch { return null; } })();
    const deptHeader = (axios.defaults.headers?.common?.["x-department"]) || (session && session.department) || null;

    axios.get("http://127.0.0.1:5000/meters", { headers: deptHeader ? { "x-department": deptHeader } : {} }).then(res => setMeters(res.data));
  }, []);

  const handleSubmit = async () => {
    setError("");
    
    // Validate reading_date is not in future
    const dateError = validateDateNotFuture(form.reading_date);
    if (dateError) {
      setError(dateError);
      return;
    }

    if (editId) {
      await axios.put(`http://127.0.0.1:5000/records/${editId}`, form);
    } else {
      await axios.post("http://127.0.0.1:5000/records", form);
    }
    window.location.reload();
  };

  return (
    <div>
      <h1>Consumption</h1>

      {error && <p style={{color: '#ef4444', fontWeight: 600}}>{error}</p>}
      
      <input placeholder="Current Reading" onChange={e=>setForm({...form, current_reading:e.target.value})}/>
      <input placeholder="Consumption Units" type="number" onChange={e=>setForm({...form, consumption_units:e.target.value})}/>
      <input type="date" max={todayDate} onChange={e=>setForm({...form, reading_date:e.target.value})}/>

      <select onChange={e=>setForm({...form, meter_id:e.target.value})}>
        {meters.map(m=> <option value={m.meter_id}>{m.meter_id}</option>)}
      </select>

      <button onClick={handleSubmit}>Save</button>
    </div>
  );
}

export default Records;