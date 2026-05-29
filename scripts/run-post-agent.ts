import { initDb } from "../src/db";
import { runPostAgent } from "../src/agents/postAgent";

initDb();
const result = await runPostAgent();
console.log(JSON.stringify(result, null, 2));
