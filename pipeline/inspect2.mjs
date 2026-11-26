// 诊断:就业行业代码、区位商分布、土地覆盖分布 —— 用来定区域(district)与地形阈值。只读。
import { readJSON } from "./lib/net.mjs";
import { flatten } from "./lib/jsonstat.mjs";

const emp = readJSON("eurostat/nama_10r_3empers.json");
console.log("nace:", Object.keys(emp.dimension.nace_r2.category.index).join(","));
const rows = flatten(emp).filter((r) => r.wstatus === "EMP" && r.geo.length === 5);
const latest = new Map();
for (const r of rows) {
  const k = r.geo;
  if (!latest.has(k)) latest.set(k, {});
  const o = latest.get(k);
  if (!o[r.nace_r2] || +r.time > o[r.nace_r2].y) o[r.nace_r2] = { y: +r.time, v: r.value };
}
const sec = { A: ["A"], IND: ["B-E"], F: ["F"], J: ["J"], K: ["K"], MN: ["M_N"], RU: ["R-U"] };
const tot = {}, sum = {};
for (const [, o] of latest) {
  if (!o.TOTAL) continue;
  for (const [s, codes] of Object.entries(sec)) { const v = codes.reduce((a, c) => a + (o[c]?.v || 0), 0); sum[s] = (sum[s] || 0) + v; }
  sum.TOT = (sum.TOT || 0) + o.TOTAL.v;
}
const avg = Object.fromEntries(Object.keys(sec).map((s) => [s, sum[s] / sum.TOT]));
console.log("avg shares", JSON.stringify(Object.fromEntries(Object.entries(avg).map(([k, v]) => [k, v.toFixed(3)]))));
for (const s of Object.keys(sec)) {
  const lqs = [];
  for (const [, o] of latest) { if (!o.TOTAL) continue; const v = sec[s].reduce((a, c) => a + (o[c]?.v || 0), 0); lqs.push(v / o.TOTAL.v / avg[s]); }
  lqs.sort((a, b) => a - b);
  const q = (p) => lqs[Math.floor(p * (lqs.length - 1))].toFixed(2);
  console.log(`LQ ${s}: p50=${q(0.5)} p75=${q(0.75)} p90=${q(0.9)} p97=${q(0.97)} n=${lqs.length}`);
}
const lc = flatten(readJSON("eurostat/lan_lcv_ovw.json")).filter((r) => r.unit === "PC" && r.time === "2022");
for (const c of ["B00", "C00", "D00", "E00", "F00", "H00"]) {
  const v = lc.filter((r) => r.landcover === c && r.geo.length === 4).map((r) => r.value).sort((a, b) => a - b);
  const q = (p) => v[Math.floor(p * (v.length - 1))];
  console.log(`LC ${c}: n=${v.length} p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} max=${q(1)}`);
}
const top = lc.filter((r) => r.landcover === "F00" && r.geo.length === 4).sort((a, b) => b.value - a.value).slice(0, 8);
console.log("F00 top", top.map((r) => r.geo + ":" + r.value).join(" "));
const rd = flatten(readJSON("eurostat/rd_e_gerdreg.json")).filter((r) => r.unit === "PC_GDP" && r.geo.length === 4);
const lr = new Map(); for (const r of rd) if (!lr.has(r.geo) || +r.time > lr.get(r.geo).y) lr.set(r.geo, { y: +r.time, v: r.value });
const rv = [...lr.values()].map((o) => o.v).sort((a, b) => a - b);
console.log("RD %GDP p50", rv[rv.length >> 1], "p90", rv[Math.floor(rv.length * 0.9)], "n", rv.length);
const tn = flatten(readJSON("eurostat/tour_occ_nin2.json")).filter((r) => r.unit === "P_THAB" && r.geo.length === 4);
const lt = new Map(); for (const r of tn) if (!lt.has(r.geo) || +r.time > lt.get(r.geo).y) lt.set(r.geo, { y: +r.time, v: r.value });
const tv = [...lt.values()].map((o) => o.v).sort((a, b) => a - b);
console.log("nights/1000 p50", tv[tv.length >> 1], "p90", tv[Math.floor(tv.length * 0.9)], "n", tv.length);
