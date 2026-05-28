// Server entry point for the Express API.
// This file contains route handlers and helper utilities used by the frontend.
// Keep sensitive logic (DB access, authorization) here so the client never
// directly communicates with the database.
console.log("THIS IS MY SERVER FILE");
const express = require("express");
const db = require("./db");
const cors = require("cors");

const app = express();

// Middleware setup:
// - CORS: allow cross-origin requests from the frontend during development
// - express.json/express.urlencoded: parse JSON and form bodies into req.body
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 5000;

// sendError: standardize error responses returned to the client
const sendError = (res, message, err, status = 500) =>
  res.status(status).json({ message, error: err?.message || err });

// dbQuery: promise wrapper around `db.query` so we can use async/await style
// throughout server code. Example: const rows = await dbQuery(sql, params)
const dbQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });

// Transaction helpers: beginTransaction, commitTransaction and rollbackTransaction
// are used to ensure groups of related DB changes succeed or fail atomically.
const beginTransaction = () =>
  new Promise((resolve, reject) => {
    db.beginTransaction((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

const commitTransaction = () =>
  new Promise((resolve, reject) => {
    db.commit((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

const rollbackTransaction = () =>
  new Promise((resolve) => {
    db.rollback(() => {
      resolve();
    });
  });

// nextId returns the next numeric id for a table by using MAX(id)+1.
// Note: this is simple but not safe under high-concurrency; prefer
// auto-increment primary keys for production systems.
const nextId = async (tableName, idColumn) => {
  const rows = await dbQuery(
    `SELECT COALESCE(MAX(${idColumn}), 0) + 1 AS next_id FROM ${tableName}`
  );
  return Number(rows[0].next_id);
};

// getReadingTableName: detect whether the DB uses the modern `Reading_Record`
// table name or the legacy `Consumption_Record` name. Cache result for efficiency.
let readingTableCache = null;
const getReadingTableName = async () => {
  if (readingTableCache) {
    return readingTableCache;
  }

  const modern = await dbQuery("SHOW TABLES LIKE 'Reading_Record'");
  if (modern.length) {
    readingTableCache = "Reading_Record";
    return readingTableCache;
  }

  const legacy = await dbQuery("SHOW TABLES LIKE 'Consumption_Record'");
  if (legacy.length) {
    readingTableCache = "Consumption_Record";
    return readingTableCache;
  }

  throw new Error("Reading record table not found");
};

// normalizeSqlDate: accept multiple human-friendly date formats and return
// a normalized 'YYYY-MM-DD' string suitable for SQL insertion, or null.
const normalizeSqlDate = (value) => {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const monthMap = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };

  const shortMonthMatch = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (shortMonthMatch) {
    const [, day, monthName, year] = shortMonthMatch;
    const month = monthMap[monthName.toLowerCase()];
    if (!month) {
      return null;
    }
    return `${year}-${month}-${day.padStart(2, "0")}`;
  }

  return null;
};

// validateDateNotFuture: check if a normalized date (YYYY-MM-DD) is not in the future.
// Returns an error message if the date is in the future, or null if valid.
const validateDateNotFuture = (dateString) => {
  if (!dateString) {
    return null;
  }

  const normalized = normalizeSqlDate(dateString);
  if (!normalized) {
    return "Invalid date format";
  }

  const inputDate = new Date(normalized + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (inputDate > today) {
    return "Date cannot be in the future";
  }

  return null;
};

// Allowed tenancy departments — everything is scoped by department.
const ALLOWED_DEPARTMENTS = ["Electricity", "Gas", "Water"];

// normalizeDepartment: validate and canonicalize department names from headers.
const normalizeDepartment = (value) => {
  if (!value) {
    return null;
  }

  const raw = String(value).trim().toLowerCase();
  const match = ALLOWED_DEPARTMENTS.find((department) => department.toLowerCase() === raw);
  return match || null;
};

// Read department from request header and require it where needed.
const getDepartmentFromRequest = (req) => normalizeDepartment(req.headers["x-department"]);

const requireDepartment = (req, res) => {
  const department = getDepartmentFromRequest(req);
  if (!department) {
    res.status(401).json({ message: "Department authorization is required" });
    return null;
  }
  return department;
};

// ensureWriteAccess: placeholder for permission checks (e.g., roles).
// Currently returns true; keep here so future auth integration is easier.
const ensureWriteAccess = () => {
  return true;
};


const hasConnectionAccess = async (connectionId, department) => {
  const rows = await dbQuery(
    "SELECT connection_id FROM Service_Connection WHERE connection_id = ? AND service_type = ?",
    [connectionId, department]
  );
  return rows.length > 0;
};

const hasConsumerAccess = async (consumerId, department) => {
  const rows = await dbQuery(
    `SELECT DISTINCT c.consumer_id
     FROM Consumer c
     JOIN Service_Connection sc ON sc.consumer_id = c.consumer_id
     WHERE c.consumer_id = ?
       AND sc.service_type = ?
       AND sc.connection_status = 'Active'`,
    [consumerId, department]
  );
  return rows.length > 0;
};

const hasMeterAccess = async (meterId, department) => {
  const rows = await dbQuery(
    `SELECT m.meter_id
     FROM Meter m
     JOIN Service_Connection sc ON sc.connection_id = m.connection_id
     WHERE m.meter_id = ? AND sc.service_type = ?`,
    [meterId, department]
  );
  return rows.length > 0;
};

const hasRecordAccess = async (readingId, department) => {
  const readingTable = await getReadingTableName();
  const rows = await dbQuery(
    `SELECT r.reading_id
     FROM ${readingTable} r
     JOIN Meter m ON m.meter_id = r.meter_id
     JOIN Service_Connection sc ON sc.connection_id = m.connection_id
     WHERE r.reading_id = ? AND sc.service_type = ?`,
    [readingId, department]
  );
  return rows.length > 0;
};

const hasBillAccess = async (billId, department) => {
  const rows = await dbQuery(
    `SELECT b.bill_id
     FROM Bill b
     JOIN Service_Connection sc ON sc.connection_id = b.connection_id
     WHERE b.bill_id = ? AND sc.service_type = ?`,
    [billId, department]
  );
  return rows.length > 0;
};

const hasPaymentAccess = async (paymentId, department) => {
  const rows = await dbQuery(
    `SELECT p.payment_id
     FROM Payment p
     JOIN Bill b ON b.bill_id = p.bill_id
     JOIN Service_Connection sc ON sc.connection_id = b.connection_id
     WHERE p.payment_id = ? AND sc.service_type = ?`,
    [paymentId, department]
  );
  return rows.length > 0;
};

const hasTariffAccess = async (tariffId, department) => {
  const rows = await dbQuery(
    "SELECT tariff_id FROM Tariff_Plan WHERE tariff_id = ? AND service_type = ?",
    [tariffId, department]
  );
  return rows.length > 0;
};

const hasTariffTypeConflict = async ({ department, consumerType, excludeTariffId = null }) => {
  const params = [department, consumerType];
  let sql =
    "SELECT tariff_id FROM Tariff_Plan WHERE service_type = ? AND consumer_type = ?";

  if (excludeTariffId !== null && excludeTariffId !== undefined) {
    sql += " AND tariff_id <> ?";
    params.push(excludeTariffId);
  }

  const rows = await dbQuery(sql, params);
  return rows.length > 0;
};

const syncBillStatus = async (billId) => {
  const totals = await dbQuery(
    "SELECT COALESCE(SUM(amount_paid), 0) AS paid_total FROM Payment WHERE bill_id = ?",
    [billId]
  );
  const bills = await dbQuery("SELECT total_amount FROM Bill WHERE bill_id = ?", [billId]);

  if (!bills.length) {
    return;
  }

  const paidTotal = Number(totals[0].paid_total || 0);
  const totalAmount = Number(bills[0].total_amount || 0);
  let status = "Unpaid";
  if (paidTotal >= totalAmount && totalAmount > 0) {
    status = "Paid";
  } else if (paidTotal > 0 && paidTotal < totalAmount) {
    status = "Partial";
  }

  await dbQuery("UPDATE Bill SET payment_status = ? WHERE bill_id = ?", [status, billId]);
};

const toSqlDate = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toBillingPeriod = (date) => {
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month}-${date.getUTCFullYear()}`;
};

const getServiceCode = (serviceType) => {
  const map = {
    Electricity: "ELE",
    Gas: "GAS",
    Water: "WTR"
  };
  return map[serviceType] || "GEN";
};

const createAutoBillForReading = async ({ reading_id, meter_id, reading_date, consumption_units, department }) => {
  const existingBill = await dbQuery("SELECT bill_id FROM Bill WHERE reading_id = ? LIMIT 1", [reading_id]);
  if (existingBill.length) {
    return { created: false, reason: "Bill already exists", bill_id: existingBill[0].bill_id };
  }

  const connectionRows = await dbQuery(
    `SELECT sc.connection_id, sc.service_type, c.consumer_type
     FROM Meter m
     JOIN Service_Connection sc ON sc.connection_id = m.connection_id
     JOIN Consumer c ON c.consumer_id = sc.consumer_id
     WHERE m.meter_id = ? AND sc.service_type = ?
     LIMIT 1`,
    [meter_id, department]
  );

  if (!connectionRows.length) {
    return { created: false, reason: "No connection found for reading" };
  }

  const connection_id = Number(connectionRows[0].connection_id);
  const service_type = connectionRows[0].service_type;
  const consumer_type = connectionRows[0].consumer_type || "Residential";

  let tariffRows = await dbQuery(
    `SELECT tp.rate_per_unit, tp.fixed_charge, tp.tax_percentage
     FROM Connection_Tariff ct
     JOIN Tariff_Plan tp ON tp.tariff_id = ct.tariff_id
     WHERE ct.connection_id = ?
     ORDER BY ct.start_date DESC
     LIMIT 1`,
    [connection_id]
  );

  if (!tariffRows.length) {
    tariffRows = await dbQuery(
      `SELECT tp.rate_per_unit, tp.fixed_charge, tp.tax_percentage
       FROM Tariff_Plan tp
       WHERE tp.service_type = ? AND tp.consumer_type = ?
       ORDER BY tp.effective_from DESC, tp.tariff_id DESC
       LIMIT 1`,
      [service_type, consumer_type]
    );
  }

  if (!tariffRows.length) {
    return { created: false, reason: "No tariff plan found for this service/consumer type" };
  }

  const ratePerUnit = Number(tariffRows[0].rate_per_unit || 0);
  const fixedCharge = Number(tariffRows[0].fixed_charge || 0);
  const taxPercentage = Number(tariffRows[0].tax_percentage || 0);
  const units = Number(consumption_units || 0);
  const subtotal = units * ratePerUnit + fixedCharge;
  const totalAmount = Number((subtotal + (subtotal * taxPercentage) / 100).toFixed(2));

  const sourceDate = reading_date ? new Date(`${reading_date}T00:00:00Z`) : new Date();
  const dueDate = new Date(sourceDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + 15);

  const bill_id = await nextId("Bill", "bill_id");
  const yyyymm = `${sourceDate.getUTCFullYear()}${String(sourceDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const serviceCode = getServiceCode(service_type);
  const bill_number = `BILL-${serviceCode}-${yyyymm}-${String(bill_id).padStart(4, "0")}`;

  await dbQuery(
    `INSERT INTO Bill (bill_id, bill_number, billing_period, total_amount, due_date, payment_status, connection_id, reading_id)
     VALUES (?, ?, ?, ?, ?, 'Unpaid', ?, ?)`,
    [
      bill_id,
      bill_number,
      toBillingPeriod(sourceDate),
      totalAmount,
      toSqlDate(dueDate),
      connection_id,
      reading_id
    ]
  );

  return { created: true, bill_id };
};

app.get("/", (req, res) => {
  res.send("Backend working");
});
app.get("/test", (req, res) => {
  res.send("TEST OK");
});

// SEARCH: Consumer quick-search endpoint
// - Query param: `q` (partial name, contact, or consumer_id)
// - Requires `x-department` header to scope results to a service type
// - Returns up to 25 matching consumers with connection and unpaid summary
app.get("/search/consumers", async (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const q = String(req.query.q || "").trim();
  if (!q) {
    return res.json([]);
  }

  try {
    const like = `%${q}%`;
    const rows = await dbQuery(
      `SELECT
        c.consumer_id,
        c.name,
        c.contact_no,
        c.address,
        c.consumer_type,
        COUNT(DISTINCT sc.connection_id) AS total_connections,
        COUNT(DISTINCT CASE WHEN sc.connection_status = 'Active' THEN sc.connection_id END) AS active_connections,
        COALESCE(SUM(CASE WHEN b.payment_status = 'Unpaid' THEN b.total_amount ELSE 0 END), 0) AS unpaid_amount
      FROM Consumer c
      JOIN Service_Connection sc ON sc.consumer_id = c.consumer_id
      LEFT JOIN Bill b ON b.connection_id = sc.connection_id
      WHERE sc.service_type = ?
        AND (
          c.name LIKE ? OR
          c.contact_no LIKE ? OR
          CAST(c.consumer_id AS CHAR) LIKE ?
        )
      GROUP BY c.consumer_id, c.name, c.contact_no, c.address, c.consumer_type
      ORDER BY c.name ASC, c.consumer_id ASC
      LIMIT 25`,
      [department, like, like, like]
    );
    res.json(rows);
  } catch (error) {
    return sendError(res, "Failed to search consumers", error);
  }
});

app.get("/consumers/:id/profile", async (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  try {
    const consumerRows = await dbQuery(
      `SELECT DISTINCT c.*
       FROM Consumer c
       JOIN Service_Connection sc ON sc.consumer_id = c.consumer_id
       WHERE c.consumer_id = ? AND sc.service_type = ?`,
      [req.params.id, department]
    );

    if (!consumerRows.length) {
      return res.status(404).json({ message: "Consumer not found" });
    }

    const readingTable = await getReadingTableName();

    const [connections, meters, records, bills, payments, tariffs] = await Promise.all([
      dbQuery(
        `SELECT *
         FROM Service_Connection
         WHERE consumer_id = ? AND service_type = ?
         ORDER BY connection_id ASC`,
        [req.params.id, department]
      ),
      dbQuery(
        `SELECT m.*
         FROM Meter m
         JOIN Service_Connection sc ON sc.connection_id = m.connection_id
         WHERE sc.consumer_id = ? AND sc.service_type = ?
         ORDER BY m.meter_id ASC`,
        [req.params.id, department]
      ),
      dbQuery(
        `SELECT r.*
         FROM ${readingTable} r
         JOIN Meter m ON m.meter_id = r.meter_id
         JOIN Service_Connection sc ON sc.connection_id = m.connection_id
         WHERE sc.consumer_id = ? AND sc.service_type = ?
         ORDER BY r.reading_date DESC, r.reading_id DESC
         LIMIT 24`,
        [req.params.id, department]
      ),
      dbQuery(
        `SELECT b.*
         FROM Bill b
         JOIN Service_Connection sc ON sc.connection_id = b.connection_id
         WHERE sc.consumer_id = ? AND sc.service_type = ?
         ORDER BY b.bill_id DESC
         LIMIT 24`,
        [req.params.id, department]
      ),
      dbQuery(
        `SELECT p.*
         FROM Payment p
         JOIN Bill b ON b.bill_id = p.bill_id
         JOIN Service_Connection sc ON sc.connection_id = b.connection_id
         WHERE sc.consumer_id = ? AND sc.service_type = ?
         ORDER BY p.payment_id DESC
         LIMIT 24`,
        [req.params.id, department]
      ),
      dbQuery(
        `SELECT
          sc.connection_id,
          sc.connection_status,
          ct.connection_tariff_id,
          ct.tariff_id,
          ct.start_date,
          ct.end_date,
          tp.consumer_type,
          tp.rate_per_unit,
          tp.fixed_charge,
          tp.tax_percentage,
          CASE
            WHEN tp.tariff_id IS NULL THEN 'Not Assigned'
            ELSE CONCAT(tp.service_type, ' - ', tp.consumer_type)
          END AS plan_name
         FROM Service_Connection sc
         LEFT JOIN Connection_Tariff ct ON ct.connection_id = sc.connection_id
           AND ct.connection_tariff_id = (
             SELECT MAX(ct2.connection_tariff_id)
             FROM Connection_Tariff ct2
             WHERE ct2.connection_id = sc.connection_id
           )
         LEFT JOIN Tariff_Plan tp ON tp.tariff_id = ct.tariff_id
         WHERE sc.consumer_id = ? AND sc.service_type = ?
         ORDER BY sc.connection_id ASC`,
        [req.params.id, department]
      )
    ]);

    const pendingBills = bills.filter((bill) => String(bill.payment_status).toLowerCase() !== "paid");

    res.json({
      consumer: consumerRows[0],
      connections,
      meters,
      records,
      bills,
      payments,
      tariffs,
      quickStats: {
        totalConnections: connections.length,
        activeConnections: connections.filter((c) => c.connection_status === "Active").length,
        totalMeters: meters.length,
        unpaidBills: pendingBills.length,
        unpaidAmount: Number(
          pendingBills.reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0).toFixed(2)
        )
      }
    });
  } catch (error) {
    return sendError(res, "Failed to fetch consumer profile", error);
  }
});


app.get("/reports/department-summary", async (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  try {
    const from = req.query.from ? normalizeSqlDate(req.query.from) : null;
    const to = req.query.to ? normalizeSqlDate(req.query.to) : null;

    // Validate dates are not in future
    if (from) {
      const fromError = validateDateNotFuture(from);
      if (fromError) {
        return sendError(res, fromError, null, 400);
      }
    }
    if (to) {
      const toError = validateDateNotFuture(to);
      if (toError) {
        return sendError(res, toError, null, 400);
      }
    }

    const dateClause = from && to ? "AND b.due_date BETWEEN ? AND ?" : "";
    const dateParams = from && to ? [from, to] : [];

    const [consumerCount, connectionCount, meterCount, billSummary, paymentSummary] = await Promise.all([
      dbQuery(
        `SELECT COUNT(DISTINCT c.consumer_id) AS count
         FROM Consumer c
         JOIN Service_Connection sc ON sc.consumer_id = c.consumer_id
         WHERE sc.service_type = ?`,
        [department]
      ),
      dbQuery("SELECT COUNT(*) AS count FROM Service_Connection WHERE service_type = ?", [department]),
      dbQuery(
        `SELECT COUNT(*) AS count
         FROM Meter m
         JOIN Service_Connection sc ON sc.connection_id = m.connection_id
         WHERE sc.service_type = ?`,
        [department]
      ),
      dbQuery(
        `SELECT
          COUNT(*) AS total_bills,
          COALESCE(SUM(total_amount), 0) AS total_billed,
          COALESCE(SUM(CASE WHEN payment_status = 'Unpaid' THEN total_amount ELSE 0 END), 0) AS unpaid_amount
         FROM Bill b
         JOIN Service_Connection sc ON sc.connection_id = b.connection_id
         WHERE sc.service_type = ? ${dateClause}`,
        [department, ...dateParams]
      ),
      dbQuery(
        `SELECT COALESCE(SUM(p.amount_paid), 0) AS total_paid
         FROM Payment p
         JOIN Bill b ON b.bill_id = p.bill_id
         JOIN Service_Connection sc ON sc.connection_id = b.connection_id
         WHERE sc.service_type = ?`,
        [department]
      )
    ]);

    res.json({
      department,
      period: from && to ? { from, to } : null,
      consumers: Number(consumerCount[0].count || 0),
      connections: Number(connectionCount[0].count || 0),
      meters: Number(meterCount[0].count || 0),
      totalBills: Number(billSummary[0].total_bills || 0),
      totalBilled: Number(billSummary[0].total_billed || 0),
      unpaidAmount: Number(billSummary[0].unpaid_amount || 0),
      totalPaid: Number(paymentSummary[0].total_paid || 0)
    });
  } catch (error) {
    return sendError(res, "Failed to generate report", error);
  }
});


// DASHBOARD: Aggregated summary metrics for a department
// - Expects `x-department` header to restrict data
// - Returns counts for consumers, connections, active meters, pending bills and total revenue
app.get("/dashboard/summary", async (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  try {
    const [consumers, totalConnections, activeMeters, pendingBills, revenue] = await Promise.all([
      dbQuery(
        `SELECT COUNT(DISTINCT sc.consumer_id) AS count
         FROM Service_Connection sc
         WHERE sc.service_type = ?
           AND sc.connection_status = 'Active'`,
        [department]
      ),
      dbQuery(
        "SELECT COUNT(*) AS count FROM Service_Connection WHERE service_type = ?",
        [department]
      ),
      dbQuery(
        `SELECT COUNT(*) AS count
         FROM Meter m
         JOIN Service_Connection sc ON sc.connection_id = m.connection_id
         WHERE m.meter_status = 'Active' AND sc.service_type = ?`,
        [department]
      ),
      dbQuery(
        `SELECT COUNT(*) AS count
         FROM Bill b
         JOIN Service_Connection sc ON sc.connection_id = b.connection_id
         WHERE b.payment_status = 'Unpaid' AND sc.service_type = ?`,
        [department]
      ),
      dbQuery(
        `SELECT COALESCE(SUM(p.amount_paid), 0) AS total
         FROM Payment p
         JOIN Bill b ON b.bill_id = p.bill_id
         JOIN Service_Connection sc ON sc.connection_id = b.connection_id
         WHERE sc.service_type = ?`,
        [department]
      )
    ]);

    res.json({
      consumers: consumers[0].count,
      totalConnections: totalConnections[0].count,
      activeMeters: activeMeters[0].count,
      pendingBills: pendingBills[0].count,
      totalRevenue: Number(revenue[0].total || 0)
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard summary", error: error.message });
  }
});

//////////////////////////////////////////////////////
// ✅ CONSUMERS
//////////////////////////////////////////////////////

app.get("/consumers", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT DISTINCT c.*
     FROM Consumer c
     JOIN Service_Connection sc ON sc.consumer_id = c.consumer_id
     WHERE sc.service_type = ?
       AND sc.connection_status = 'Active'`,
    [department],
    (err, result) => {
      if (err) return sendError(res, "Failed to fetch consumers", err);
      res.json(result);
    }
  );
});

app.post("/consumers", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { name, address, contact_no, consumer_type, registration_date } = req.body;
  const normalizedRegistrationDate = normalizeSqlDate(registration_date);

  if (!normalizedRegistrationDate) {
    return res.status(400).json({ message: "registration_date is required and must be a valid date" });
  }

  // Validate registration_date is not in future
  const dateError = validateDateNotFuture(normalizedRegistrationDate);
  if (dateError) {
    return res.status(400).json({ message: dateError });
  }

  try {
    const consumer_id = await nextId("Consumer", "consumer_id");
    await dbQuery(
      "INSERT INTO Consumer (consumer_id, name, address, contact_no, consumer_type, registration_date) VALUES (?, ?, ?, ?, ?, ?)",
      [consumer_id, name, address, contact_no, consumer_type, normalizedRegistrationDate]
    );
    res.status(201).json({ message: "Consumer Added", consumer_id });
  } catch (error) {
    res.status(500).json({ message: "Failed to add consumer", error: error.message });
  }
});

app.put("/consumers/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasConsumerAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this consumer" });
  }

  const { name, address, contact_no, consumer_type, registration_date } = req.body;
  const normalizedRegistrationDate = normalizeSqlDate(registration_date);

  if (!normalizedRegistrationDate) {
    return res.status(400).json({ message: "registration_date is required and must be a valid date" });
  }

  // Validate registration_date is not in future
  const dateError = validateDateNotFuture(normalizedRegistrationDate);
  if (dateError) {
    return res.status(400).json({ message: dateError });
  }
  }

  db.query(
    "UPDATE Consumer SET name=?, address=?, contact_no=?, consumer_type=?, registration_date=? WHERE consumer_id=?",
    [name, address, contact_no, consumer_type, normalizedRegistrationDate, req.params.id],
    async (err) => {
      if (err) return sendError(res, "Failed to update consumer", err);
      res.send("Consumer Updated");
    }
  );
});

app.delete("/consumers/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const consumerConnections = await dbQuery(
    "SELECT connection_id FROM Service_Connection WHERE consumer_id = ? AND service_type = ?",
    [req.params.id, department]
  );

  if (!consumerConnections.length) {
    return res.status(403).json({ message: "Access denied for this consumer" });
  }

  const allConnectionRows = await dbQuery(
    "SELECT connection_id FROM Service_Connection WHERE consumer_id = ?",
    [req.params.id]
  );
  const connectionIds = allConnectionRows.map((row) => row.connection_id);

  const meterRows = connectionIds.length
    ? await dbQuery("SELECT meter_id FROM Meter WHERE connection_id IN (?)", [connectionIds])
    : [];
  const meterIds = meterRows.map((row) => row.meter_id);

  const readingTable = await getReadingTableName();
  const readingRows = meterIds.length
    ? await dbQuery(`SELECT reading_id FROM ${readingTable} WHERE meter_id IN (?)`, [meterIds])
    : [];
  const readingIds = readingRows.map((row) => row.reading_id);

  const billRows = connectionIds.length
    ? await dbQuery("SELECT bill_id FROM Bill WHERE connection_id IN (?)", [connectionIds])
    : [];
  const billIds = billRows.map((row) => row.bill_id);

  try {
    await beginTransaction();

    if (billIds.length) {
      await dbQuery("DELETE FROM Payment WHERE bill_id IN (?)", [billIds]);
      await dbQuery("DELETE FROM Bill WHERE bill_id IN (?)", [billIds]);
    }

    if (readingIds.length) {
      await dbQuery(`DELETE FROM ${readingTable} WHERE reading_id IN (?)`, [readingIds]);
    } else if (meterIds.length) {
      await dbQuery(`DELETE FROM ${readingTable} WHERE meter_id IN (?)`, [meterIds]);
    }

    if (meterIds.length) {
      await dbQuery("DELETE FROM Meter WHERE meter_id IN (?)", [meterIds]);
    }

    if (connectionIds.length) {
      await dbQuery("DELETE FROM Connection_Tariff WHERE connection_id IN (?)", [connectionIds]);
      await dbQuery("DELETE FROM Service_Connection WHERE consumer_id = ?", [req.params.id]);
    }

    await dbQuery("DELETE FROM Consumer WHERE consumer_id = ?", [req.params.id]);
    await commitTransaction();
    res.send("Consumer Deleted");
  } catch (err) {
    await rollbackTransaction();
    return res.status(500).json({ message: "Failed to delete consumer", error: err.message });
  }
});

app.get("/consumers/:id", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT DISTINCT c.*
     FROM Consumer c
     JOIN Service_Connection sc ON sc.consumer_id = c.consumer_id
     WHERE c.consumer_id=?
       AND sc.service_type = ?
       AND sc.connection_status = 'Active'`,
    [req.params.id, department],
    (err, result) => {
    if (err) return sendError(res, "Failed to fetch consumer", err);
    if (!result.length) return res.status(404).json({ message: "Consumer not found" });
    res.json(result[0]);
    }
  );
});

//////////////////////////////////////////////////////
// ✅ SERVICE CONNECTIONS
//////////////////////////////////////////////////////

app.get("/connections", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT *
     FROM Service_Connection
     WHERE service_type = ?
     ORDER BY
       CASE WHEN connection_status = 'Disconnected' THEN 1 ELSE 0 END,
       connection_id ASC`,
    [department],
    (err, result) => {
      if (err) return sendError(res, "Failed to fetch connections", err);
      res.json(result);
    }
  );
});

app.post("/connections", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { service_type, installation_address, connection_status, consumer_id } = req.body;

  if (service_type && normalizeDepartment(service_type) !== department) {
    return res.status(403).json({ message: "Cannot create connection for another department" });
  }

  try {
    const connection_id = await nextId("Service_Connection", "connection_id");
    await dbQuery(
      "INSERT INTO Service_Connection (connection_id, service_type, installation_address, connection_status, consumer_id) VALUES (?, ?, ?, ?, ?)",
      [connection_id, department, installation_address, connection_status, consumer_id]
    );
    res.status(201).json({ message: "Connection Added", connection_id });
  } catch (error) {
    res.status(500).json({ message: "Failed to add connection", error: error.message });
  }
});

app.put("/connections/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasConnectionAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this connection" });
  }

  const { service_type, installation_address, connection_status, consumer_id } = req.body;

  if (service_type && normalizeDepartment(service_type) !== department) {
    return res.status(403).json({ message: "Cannot move connection to another department" });
  }

  db.query(
    "UPDATE Service_Connection SET service_type=?, installation_address=?, connection_status=?, consumer_id=? WHERE connection_id=?",
    [department, installation_address, connection_status, consumer_id, req.params.id],
    async (err) => {
      if (err) return sendError(res, "Failed to update connection", err);
      res.send("Connection Updated");
    }
  );
});

app.delete("/connections/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasConnectionAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this connection" });
  }

  db.query("DELETE FROM Service_Connection WHERE connection_id=?", [req.params.id], async (err) => {
    if (err) return res.status(500).json({ message: "Failed to delete connection", error: err.message });
    res.send("Connection Deleted");
  });
});

app.get("/connections/:id", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    "SELECT * FROM Service_Connection WHERE connection_id=? AND service_type = ?",
    [req.params.id, department],
    (err, result) => {
    if (err) return sendError(res, "Failed to fetch connection", err);
    if (!result.length) return res.status(404).json({ message: "Connection not found" });
    res.json(result[0]);
    }
  );
});

//////////////////////////////////////////////////////
// ✅ METERS
//////////////////////////////////////////////////////

app.get("/meters", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT m.*
     FROM Meter m
     JOIN Service_Connection sc ON sc.connection_id = m.connection_id
     WHERE sc.service_type = ?`,
    [department],
    (err, result) => {
      if (err) return sendError(res, "Failed to fetch meters", err);
      res.json(result);
    }
  );
});

app.post("/meters", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { meter_number, installation_date, meter_status, connection_id } = req.body;

  if (!meter_number || !installation_date || !meter_status || !connection_id) {
    return res.status(400).json({ message: "All meter fields are required" });
  }

  // Validate installation_date is not in future
  const normalizedInstallationDate = normalizeSqlDate(installation_date);
  const dateError = validateDateNotFuture(normalizedInstallationDate);
  if (dateError) {
    return res.status(400).json({ message: dateError });
  }

  if (!(await hasConnectionAccess(connection_id, department))) {
    return res.status(403).json({ message: "Access denied for selected connection" });
  }

  nextId("Meter", "meter_id")
    .then((meter_id) => {
      db.query(
        "INSERT INTO Meter (meter_id, meter_number, installation_date, meter_status, connection_id) VALUES (?, ?, ?, ?, ?)",
        [meter_id, meter_number, normalizedInstallationDate, meter_status, connection_id],
        async (err) => {
          if (err) {
            if (err.code === "ER_DUP_ENTRY") {
              return res.status(400).json({
                message: "Meter number already exists or this connection already has a meter"
              });
            }
            if (err.code === "ER_NO_REFERENCED_ROW_2") {
              return res.status(400).json({ message: "Invalid connection selected" });
            }
            return res.status(500).json({ message: "Failed to add meter", error: err.message });
          }
          res.status(201).json({ message: "Meter Added", meter_id });
        }
      );
    })
    .catch((error) => res.status(500).json({ message: "Failed to add meter", error: error.message }));
});

app.put("/meters/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasMeterAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this meter" });
  }

  const { meter_number, installation_date, meter_status, connection_id } = req.body;

  if (!meter_number || !installation_date || !meter_status || !connection_id) {
    return res.status(400).json({ message: "All meter fields are required" });
  }

  if (!(await hasConnectionAccess(connection_id, department))) {
    return res.status(403).json({ message: "Access denied for selected connection" });
  }

  db.query(
    "UPDATE Meter SET meter_number=?, installation_date=?, meter_status=?, connection_id=? WHERE meter_id=?",
    [meter_number, installation_date, meter_status, connection_id, req.params.id],
    async (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({
            message: "Meter number already exists or this connection already has a meter"
          });
        }
        if (err.code === "ER_NO_REFERENCED_ROW_2") {
          return res.status(400).json({ message: "Invalid connection selected" });
        }
        return res.status(500).json({ message: "Failed to update meter", error: err.message });
      }
      res.send("Meter Updated");
    }
  );
});

