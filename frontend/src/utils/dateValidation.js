// Date validation utilities for preventing future date entry

/**
 * Get today's date formatted as YYYY-MM-DD for HTML date input max attribute
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date string (YYYY-MM-DD format) is in the future
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {boolean} true if date is in the future, false otherwise
 */
export function isFutureDate(dateString) {
  if (!dateString) return false;
  const selectedDate = new Date(dateString + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selectedDate > today;
}

/**
 * Validate date is not in the future
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string|null} Error message if invalid, null if valid
 */
export function validateDateNotFuture(dateString) {
  if (!dateString) return null;
  if (isFutureDate(dateString)) {
    return "Date cannot be in the future";
  }
  return null;
}

/**
 * Validate date range - both dates must not be in future
 * @param {string} fromDate - Start date in YYYY-MM-DD format
 * @param {string} toDate - End date in YYYY-MM-DD format
 * @returns {string|null} Error message if invalid, null if valid
 */
export function validateDateRange(fromDate, toDate) {
  if (fromDate && isFutureDate(fromDate)) {
    return "Start date cannot be in the future";
  }
  if (toDate && isFutureDate(toDate)) {
    return "End date cannot be in the future";
  }
  if (fromDate && toDate) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (from > to) {
      return "Start date must be before end date";
    }
  }
  return null;
}
