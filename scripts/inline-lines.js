// Put lines.json into densha.js, between /* LINES-DATA:BEGIN */ and /* LINES-DATA:END */ (run by build.sh).
// Edit lines.json, not that block. Keys starting with "_" (notes) are left out.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const file = path.join(root, "densha.js");
const data = JSON.parse(fs.readFileSync(path.join(root, "lines.json"), "utf8"));
const keys = Object.keys(data).filter((k) => !k.startsWith("_"));
const out = ["  var LINE_DATA = {"];
keys.forEach((k, ki) => {
  const v = data[k], head = Object.fromEntries(Object.entries(v).filter(([x]) => x !== "stations"));
  out.push(`    ${JSON.stringify(k)}: Object.assign(${JSON.stringify(head)}, { stations: [`);
  v.stations.forEach((st, i) => out.push("      " + JSON.stringify(st) + (i < v.stations.length - 1 ? "," : "")));
  out.push("    ] })" + (ki < keys.length - 1 ? "," : ""));
});
out.push("  };");
const src = fs.readFileSync(file, "utf8");
const re = /(\/\* LINES-DATA:BEGIN \*\/\n)[\s\S]*?(\n  \/\* LINES-DATA:END \*\/)/;
if (!re.test(src)) throw new Error("densha.js has no LINES-DATA block");
const next = src.replace(re, (_, a, b) => a + out.join("\n") + b);
if (next !== src) fs.writeFileSync(file, next);
console.log("lines: " + keys.map((k) => `${k} (${data[k].stations.length})`).join(", ") + (next !== src ? " — updated" : ""));