app.delete("/meters/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasMeterAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this meter" });
  }

  db.query("DELETE FROM Meter WHERE meter_id=?", [req.params.id], async (err) => {
    if (err) return res.status(500).json({ message: "Failed to delete meter", error: err.message });
    res.send("Meter Deleted");
  });
});

app.get("/meters/:id", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT m.*
     FROM Meter m
     JOIN Service_Connection sc ON sc.connection_id = m.connection_id
     WHERE m.meter_id=? AND sc.service_type = ?`,
    [req.params.id, department],
    (err, result) => {
    if (err) return sendError(res, "Failed to fetch meter", err);
    if (!result.length) return res.status(404).json({ message: "Meter not found" });
    res.json(result[0]);
    }
  );
});

//////////////////////////////////////////////////////
// ✅ RECORDS
//////////////////////////////////////////////////////

app.get("/records", async (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  try {
    const readingTable = await getReadingTableName();
    const result = await dbQuery(
      `SELECT r.*
       FROM ${readingTable} r
       JOIN Meter m ON m.meter_id = r.meter_id
       JOIN Service_Connection sc ON sc.connection_id = m.connection_id
       WHERE sc.service_type = ?
       ORDER BY r.reading_id ASC`,
      [department]
    );
    res.json(result);
  } catch (error) {
    return sendError(res, "Failed to fetch records", error);
  }
});

app.post("/records", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { current_reading, consumption_units, reading_date, meter_id } = req.body;

  if (!consumption_units || consumption_units < 0) {
    return res.status(400).json({ message: "Consumption units must be a positive number" });
  }

  // Validate reading_date is not in future
  const normalizedReadingDate = normalizeSqlDate(reading_date);
  const dateError = validateDateNotFuture(normalizedReadingDate);
  if (dateError) {
    return res.status(400).json({ message: dateError });
  }

  try {
    if (!(await hasMeterAccess(meter_id, department))) {
      return res.status(403).json({ message: "Access denied for selected meter" });
    }

    const readingTable = await getReadingTableName();
    const reading_id = await nextId(readingTable, "reading_id");

    await dbQuery(
      `INSERT INTO ${readingTable} (reading_id, current_reading, consumption_units, reading_date, meter_id) VALUES (?, ?, ?, ?, ?)`,
      [reading_id, current_reading, consumption_units, normalizedReadingDate, meter_id]
    );

    const autoBill = await createAutoBillForReading({
      reading_id,
      meter_id,
      reading_date: normalizedReadingDate,
      consumption_units,
      department
    });

    res.status(201).json({
      message: autoBill.created ? "Record Added and Bill Auto Generated" : "Record Added",
      reading_id,
      autoBill
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to add record", error: error.message });
  }
});

app.put("/records/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { current_reading, consumption_units, reading_date, meter_id } = req.body;

  if (!consumption_units || consumption_units < 0) {
    return res.status(400).json({ message: "Consumption units must be a positive number" });
  }

  // Validate reading_date is not in future
  const normalizedReadingDate = normalizeSqlDate(reading_date);
  const dateError = validateDateNotFuture(normalizedReadingDate);
  if (dateError) {
    return res.status(400).json({ message: dateError });
  }

  try {
    if (!(await hasRecordAccess(req.params.id, department))) {
      return res.status(403).json({ message: "Access denied for this record" });
    }

    if (!(await hasMeterAccess(meter_id, department))) {
      return res.status(403).json({ message: "Access denied for selected meter" });
    }

    const readingTable = await getReadingTableName();
    await dbQuery(
      `UPDATE ${readingTable} SET current_reading=?, consumption_units=?, reading_date=?, meter_id=? WHERE reading_id=?`,
      [current_reading, consumption_units, normalizedReadingDate, meter_id, req.params.id]
    );
    res.send("Record Updated");
  } catch (error) {
    return sendError(res, "Failed to update record", error);
  }
});

app.delete("/records/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  try {
    if (!(await hasRecordAccess(req.params.id, department))) {
      return res.status(403).json({ message: "Access denied for this record" });
    }

    const readingTable = await getReadingTableName();
    await dbQuery(`DELETE FROM ${readingTable} WHERE reading_id=?`, [req.params.id]);
    res.send("Record Deleted");
  } catch (error) {
    return sendError(res, "Failed to delete record", error);
  }
});

app.get("/records/:id", async (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  try {
    const readingTable = await getReadingTableName();
    const result = await dbQuery(
      `SELECT r.*
       FROM ${readingTable} r
       JOIN Meter m ON m.meter_id = r.meter_id
       JOIN Service_Connection sc ON sc.connection_id = m.connection_id
       WHERE r.reading_id=? AND sc.service_type = ?`,
      [req.params.id, department]
    );
    if (!result.length) return res.status(404).json({ message: "Record not found" });
    res.json(result[0]);
  } catch (error) {
    return sendError(res, "Failed to fetch record", error);
  }
});

//////////////////////////////////////////////////////
// ✅ BILLS
//////////////////////////////////////////////////////

app.get("/bills", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT b.*
     FROM Bill b
     JOIN Service_Connection sc ON sc.connection_id = b.connection_id
     WHERE sc.service_type = ?
     ORDER BY b.bill_id ASC`,
    [department],
    (err, result) => {
    if (err) {
      return sendError(res, "Failed to fetch bills", err);
    }
    res.json(result);
    }
  );
});

