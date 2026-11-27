// 诊断:电厂库燃料类型分布、NE 公路/铁路/机场字段。只读。
import fs from "node:fs";
const csv = fs.readFileSync("raw/power/powerplants.csv", "utf8").split(/\r?\n/);
const hdr = csv[0].split(","); console.log("ppm cols:", hdr.join(","));
const iF = hdr.indexOf("Fueltype"), iC = hdr.indexOf("Capacity"), iO = hdr.indexOf("DateOut"), iT = hdr.indexOf("Technology");
const by = new Map(); let n = 0;
for (const line of csv.slice(1)) { if (!line) continue; const c = line.split(","); n++; const k = c[iF]; const o = by.get(k) || { n: 0, mw: 0, big: 0 }; o.n++; o.mw += +c[iC] || 0; if (+c[iC] >= 500) o.big++; by.set(k, o); }
console.log("rows", n); for (const [k, o] of [...by].sort((a, b) => b[1].mw - a[1].mw)) console.log(" ", k, o.n, Math.round(o.mw / 1000) + "GW", "≥500MW:", o.big);
for (const f of ["ne_10m_roads", "ne_10m_railroads", "ne_10m_airports", "ne_10m_ports"]) {
  const s = fs.readFileSync(`raw/ne/${f}.geojson`, "utf8");
  const j = JSON.parse(s); const eu = j.features.filter((x) => { const c = JSON.stringify(x.geometry.coordinates).match(/-?\d+\.?\d*/g); const lon = +c[0], lat = +c[1]; return lon > -25 && lon < 45 && lat > 34 && lat < 72; });
  const p = eu[0]?.properties || {};
  const keys = Object.keys(p).filter((k) => /type|rank|name$|class|level|cat|iata|natlscale|expressway|sov_a3|continent/i.test(k));
  console.log("==", f, "europe", eu.length, keys.map((k) => `${k}=${String(p[k]).slice(0, 20)}`).join(" "));
  const dist = (k) => { const m = new Map(); for (const x of eu) m.set(x.properties[k], (m.get(x.properties[k]) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, b]) => `${a}:${b}`).join(" "); };
  if (f.includes("roads")) console.log("   type:", dist("type"), "| scalerank:", dist("scalerank"));
  if (f.includes("rail")) console.log("   scalerank:", dist("scalerank"), "| category:", dist("category"));
  if (f.includes("airports")) console.log("   type:", dist("type"), "| scalerank:", dist("scalerank"));
}
