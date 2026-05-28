const db = require("./db");

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

async function nextId(tableName, idColumn) {
  const rows = await dbQuery(
    `SELECT COALESCE(MAX(${idColumn}), 0) + 1 AS next_id FROM ${tableName}`
  );
  return Number(rows[0].next_id);
}

async function ensureConsumer() {
  const existing = await dbQuery(
    "SELECT consumer_id FROM Consumer WHERE contact_no = ? LIMIT 1",
    ["9000000001"]
  );
  if (existing.length) return existing[0].consumer_id;

  const consumerId = await nextId("Consumer", "consumer_id");
  await dbQuery(
    `INSERT INTO Consumer (consumer_id, name, address, contact_no, consumer_type, registration_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [consumerId, "Seed Consumer", "Seed Street, City", "9000000001", "Residential", "2026-04-01"]
  );
  return consumerId;
}

async function ensureConnection(consumerId) {
  const existing = await dbQuery(
    "SELECT connection_id FROM Service_Connection WHERE consumer_id = ? LIMIT 1",
    [consumerId]
  );
  if (existing.length) return existing[0].connection_id;

  const connectionId = await nextId("Service_Connection", "connection_id");
  await dbQuery(
    `INSERT INTO Service_Connection (connection_id, service_type, installation_address, connection_status, consumer_id)
     VALUES (?, ?, ?, ?, ?)`,
    [connectionId, "Electricity", "Seed Street, City", "Active", consumerId]
  );
  return connectionId;
}

async function ensureMeter(connectionId) {
  const existing = await dbQuery(
    "SELECT meter_id FROM Meter WHERE connection_id = ? LIMIT 1",
    [connectionId]
  );
  if (existing.length) return existing[0].meter_id;

  const meterNumber = `MTR-SEED-${connectionId}`;
  const meterId = await nextId("Meter", "meter_id");
  await dbQuery(
    `INSERT INTO Meter (meter_id, meter_number, installation_date, meter_status, connection_id)
     VALUES (?, ?, ?, ?, ?)`,
    [meterId, meterNumber, "2026-04-01", "Active", connectionId]
  );
  return meterId;
}

async function ensureRecord(meterId) {
  const existing = await dbQuery(
    "SELECT reading_id FROM Reading_Record WHERE meter_id = ? ORDER BY reading_date DESC LIMIT 1",
    [meterId]
  );
  if (existing.length) return existing[0].reading_id;

  const current = 1325;
  const units = 125;

  const readingId = await nextId("Reading_Record", "reading_id");
  await dbQuery(
    `INSERT INTO Reading_Record (reading_id, current_reading, consumption_units, reading_date, meter_id)
     VALUES (?, ?, ?, ?, ?)`,
    [readingId, current, units, "2026-04-05", meterId]
  );
  return readingId;
}

async function ensureTariffPlan() {
  const existing = await dbQuery(
    `SELECT tariff_id
     FROM Tariff_Plan
     WHERE service_type = ? AND consumer_type = ?
     ORDER BY effective_from DESC
     LIMIT 1`,
    ["Electricity", "Residential"]
  );
  if (existing.length) return existing[0].tariff_id;

  const tariffId = await nextId("Tariff_Plan", "tariff_id");
  await dbQuery(
    `INSERT INTO Tariff_Plan
      (tariff_id, service_type, consumer_type, rate_per_unit, fixed_charge, tax_percentage, effective_from)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tariffId, "Electricity", "Residential", 6.5, 100, 5, "2026-04-01"]
  );
  return tariffId;
}

async function ensureConnectionTariff(connectionId, tariffId) {
  const existing = await dbQuery(
    `SELECT connection_tariff_id
     FROM Connection_Tariff
     WHERE connection_id = ? AND tariff_id = ?
     ORDER BY start_date DESC
     LIMIT 1`,
    [connectionId, tariffId]
  );
  if (existing.length) return existing[0].connection_tariff_id;

  const connectionTariffId = await nextId("Connection_Tariff", "connection_tariff_id");
  await dbQuery(
    `INSERT INTO Connection_Tariff (connection_tariff_id, start_date, end_date, connection_id, tariff_id)
     VALUES (?, ?, ?, ?, ?)`,
    [connectionTariffId, "2026-04-01", null, connectionId, tariffId]
  );
  return connectionTariffId;
}

async function ensureBill(connectionId, readingId) {
  const existing = await dbQuery(
    "SELECT bill_id FROM Bill WHERE reading_id = ? LIMIT 1",
    [readingId]
  );
  if (existing.length) return existing[0].bill_id;

  const readingRows = await dbQuery(
    "SELECT consumption_units FROM Reading_Record WHERE reading_id = ?",
    [readingId]
  );
  const tariffRows = await dbQuery(
    `SELECT tp.rate_per_unit, tp.fixed_charge, tp.tax_percentage
     FROM Connection_Tariff ct
     JOIN Tariff_Plan tp ON tp.tariff_id = ct.tariff_id
     WHERE ct.connection_id = ?
     ORDER BY ct.start_date DESC
     LIMIT 1`,
    [connectionId]
  );

  const units = Number(readingRows[0]?.consumption_units || 0);
  const rate = Number(tariffRows[0]?.rate_per_unit || 0);
  const fixed = Number(tariffRows[0]?.fixed_charge || 0);
  const taxPct = Number(tariffRows[0]?.tax_percentage || 0);
  const subtotal = units * rate + fixed;
  const amount = Number((subtotal + (subtotal * taxPct) / 100).toFixed(2));

  const billNumber = `BILL-SEED-${readingId}`;
  const billId = await nextId("Bill", "bill_id");
  await dbQuery(
    `INSERT INTO Bill (bill_id, bill_number, billing_period, total_amount, due_date, payment_status, connection_id, reading_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [billId, billNumber, "Apr-2026", amount, "2026-04-20", "Unpaid", connectionId, readingId]
  );
  return billId;
}

async function ensurePayment(billId) {
  const existing = await dbQuery(
    "SELECT payment_id FROM Payment WHERE bill_id = ? LIMIT 1",
    [billId]
  );
  if (existing.length) return existing[0].payment_id;

  const billRows = await dbQuery("SELECT total_amount FROM Bill WHERE bill_id = ?", [billId]);
  const totalAmount = Number(billRows[0]?.total_amount || 0);
  const amountPaid = Number((totalAmount * 0.5).toFixed(2));

  const paymentId = await nextId("Payment", "payment_id");
  await dbQuery(
    `INSERT INTO Payment (payment_id, payment_date, amount_paid, payment_mode, bill_id)
     VALUES (?, ?, ?, ?, ?)`,
    [paymentId, "2026-04-10", amountPaid, "UPI", billId]
  );

  await dbQuery("UPDATE Bill SET payment_status = 'Partial' WHERE bill_id = ?", [billId]);
  return paymentId;
}

async function runSeed() {
  try {
    const consumerId = await ensureConsumer();
    const connectionId = await ensureConnection(consumerId);
    const meterId = await ensureMeter(connectionId);
    const readingId = await ensureRecord(meterId);
    const tariffId = await ensureTariffPlan();
    const connectionTariffId = await ensureConnectionTariff(connectionId, tariffId);
    const billId = await ensureBill(connectionId, readingId);
    const paymentId = await ensurePayment(billId);

    console.log("Seed completed successfully:");
    console.log({
      consumerId,
      connectionId,
      meterId,
      readingId,
      tariffId,
      connectionTariffId,
      billId,
      paymentId
    });
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    db.end();
  }
}

runSeed();