app.get("/bills/:id", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT b.*
     FROM Bill b
     JOIN Service_Connection sc ON sc.connection_id = b.connection_id
     WHERE b.bill_id=? AND sc.service_type = ?`,
    [req.params.id, department],
    (err, result) => {
    if (err) return sendError(res, "Failed to fetch bill", err);
    if (!result.length) return res.status(404).json({ message: "Bill not found" });
    res.json(result[0]);
    }
  );
});

app.post("/bills", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { bill_number, billing_period, total_amount, due_date, payment_status, connection_id, reading_id } = req.body;

  if (!(await hasConnectionAccess(connection_id, department))) {
    return res.status(403).json({ message: "Access denied for selected connection" });
  }

  if (!(await hasRecordAccess(reading_id, department))) {
    return res.status(403).json({ message: "Access denied for selected record" });
  }

  // Validate due_date is not in future (if provided)
  if (due_date) {
    const normalizedDueDate = normalizeSqlDate(due_date);
    const dateError = validateDateNotFuture(normalizedDueDate);
    if (dateError) {
      return res.status(400).json({ message: dateError });
    }
  }

  nextId("Bill", "bill_id")
    .then((bill_id) => {
      const normalizedDueDate = normalizeSqlDate(due_date);
      db.query(
        "INSERT INTO Bill (bill_id, bill_number, billing_period, total_amount, due_date, payment_status, connection_id, reading_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [bill_id, bill_number, billing_period, total_amount, normalizedDueDate, payment_status, connection_id, reading_id],
        async (err) => {
          if (err) return res.status(500).json({ message: "Failed to add bill", error: err.message });
          res.status(201).json({ message: "Bill Added", bill_id });
        }
      );
    })
    .catch((error) => res.status(500).json({ message: "Failed to add bill", error: error.message }));
});

app.post("/bills/generate", async (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { bill_number, billing_period, due_date, connection_id, reading_id } = req.body;

  if (!bill_number || !connection_id || !reading_id || !due_date) {
    return res.status(400).json({ message: "bill_number, connection_id, reading_id and due_date are required" });
  }

  try {
    if (!(await hasConnectionAccess(connection_id, department))) {
      return res.status(403).json({ message: "Access denied for selected connection" });
    }

    if (!(await hasRecordAccess(reading_id, department))) {
      return res.status(403).json({ message: "Access denied for selected record" });
    }

    const readingTable = await getReadingTableName();
    const readingRows = await dbQuery(
      `SELECT consumption_units FROM ${readingTable} WHERE reading_id = ?`,
      [reading_id]
    );

    if (!readingRows.length) {
      return res.status(404).json({ message: "Consumption record not found" });
    }

    const tariffRows = await dbQuery(
      `SELECT tp.rate_per_unit, tp.fixed_charge, tp.tax_percentage
       FROM Connection_Tariff ct
       JOIN Tariff_Plan tp ON tp.tariff_id = ct.tariff_id
       WHERE ct.connection_id = ?
       ORDER BY ct.start_date DESC
       LIMIT 1`,
      [connection_id]
    );

    if (!tariffRows.length) {
      return res.status(404).json({ message: "No tariff plan assigned to this connection" });
    }

    const units = Number(readingRows[0].consumption_units || 0);
    const ratePerUnit = Number(tariffRows[0].rate_per_unit || 0);
    const fixedCharge = Number(tariffRows[0].fixed_charge || 0);
    const taxPercentage = Number(tariffRows[0].tax_percentage || 0);
    const subtotal = units * ratePerUnit + fixedCharge;
    const totalAmount = Number((subtotal + (subtotal * taxPercentage) / 100).toFixed(2));

    const bill_id = await nextId("Bill", "bill_id");
    await dbQuery(
      `INSERT INTO Bill (bill_id, bill_number, billing_period, total_amount, due_date, payment_status, connection_id, reading_id)
       VALUES (?, ?, ?, ?, ?, 'Unpaid', ?, ?)`,
      [bill_id, bill_number, billing_period || null, totalAmount, due_date, connection_id, reading_id]
    );

    const newBill = await dbQuery("SELECT * FROM Bill WHERE bill_id = ?", [bill_id]);
    res.status(201).json(newBill[0]);
  } catch (error) {
    res.status(500).json({ message: "Failed to generate bill", error: error.message });
  }
});

app.put("/bills/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasBillAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this bill" });
  }

  const { bill_number, billing_period, total_amount, due_date, payment_status, connection_id, reading_id } = req.body;

  if (!(await hasConnectionAccess(connection_id, department))) {
    return res.status(403).json({ message: "Access denied for selected connection" });
  }

  if (!(await hasRecordAccess(reading_id, department))) {
    return res.status(403).json({ message: "Access denied for selected record" });
  }

  db.query(
    "UPDATE Bill SET bill_number=?, billing_period=?, total_amount=?, due_date=?, payment_status=?, connection_id=?, reading_id=? WHERE bill_id=?",
    [bill_number, billing_period, total_amount, due_date, payment_status, connection_id, reading_id, req.params.id],
    async (err) => {
      if (err) return res.send(err);
      res.send("Bill Updated");
    }
  );
});

app.delete("/bills/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasBillAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this bill" });
  }

  db.query("DELETE FROM Bill WHERE bill_id=?", [req.params.id], async (err) => {
    if (err) return res.status(500).json({ message: "Failed to delete bill", error: err.message });
    res.send("Bill Deleted");
  });
});

//////////////////////////////////////////////////////
// ✅ PAYMENTS
//////////////////////////////////////////////////////

app.get("/payments", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT p.*
     FROM Payment p
     JOIN Bill b ON b.bill_id = p.bill_id
     JOIN Service_Connection sc ON sc.connection_id = b.connection_id
     WHERE sc.service_type = ?`,
    [department],
    (err, result) => {
      if (err) return sendError(res, "Failed to fetch payments", err);
      res.json(result);
    }
  );
});

