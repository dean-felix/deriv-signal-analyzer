"use strict";

const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/<script>([\\s\\S]*?)<\\/script>/i);

if (!match) {
  console.error("No inline application script found in index.html.");
  process.exit(1);
}

try {
  // Parse only; do not execute browser code or make any network requests.
  new Function(match[1]);
  console.log("Inline application JavaScript syntax: OK");
} catch (error) {
  console.error("Inline application JavaScript syntax error:", error.message);
  process.exit(1);
}
