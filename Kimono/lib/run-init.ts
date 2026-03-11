import { initializeDatabase } from "./db-init";

initializeDatabase().then(() => {
  console.log("Database initialized successfully.");
  process.exit(0);
}).catch((err) => {
  console.error("Failed to init database", err);
  process.exit(1);
});