app.get("/payments/:id", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT p.*
     FROM Payment p
     JOIN Bill b ON b.bill_id = p.bill_id
     JOIN Service_Connection sc ON sc.connection_id = b.connection_id
     WHERE p.payment_id=? AND sc.service_type = ?`,
    [req.params.id, department],
    (err, result) => {
    if (err) return sendError(res, "Failed to fetch payment", err);
    if (!result.length) return res.status(404).json({ message: "Payment not found" });
    res.json(result[0]);
    }
  );
});

app.post("/payments", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { payment_date, amount_paid, payment_mode, bill_id } = req.body;

  // Validate payment_date is not in future
  const normalizedPaymentDate = normalizeSqlDate(payment_date);
  const dateError = validateDateNotFuture(normalizedPaymentDate);
  if (dateError) {
    return res.status(400).json({ message: dateError });
  }

  try {
    if (!(await hasBillAccess(bill_id, department))) {
      return res.status(403).json({ message: "Access denied for selected bill" });
    }

    const payment_id = await nextId("Payment", "payment_id");
    await dbQuery(
      "INSERT INTO Payment (payment_id, payment_date, amount_paid, payment_mode, bill_id) VALUES (?, ?, ?, ?, ?)",
      [payment_id, normalizedPaymentDate, amount_paid, payment_mode, bill_id]
    );
    await syncBillStatus(bill_id);
    res.status(201).json({ payment_id, message: "Payment Added" });
  } catch (error) {
    res.status(500).json({ message: "Failed to add payment", error: error.message });
  }
});

app.put("/payments/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasPaymentAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this payment" });
  }

  const { payment_date, amount_paid, payment_mode, bill_id } = req.body;
  try {
    if (!(await hasBillAccess(bill_id, department))) {
      return res.status(403).json({ message: "Access denied for selected bill" });
    }

    const existing = await dbQuery("SELECT bill_id FROM Payment WHERE payment_id = ?", [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: "Payment not found" });
    }

    await dbQuery(
      "UPDATE Payment SET payment_date=?, amount_paid=?, payment_mode=?, bill_id=? WHERE payment_id=?",
      [payment_date, amount_paid, payment_mode, bill_id, req.params.id]
    );

    await syncBillStatus(existing[0].bill_id);
    if (Number(existing[0].bill_id) !== Number(bill_id)) {
      await syncBillStatus(bill_id);
    }

    res.json({ message: "Payment Updated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update payment", error: error.message });
  }
});

app.delete("/payments/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasPaymentAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this payment" });
  }

  try {
    const existing = await dbQuery("SELECT bill_id FROM Payment WHERE payment_id = ?", [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ message: "Payment not found" });
    }

    await dbQuery("DELETE FROM Payment WHERE payment_id=?", [req.params.id]);
    await syncBillStatus(existing[0].bill_id);
    res.json({ message: "Payment Deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete payment", error: error.message });
  }
});

//////////////////////////////////////////////////////
// ✅ TARIFF PLANS
//////////////////////////////////////////////////////

app.get("/tariffs", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT
      tariff_id,
      tariff_id AS plan_id,
      CONCAT(service_type, ' - ', consumer_type) AS plan_name,
      service_type,
      consumer_type,
      rate_per_unit,
      fixed_charge,
      tax_percentage,
      effective_from
    FROM Tariff_Plan
    WHERE service_type = ?
    ORDER BY tariff_id ASC`,
      [department],
    (err, result) => {
    if (err) return sendError(res, "Failed to fetch tariffs", err);
    res.json(result);
    }
  );
});

