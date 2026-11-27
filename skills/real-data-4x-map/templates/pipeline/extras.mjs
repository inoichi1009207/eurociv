// 第 4b 步:地图上的「物件」——公路、铁路、机场、港口、电厂、矿产、农业与林业资源,并给奇观按知名度分档。
// 产出 site/data/features.json;改写 site/data/places.json 里奇观的 tier。在 build.mjs 之后运行。
import fs from "node:fs";
import path from "node:path";
import { RAW, readJSON } from "./lib/net.mjs";
import { makeLAEA, makeHexGrid } from "./lib/geo.mjs";
import { flatten } from "./lib/jsonstat.mjs";

const OUT = path.resolve(RAW, "../site/data");
const G = JSON.parse(fs.readFileSync(path.join(RAW, "derived/grid.json"), "utf8"));
const world = JSON.parse(fs.readFileSync(path.join(OUT, "world.json"), "utf8"));
const regions = JSON.parse(fs.readFileSync(path.join(OUT, "regions.json"), "utf8"));
const places = JSON.parse(fs.readFileSync(path.join(OUT, "places.json"), "utf8"));
const cities = JSON.parse(fs.readFileSync(path.join(OUT, "cities.json"), "utf8"));
const grid = makeHexGrid({ r: G.hexR, cols: G.cols, rows: G.rows });
const proj = makeLAEA(10, 52);
const C = world.cells, N = grid.count;
const toGrid = (lon, lat) => { const [x, y] = proj.forward(lon, lat); return [x - G.origin.X0, G.origin.Y1 - y]; };
const W = grid.w * (G.cols + 0.5), Hh = grid.h * G.rows + G.hexR;
const inMap = ([x, y]) => x > -20 && y > -20 && x < W + 20 && y < Hh + 20;
const r1 = (v) => Math.round(v * 10) / 10;
const dataLand = (i) => i >= 0 && C.water[i] === 0 && !C.fog[i];
const hash = (i, s) => { let h = Math.imul(i ^ (s * 0x9e3779b9), 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const cityCells = new Set(cities.map((c) => c.cell));
const log = (...a) => console.log(...a);

// Douglas–Peucker 简化(网格 km 坐标)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = -1, mi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], L = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((x2 - x1) * (y1 - pts[i][1]) - (x1 - pts[i][0]) * (y2 - y1)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function lines(file, pick, tol) {
  const out = [];
  for (const f of readJSON(file).features) {
    const meta = pick(f.properties); if (!meta) continue;
    const ls = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [];
    for (const l of ls) {
      const pts = l.map(([lon, lat]) => toGrid(lon, lat));
      if (!pts.some(inMap)) continue;
      // 只保留经过有数据陆地的线(迷雾区不画交通)
      if (!pts.some(([x, y]) => dataLand(grid.locate(x, y)))) continue;
      out.push({ ...meta, pts: simplify(pts, tol).map(([x, y]) => [r1(x), r1(y)]) });
    }
  }
  return out;
}
const roads = lines("ne/ne_10m_roads.geojson", (p) => (p.type === "Major Highway" ? { t: 1 } : p.type === "Secondary Highway" && p.scalerank <= 7 ? { t: 2 } : null), 1.2);
const rails = lines("ne/ne_10m_railroads.geojson", (p) => (p.scalerank <= 8 ? { t: p.scalerank <= 6 ? 1 : 2 } : null), 1.2);
log(`roads ${roads.length}, rails ${rails.length}`);

const pointsOf = (file, pick) => readJSON(file).features.map((f) => {
  const meta = pick(f.properties); if (!meta) return null;
  const [lon, lat] = f.geometry.coordinates; const [x, y] = toGrid(lon, lat); const cell = grid.locate(x, y);
  return dataLand(cell) || (cell >= 0 && C.water[cell] === 2) ? { ...meta, x: r1(x), y: r1(y), cell } : null;
}).filter(Boolean);
const airports = pointsOf("ne/ne_10m_airports.geojson", (p) => (/major|mid/.test(p.type) ? { name: p.name, iata: p.iata_code, rank: p.scalerank } : null));
const ports = pointsOf("ne/ne_10m_ports.geojson", (p) => (p.scalerank <= 7 ? { name: p.name, rank: p.scalerank } : null));
log(`airports ${airports.length}, ports ${ports.length}`);

// ---------- 电厂:powerplantmatching ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const ppm = parseCSV(fs.readFileSync(path.join(RAW, "power/powerplants.csv"), "utf8"));
const H = ppm[0], I = Object.fromEntries(H.map((h, k) => [h, k]));
const FUEL = { Nuclear: "nuclear", "Hard Coal": "coal", Lignite: "coal", "Natural Gas": "gas", Oil: "oil", Hydro: "hydro", Wind: "wind", Solar: "solar" };
const MIN = { nuclear: 300, coal: 300, gas: 400, oil: 300, hydro: 200 };
const plants = [], agg = new Map(); // 风电、光伏:按格汇总
for (const r of ppm.slice(1)) {
  const kind = FUEL[r[I.Fueltype]]; if (!kind) continue;
  const out = r[I.DateOut]; if (out && +out <= 2025) continue;
  const lat = +r[I.lat], lon = +r[I.lon], mw = +r[I.Capacity]; if (!isFinite(lat) || !isFinite(lon) || !(mw > 0)) continue;
  const [x, y] = toGrid(lon, lat); const cell = grid.locate(x, y);
  if (cell < 0 || C.fog[cell] || (C.water[cell] !== 0 && !(kind === "wind" && C.water[cell] === 2))) continue;
  if (kind === "wind" || kind === "solar") { const k = kind + "|" + cell; const o = agg.get(k) || { kind, cell, mw: 0, x: 0, y: 0, n: 0 }; o.mw += mw; o.x += x; o.y += y; o.n++; agg.set(k, o); continue; }
  if (mw < MIN[kind]) continue;
  plants.push({ kind, name: r[I.Name], mw: Math.round(mw), x: r1(x), y: r1(y), cell, fuel: r[I.Fueltype] });
}
for (const o of agg.values()) if (o.mw >= (o.kind === "wind" ? 150 : 100)) plants.push({ kind: o.kind, name: o.kind === "wind" ? "风电场群" : "光伏电站群", mw: Math.round(o.mw), x: r1(o.x / o.n), y: r1(o.y / o.n), cell: o.cell, count: o.n, fuel: o.kind });
// 同格同类只留最大
const bestPlant = new Map();
for (const p of plants) { const k = p.kind + "|" + p.cell; if (!bestPlant.has(k) || bestPlant.get(k).mw < p.mw) bestPlant.set(k, p); }
const power = [...bestPlant.values()].sort((a, b) => b.mw - a.mw);
const pc = {}; for (const p of power) pc[p.kind] = (pc[p.kind] || 0) + 1;
log("power", JSON.stringify(pc));

// ---------- 矿产与油田:维基数据 ----------
const MINE_KIND = [[/lignite|brown coal/i, "coal"], [/coal|anthracite/i, "coal"], [/iron/i, "iron"], [/copper/i, "copper"], [/gold/i, "gold"], [/silver/i, "silver"], [/potash|potassium/i, "potash"], [/salt|halite/i, "salt"], [/uranium/i, "uranium"], [/zinc|lead/i, "zinc"], [/bauxite|alumin/i, "bauxite"], [/marble|granite|limestone|stone/i, "stone"]];
const mineRows = fs.existsSync(path.join(RAW, "wikidata/mines.json")) ? readJSON("wikidata/mines.json").results.bindings : [];
const mineBy = new Map();
for (const b of mineRows) {
  const id = b.item.value.split("/").pop();
  const o = mineBy.get(id) || { id, oil: b.kind.value.endsWith("Q211748"), coalType: b.kind.value.endsWith("Q959309"), products: new Set(), sl: +b.sl.value, end: false, coord: b.coord.value, zh: b.n_zh?.value, en: b.n_en?.value };
  if (b.productLabel) o.products.add(b.productLabel.value);
  if (b.end) o.end = true;
  mineBy.set(id, o);
}
const minesByCell = new Map();
for (const o of mineBy.values()) {
  if (o.end) continue;
  let kind = o.oil ? "oil" : o.coalType ? "coal" : null;
  for (const p of o.products) { if (kind) break; for (const [re, k] of MINE_KIND) if (re.test(p)) { kind = k; break; } }
  if (!kind) continue; // 产品不明的矿不放
  if (!o.oil && o.sl < 2) continue; // 普通矿只放有一定知名度的(维基链接 ≥2)
  const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(o.coord); const [x, y] = toGrid(+m[1], +m[2]); const cell = grid.locate(x, y);
  if (cell < 0 || C.fog[cell] || (C.water[cell] !== 0 && !(kind === "oil" && C.water[cell] !== 3))) continue;
  const name = o.zh && !/^Q\d+$/.test(o.zh) ? o.zh : o.en || "";
  const cur = minesByCell.get(cell);
  if (!cur || cur.sl < o.sl) minesByCell.set(cell, { kind, name, x: r1(x), y: r1(y), cell, sl: o.sl });
}
const mines = [...minesByCell.values()];
const mc = {}; for (const m of mines) mc[m.kind] = (mc[m.kind] || 0) + 1;
log("mines", JSON.stringify(mc));

// ---------- 农业资源:大区作物产量密度前 15% → 在该大区放 1–2 个资源格 ----------
const CROP = { C1110: "wheat", C1500: "maize", C1300: "barley", W1000: "grapes", O1000: "olives", R1000: "potato", R2000: "sugarbeet", I1110: "rapeseed" };
const agri = [];
const used = new Set([...cityCells, ...power.map((p) => p.cell), ...mines.map((m) => m.cell)]);
const cellsBy2 = new Map();
for (let i = 0; i < N; i++) if (dataLand(i) && C.r2[i] >= 0 && !cityCells.has(i)) { const k = C.r2[i]; if (!cellsBy2.has(k)) cellsBy2.set(k, []); cellsBy2.get(k).push(i); }
if (fs.existsSync(path.join(RAW, "eurostat/apro_cpshr.json"))) {
  const rows = flatten(readJSON("eurostat/apro_cpshr.json")).filter((r) => r.crops !== "W1000" && r.crops !== "O1000");
  // 葡萄、橄榄是多年生作物,Eurostat 只报种植面积:用面积密度代替产量密度
  if (fs.existsSync(path.join(RAW, "eurostat/apro_cpshr_perm.json"))) rows.push(...flatten(readJSON("eurostat/apro_cpshr_perm.json")));
  const latest = new Map(); // crop|geo → value
  for (const r of rows) { const k = r.crops + "|" + r.geo; const c = latest.get(k); if (!c || +r.time > c.y) latest.set(k, { y: +r.time, v: r.value }); }
  const r2Index = new Map(regions.r2.map((r, k) => [r.id, k]));
  for (const [code, kind] of Object.entries(CROP)) {
    const dens = [];
    for (const [k, o] of latest) { const [c, geo] = k.split("|"); if (c !== code || geo.length !== 4 || !(o.v > 0)) continue; const ki = r2Index.get(geo); if (ki == null || !cellsBy2.has(ki)) continue; dens.push([ki, o.v / cellsBy2.get(ki).length]); }
    dens.sort((a, b) => b[1] - a[1]);
    const top = dens.slice(0, Math.max(3, Math.round(dens.length * 0.15)));
    for (const [ki] of top) {
      const prefer = kind === "grapes" || kind === "olives" ? (i) => C.relief[i] <= 1 : (i) => C.relief[i] === 0;
      const cand = cellsBy2.get(ki).filter((i) => !used.has(i) && prefer(i) && C.feature[i] !== 1).sort((a, b) => hash(a, code.length) - hash(b, code.length));
      for (const i of cand.slice(0, cellsBy2.get(ki).length > 12 ? 2 : 1)) { used.add(i); const [x, y] = grid.center(i % G.cols, (i / G.cols) | 0); agri.push({ kind, cell: i, r2: ki, x: r1(x), y: r1(y) }); }
    }
  }
}
// 木材:林地 ≥ 55% 的大区,挑 1–2 个森林格
for (const [ki, cells] of cellsBy2) {
  if (!(regions.r2[ki].lc?.wood >= 55)) continue;
  const cand = cells.filter((i) => C.feature[i] === 1 && !used.has(i)).sort((a, b) => hash(a, 99) - hash(b, 99));
  for (const i of cand.slice(0, cells.length > 15 ? 2 : 1)) { used.add(i); const [x, y] = grid.center(i % G.cols, (i / G.cols) | 0); agri.push({ kind: "timber", cell: i, r2: ki, x: r1(x), y: r1(y) }); }
}
const ac = {}; for (const a of agri) ac[a.kind] = (ac[a.kind] || 0) + 1;
log("agri", JSON.stringify(ac));

// ---------- 奇观分档:按维基链接数(知名度)排序 ----------
const whs = readJSON("wikidata/whs.json").results.bindings;
const slOf = new Map();
for (const b of whs) { if (!b.whsid) continue; const key = b.whsid.value.replace(/[-_].*$/, "").replace(/(bis|ter|rev|quater)+$/i, ""); slOf.set(key, Math.max(slOf.get(key) || 0, +(b.sl?.value || 0))); }
places.wonders.forEach((w) => (w.sl = slOf.get(w.id) || 0));
const ranked = [...places.wonders].sort((a, b) => b.sl - a.sl);
ranked.forEach((w, k) => (w.tier = k < 40 ? 1 : k < 150 ? 2 : 3));
fs.writeFileSync(path.join(OUT, "places.json"), JSON.stringify(places));
log(`wonders tier1: ${ranked.slice(0, 12).map((w) => w.name).join("、")}…`);

fs.writeFileSync(path.join(OUT, "features.json"), JSON.stringify({ roads, rails, airports, ports, power, mines, agri }));
log(`wrote features.json ${(fs.statSync(path.join(OUT, "features.json")).size / 1024).toFixed(0)} KB`);
