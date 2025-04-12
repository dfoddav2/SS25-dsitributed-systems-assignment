import { DatabaseSync } from "node:sqlite";
import { UserRole } from "../types.ts";

export default function seedDatabase(db: DatabaseSync) {
  try {
    db.exec(`
            CREATE TABLE IF NOT EXISTS user (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL,
              password TEXT NOT NULL,
              role TEXT NOT NULL
            );
          `);

    const users = [
      { id: 1, username: "admin", password: "secret", role: UserRole.ADMIN },
      { id: 2, username: "agent", password: "secret", role: UserRole.AGENT },
      {
        id: 3,
        username: "secretary",
        password: "secret",
        role: UserRole.SECRETARY,
      },
    ];
    // Insert some initial users
    for (const user of users) {
      db.exec(`
              INSERT INTO user (username, password, role)
              VALUES ('${user.username}', '${user.password}', '${user.role}');
            `);
    }
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}