app.get("/tariffs/:id", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT
      tariff_id,
      tariff_id AS plan_id,
      CONCAT(service_type, ' - ', consumer_type) AS plan_name,
      service_type,
      consumer_type,
      rate_per_unit,
      fixed_charge,
      tax_percentage,
      effective_from
     FROM Tariff_Plan
     WHERE tariff_id = ? AND service_type = ?`,
    [req.params.id, department],
    (err, result) => {
      if (err) return sendError(res, "Failed to fetch tariff", err);
      if (!result.length) return res.status(404).json({ message: "Tariff not found" });
      res.json(result[0]);
    }
  );
});

app.post("/tariffs", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const {
    service_type = department,
    consumer_type = "Residential",
    rate_per_unit,
    fixed_charge,
    tax_percentage = 0,
    effective_from
  } = req.body;

  try {
    if (normalizeDepartment(service_type) !== department) {
      return res.status(403).json({ message: "Cannot create tariff for another department" });
    }

    if (await hasTariffTypeConflict({ department, consumerType: consumer_type })) {
      return res.status(409).json({ message: `A tariff already exists for ${consumer_type} in ${department}` });
    }

    const tariff_id = await nextId("Tariff_Plan", "tariff_id");
    await dbQuery(
      `INSERT INTO Tariff_Plan
      (tariff_id, service_type, consumer_type, rate_per_unit, fixed_charge, tax_percentage, effective_from)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        tariff_id,
        service_type,
        consumer_type,
        rate_per_unit,
        fixed_charge,
        tax_percentage,
        effective_from || null
      ]
    );
    res.status(201).json({ message: "Tariff Added", tariff_id });
  } catch (error) {
    res.status(500).json({ message: "Failed to add tariff", error: error.message });
  }
});

