import { useState } from "react";

function TableControls({ entityLabel, onInsert, onEditById, onDeleteById }) {
  const [actionMode, setActionMode] = useState(null);
  const [idValue, setIdValue] = useState("");

  const openPrompt = (mode) => {
    setActionMode(mode);
    setIdValue("");
  };

  const closePrompt = () => {
    setActionMode(null);
    setIdValue("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const id = idValue.trim();
    if (!id) {
      alert("ID is required.");
      return;
    }

    if (actionMode === "edit") {
      onEditById(id);
    }

    if (actionMode === "delete") {
      onDeleteById(id);
    }

    closePrompt();
  };

  return (
    <>
      <div className="table-actions">
        <button type="button" onClick={onInsert}>Insert</button>
        <button type="button" onClick={() => openPrompt("edit")}>Edit</button>
        <button type="button" onClick={() => openPrompt("delete")}>Delete</button>
      </div>

      {actionMode && (
        <div className="modal-overlay" role="presentation" onClick={closePrompt}>
          <div className="modal-card modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{actionMode === "edit" ? `Edit ${entityLabel}` : `Delete ${entityLabel}`}</h3>
              <button type="button" className="modal-close" onClick={closePrompt}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <label className="modal-label">Enter {entityLabel} ID</label>
              <input
                value={idValue}
                onChange={(event) => setIdValue(event.target.value)}
                placeholder={`Enter ${entityLabel} ID`}
              />
              <div className="modal-actions">
                <button type="button" className="modal-secondary" onClick={closePrompt}>Cancel</button>
                <button type="submit">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default TableControls;
