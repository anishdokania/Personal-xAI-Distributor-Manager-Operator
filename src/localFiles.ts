import fs from "node:fs/promises";
import path from "node:path";

export type OperatorMemory = {
  brain: string;
  ideas: string;
  style: string;
  forbidden: string;
  targets: string;
};

async function readTextFileSafe(fileName: string): Promise<string> {
  const filePath = path.join(process.cwd(), fileName);
  return fs.readFile(filePath, "utf8").catch(() => "");
}

export async function readOperatorMemory(): Promise<OperatorMemory> {
  const [brain, ideas, style, forbidden, targets] = await Promise.all([
    readTextFileSafe("brain.md"),
    readTextFileSafe("ideas.md"),
    readTextFileSafe("style.md"),
    readTextFileSafe("forbidden.md"),
    readTextFileSafe("targets.md")
  ]);

  return { brain, ideas, style, forbidden, targets };
}