app.put("/tariffs/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  if (!(await hasTariffAccess(req.params.id, department))) {
    return res.status(403).json({ message: "Access denied for this tariff" });
  }

  const {
    service_type,
    consumer_type,
    rate_per_unit,
    fixed_charge,
    tax_percentage,
    effective_from
  } = req.body;

  try {
    const normalizedConsumerType = consumer_type || (await dbQuery(
      "SELECT consumer_type FROM Tariff_Plan WHERE tariff_id = ? AND service_type = ?",
      [req.params.id, department]
    ))[0]?.consumer_type;

    if (normalizedConsumerType && await hasTariffTypeConflict({ department, consumerType: normalizedConsumerType, excludeTariffId: Number(req.params.id) })) {
      return res.status(409).json({ message: `A tariff already exists for ${normalizedConsumerType} in ${department}` });
    }

    await dbQuery(
      `UPDATE Tariff_Plan
       SET service_type=?, consumer_type=?, rate_per_unit=?, fixed_charge=?, tax_percentage=?, effective_from=?
       WHERE tariff_id=?`,
      [
        department,
        consumer_type,
        rate_per_unit,
        fixed_charge,
        tax_percentage,
        effective_from || null,
        req.params.id
      ]
    );
    res.json({ message: "Tariff Updated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update tariff", error: error.message });
  }
});

