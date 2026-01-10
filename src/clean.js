import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve("output");
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });
console.log("Cleaned output/");
