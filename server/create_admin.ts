import { Database } from "bun:sqlite";
import { hashPassword } from "./src/lib/auth";

async function main() {
  const db = new Database("database.sqlite");
  
  const existing = db.query("SELECT id FROM users WHERE email = 'admin@predictit.com'").get();
  if (!existing) {
    const hash = await hashPassword("admin123");
    db.run(
      "INSERT INTO users (username, email, password_hash, is_admin, balance, created_at, updated_at) VALUES (?, ?, ?, 1, 100000, ?, ?)",
      ["SupremAdmin", "admin@predictit.com", hash, Date.now(), Date.now()]
    );
    console.log("Admin account created! Email: admin@predictit.com | Pass: admin123");
  } else {
    // Force promote just in case
    db.run("UPDATE users SET is_admin = 1 WHERE email = 'admin@predictit.com'");
    console.log("Admin account updated! Email: admin@predictit.com | Pass: admin123");
  }
}

main().catch(console.error);