app.delete("/tariffs/:id", (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  hasTariffAccess(req.params.id, department)
    .then((allowed) => {
      if (!allowed) {
        return res.status(403).json({ message: "Access denied for this tariff" });
      }
      dbQuery(
        `DELETE ct
         FROM Connection_Tariff ct
         JOIN Service_Connection sc ON sc.connection_id = ct.connection_id
         WHERE ct.tariff_id = ? AND sc.service_type = ?`,
        [req.params.id, department]
      )
        .then(() => dbQuery("DELETE FROM Tariff_Plan WHERE tariff_id=?", [req.params.id]))
        .then(() => res.send("Tariff Deleted"))
        .catch((error) => {
          res.status(500).json({ message: "Failed to delete tariff", error: error.message });
        });
    })
    .catch((error) => sendError(res, "Failed to delete tariff", error));
});

//////////////////////////////////////////////////////
// ✅ CONNECTION TARIFF
//////////////////////////////////////////////////////

app.get("/connection-tariffs", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT
      ct.connection_tariff_id,
      ct.connection_id,
      ct.tariff_id,
      ct.tariff_id AS plan_id,
      ct.start_date,
      ct.start_date AS effective_from,
      ct.end_date,
      CONCAT(tp.service_type, ' - ', tp.consumer_type) AS plan_name
     FROM Connection_Tariff ct
     JOIN Service_Connection sc ON sc.connection_id = ct.connection_id
     LEFT JOIN Tariff_Plan tp ON tp.tariff_id = ct.tariff_id
     WHERE sc.service_type = ?
    ORDER BY ct.connection_tariff_id ASC`,
    [department],
    (err, result) => {
      if (err) return sendError(res, "Failed to fetch connection tariffs", err);
      res.json(result);
    }
  );
});

app.get("/connection-tariffs/:id", (req, res) => {
  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `SELECT
      ct.connection_tariff_id,
      ct.connection_id,
      ct.tariff_id,
      ct.tariff_id AS plan_id,
      ct.start_date,
      ct.start_date AS effective_from,
      ct.end_date,
      CONCAT(tp.service_type, ' - ', tp.consumer_type) AS plan_name
     FROM Connection_Tariff ct
     JOIN Service_Connection sc ON sc.connection_id = ct.connection_id
     LEFT JOIN Tariff_Plan tp ON tp.tariff_id = ct.tariff_id
     WHERE ct.connection_tariff_id = ? AND sc.service_type = ?`,
    [req.params.id, department],
    (err, result) => {
      if (err) return sendError(res, "Failed to fetch connection tariff", err);
      if (!result.length) return res.status(404).json({ message: "Connection tariff not found" });
      res.json(result[0]);
    }
  );
});

app.post("/connection-tariffs", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { connection_id, plan_id, tariff_id, effective_from, start_date, end_date } = req.body;

  try {
    if (!(await hasConnectionAccess(connection_id, department))) {
      return res.status(403).json({ message: "Access denied for selected connection" });
    }

    const selectedTariffId = tariff_id || plan_id;
    if (!(await hasTariffAccess(selectedTariffId, department))) {
      return res.status(403).json({ message: "Access denied for selected tariff" });
    }

    const connection_tariff_id = await nextId("Connection_Tariff", "connection_tariff_id");
    await dbQuery(
      `INSERT INTO Connection_Tariff (connection_tariff_id, start_date, end_date, connection_id, tariff_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        connection_tariff_id,
        start_date || effective_from || null,
        end_date || null,
        connection_id,
        tariff_id || plan_id
      ]
    );
    res.status(201).json({ message: "Connection Tariff Added", connection_tariff_id });
  } catch (error) {
    res.status(500).json({ message: "Failed to add connection tariff", error: error.message });
  }
});

