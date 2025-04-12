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
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}
