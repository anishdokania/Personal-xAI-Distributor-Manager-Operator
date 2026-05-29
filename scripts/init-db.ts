import { config } from "../src/config";
import { initDb, recordAction } from "../src/db";

initDb();
recordAction("db", "initialized", "SQLite database initialized");
console.log(`SQLite database ready at ${config.databasePath}`);
