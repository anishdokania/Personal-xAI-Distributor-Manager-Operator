import { initDb } from "../src/db";
import { runReplyAgent } from "../src/agents/replyAgent";

initDb();
const result = await runReplyAgent();
console.log(JSON.stringify(result, null, 2));