app.put("/connection-tariffs/:id", async (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  const { connection_id, plan_id, tariff_id, effective_from, start_date, end_date } = req.body;

  try {
    const existing = await dbQuery(
      `SELECT ct.connection_tariff_id
       FROM Connection_Tariff ct
       JOIN Service_Connection sc ON sc.connection_id = ct.connection_id
       WHERE ct.connection_tariff_id = ? AND sc.service_type = ?`,
      [req.params.id, department]
    );
    if (!existing.length) {
      return res.status(403).json({ message: "Access denied for this connection tariff" });
    }

    if (!(await hasConnectionAccess(connection_id, department))) {
      return res.status(403).json({ message: "Access denied for selected connection" });
    }

    const selectedTariffId = tariff_id || plan_id;
    if (!(await hasTariffAccess(selectedTariffId, department))) {
      return res.status(403).json({ message: "Access denied for selected tariff" });
    }

    await dbQuery(
      `UPDATE Connection_Tariff
       SET connection_id=?, tariff_id=?, start_date=?, end_date=?
       WHERE connection_tariff_id=?`,
      [
        connection_id,
        tariff_id || plan_id,
        start_date || effective_from || null,
        end_date || null,
        req.params.id
      ]
    );
    res.json({ message: "Connection Tariff Updated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update connection tariff", error: error.message });
  }
});

app.delete("/connection-tariffs/:id", (req, res) => {
  if (!ensureWriteAccess(req, res)) {
    return;
  }

  const department = requireDepartment(req, res);
  if (!department) {
    return;
  }

  db.query(
    `DELETE ct
     FROM Connection_Tariff ct
     JOIN Service_Connection sc ON sc.connection_id = ct.connection_id
     WHERE ct.connection_tariff_id=? AND sc.service_type = ?`,
    [req.params.id, department],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Failed to delete connection tariff", error: err.message });
      if (!result.affectedRows) {
        return res.status(403).json({ message: "Access denied for this connection tariff" });
      }
      res.send("Connection Tariff Deleted");
    }
  );
});

//////////////////////////////////////////////////////

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});