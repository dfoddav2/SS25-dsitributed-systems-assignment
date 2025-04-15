import { DatabaseSync } from "node:sqlite";

export default function seedDatabase(db: DatabaseSync) {
  try {
    // Create the transactions table if it doesn't exist
    // NOTE: Table names should be singular, but transaction is a reserved keyword in SQLite
    db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      vendor_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      amount REAL NOT NULL
    );
  `);
    // Create the results table if it doesn't exist
    db.exec(`
    CREATE TABLE IF NOT EXISTS result (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      is_fraudulent INTEGER NOT NULL,
      confidence REAL NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );
  `);

    // Delete all existing data from the tables
    db.exec(`
    DELETE FROM result;
    DELETE FROM transactions;
  `);

    // Reset autoincrement counters
    db.exec(`DELETE FROM sqlite_sequence WHERE name='transactions'`);
    db.exec(`DELETE FROM sqlite_sequence WHERE name='result'`);

    // Insert sample data into the transactions table
    db.exec(`
    INSERT INTO transactions (customer_id, vendor_id, timestamp, status, amount)
    VALUES
      (1, 1, '2023-01-01T12:00:00Z', 'completed', 100.0),
      (2, 2, '2023-01-02T12:00:00Z', 'completed', 200.0),
      (3, 3, '2023-01-03T12:00:00Z', 'completed', 300.0);
  `);

    // Insert sample data into the result table
    db.exec(`
        INSERT INTO result (transaction_id, timestamp, is_fraudulent, confidence)
        VALUES
          (1, '2023-01-01T12:00:00Z', 0, 0.95),
          (2, '2023-01-02T12:00:00Z', 1, 0.85),
          (3, '2023-01-03T12:00:00Z', 0, 0.90);
      `);
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}
