function TableSearch({ title, field, term, options, onFieldChange, onTermChange }) {
  return (
    <div className="table-search">
      <span className="table-search-title">Search {title}</span>
      <select value={field} onChange={(event) => onFieldChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        value={term}
        onChange={(event) => onTermChange(event.target.value)}
        placeholder="Type to search"
      />
    </div>
  );
}

export default TableSearch;
