// 第 2 步:建六边形网格,判定陆地/水域,把每格归到 国家 / NUTS2 / NUTS3。
// 产出 raw/derived/grid.json(中间件,供 elev.mjs 与 build.mjs 使用)。
import fs from "node:fs";
import path from "node:path";
import { RAW, readJSON } from "./lib/net.mjs";
import { makeLAEA, makeHexGrid, projectGeometry, makeIndex, polysArea, inPolys } from "./lib/geo.mjs";
import { BBOX } from "./sources.mjs";

export const HEX_R = 16; // km,外接圆半径;格心距 ≈ 27.7 km,单格面积 ≈ 665 km²
const MARGIN = 80; // km,地图四周留白
const proj = makeLAEA(10, 52);
const P = (lon, lat) => proj.forward(lon, lat);

const inBox = (lon, lat) => lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;
function lonlatCenter(geom) {
  // 最大外环的包围盒中心,用于判断是否在地图范围内(排除海外领地)
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let best = null, bestN = -1;
  for (const p of polys) if (p[0].length > bestN) { bestN = p[0].length; best = p[0]; }
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
  for (const [x, y] of best) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

// ---- 读边界 ----
const skipped = [];
function loadNuts(level) {
  const gj = readJSON(`gisco/nuts2024_l${level}.geojson`);
  const out = [];
  for (const f of gj.features) {
    const p = f.properties;
    const [lon, lat] = lonlatCenter(f.geometry);
    // 只保留「最大那块」落在地图范围内的区域;多块的区域里,范围外的碎块(如法国海外省)丢弃
    if (!inBox(lon, lat)) { if (level === 3 || level === 0) skipped.push({ id: p.NUTS_ID, name: p.NAME_LATN, level }); continue; }
    const geom = f.geometry.type === "MultiPolygon"
      ? { type: "MultiPolygon", coordinates: f.geometry.coordinates.filter((poly) => { const [a, b] = lonlatCenter({ type: "Polygon", coordinates: poly }); return inBox(a, b); }) }
      : f.geometry;
    const polys = projectGeometry(geom, P);
    out.push({ id: p.NUTS_ID, name: p.NAME_LATN, cntr: p.CNTR_CODE, mount: p.MOUNT_TYPE, urbn: p.URBN_TYPE, coast: p.COAST_TYPE, polys, area: polysArea(polys), lonlat: [lon, lat] });
  }
  return out;
}
const n3 = loadNuts(3), n2 = loadNuts(2), n0 = loadNuts(0);
const nutsCountries = new Set(n0.map((f) => f.id));

// Natural Earth:范围内、但不在 NUTS 里的国家 → 「迷雾」陆地
const ne = readJSON("ne/ne_50m_admin_0_countries.geojson");
const neLand = [];
for (const f of ne.features) {
  const iso2 = f.properties.ISO_A2_EH || f.properties.ISO_A2;
  const polys = projectGeometry(f.geometry, P).filter((p) => {
    const [x0, y0, x1, y1] = p.bbox;
    return x1 > -4000 && x0 < 4000 && y1 > -2500 && y0 < 3500;
  });
  if (polys.length) neLand.push({ id: iso2 === "GR" ? "EL" : iso2 === "GB" ? "UK" : iso2, name: f.properties.NAME_ZH || f.properties.NAME, nameEn: f.properties.NAME, polys });
}
const lakes = readJSON("ne/ne_50m_lakes.geojson").features.map((f) => ({ name: f.properties.name, polys: projectGeometry(f.geometry, P) }));

// ---- 网格范围:由 NUTS 覆盖面决定 ----
let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
for (const f of n0) for (const p of f.polys) { X0 = Math.min(X0, p.bbox[0]); Y0 = Math.min(Y0, p.bbox[1]); X1 = Math.max(X1, p.bbox[2]); Y1 = Math.max(Y1, p.bbox[3]); }
X0 -= MARGIN; Y0 -= MARGIN; X1 += MARGIN; Y1 += MARGIN;
const w = Math.sqrt(3) * HEX_R;
const cols = Math.ceil((X1 - X0) / w) + 1, rows = Math.ceil((Y1 - Y0) / (1.5 * HEX_R)) + 1;
const grid = makeHexGrid({ r: HEX_R, cols, rows });
// 网格坐标 (gx, gy) ↔ 投影坐标 (x, y):x = X0 + gx, y = Y1 - gy
const toProj = (gx, gy) => [X0 + gx, Y1 - gy];

const idx3 = makeIndex(n3), idx2 = makeIndex(n2), idxNe = makeIndex(neLand), idxLake = makeIndex(lakes);

const N = grid.count;
const water = new Uint8Array(N); // 0 陆地 1 海 3 湖
const own3 = new Int16Array(N).fill(-1), own2 = new Int16Array(N).fill(-1);
const country = new Array(N).fill(null);
const foreign = new Uint8Array(N); // 1 = NUTS 之外的陆地(迷雾)
const SAMPLE = [[0, 0], ...Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [Math.cos(a) * 0.6 * HEX_R, Math.sin(a) * 0.6 * HEX_R]; })];

for (let i = 0; i < N; i++) {
  const [cx, cy] = grid.center(i % cols, (i / cols) | 0);
  const votes3 = new Map(), votes2 = new Map(), votesNe = new Map();
  let land = 0, lake = 0;
  for (const [dx, dy] of SAMPLE) {
    const [x, y] = toProj(cx + dx, cy + dy);
    if (idxLake.find(x, y) >= 0) { lake++; continue; }
    const a = idx3.find(x, y);
    if (a >= 0) { land++; votes3.set(a, (votes3.get(a) || 0) + 1); const b = idx2.find(x, y); if (b >= 0) votes2.set(b, (votes2.get(b) || 0) + 1); continue; }
    const b = idx2.find(x, y); // 有 NUTS2 无 NUTS3 的国家(如波黑)
    if (b >= 0) { land++; votes2.set(b, (votes2.get(b) || 0) + 1); continue; }
    const c = idxNe.find(x, y);
    if (c >= 0) { land++; votesNe.set(c, (votesNe.get(c) || 0) + 1); }
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  if (lake >= 4) { water[i] = 3; continue; }
  if (land < 4) { water[i] = 1; continue; }
  const nutsVotes = [...votes2.values()].reduce((s, v) => s + v, 0);
  const neVotes = [...votesNe.values()].reduce((s, v) => s + v, 0);
  if (nutsVotes >= neVotes && votes2.size) {
    own2[i] = top(votes2)[0];
    // NUTS3 只在所选 NUTS2 的下属地区里取多数票,避免一格的大区与地区分属两国
    const kids = new Map([...votes3].filter(([k]) => n3[k].id.startsWith(n2[own2[i]].id)));
    if (kids.size) own3[i] = top(kids)[0];
    country[i] = n2[own2[i]].cntr;
  } else {
    foreign[i] = 1;
    country[i] = neLand[top(votesNe)[0]].id;
  }
}

// 小岛补救:面积 ≥ 120 km² 却一格都没分到的 NUTS3(马耳他、希腊小岛等),把离其中心最近的海格变成它的陆地
const count3 = new Int32Array(n3.length);
for (let i = 0; i < N; i++) if (own3[i] >= 0) count3[own3[i]]++;
const rescued = [];
n3.forEach((f, k) => {
  if (count3[k] > 0 || f.area < 120) return;
  // 取最大多边形的环心
  const big = f.polys.reduce((a, b) => (polysArea([b]) > polysArea([a]) ? b : a));
  const ring = big.rings[0];
  const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length, my = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const i = grid.locate(mx - X0, Y1 - my);
  if (i < 0 || water[i] !== 1) return;
  water[i] = 0; own3[i] = k; country[i] = f.cntr;
  const k2 = n2.findIndex((g) => g.id === f.id.slice(0, 4));
  if (k2 < 0) { water[i] = 1; own3[i] = -1; country[i] = null; return; } // 所属大区不在图上(如扬马延):不补
  own2[i] = k2;
  rescued.push(f.id);
});

// 汇总
const countryCodes = [...new Set(country.filter(Boolean))].sort();
const cIdx = new Map(countryCodes.map((c, k) => [c, k]));
const out = {
  hexR: HEX_R, cols, rows, origin: { X0, Y1 }, projection: "LAEA lon0=10 lat0=52 (spherical, km)",
  water: Array.from(water), nuts3: Array.from(own3), nuts2: Array.from(own2),
  country: country.map((c) => (c ? cIdx.get(c) : -1)), foreign: Array.from(foreign),
  countries: countryCodes.map((c) => ({ code: c, nuts: nutsCountries.has(c), ne: neLand.find((f) => f.id === c)?.nameEn || null })),
  n3: n3.map((f) => ({ id: f.id, name: f.name, cntr: f.cntr, mount: f.mount, urbn: f.urbn, coast: f.coast, area: Math.round(f.area), lonlat: f.lonlat })),
  n2: n2.map((f) => ({ id: f.id, name: f.name, cntr: f.cntr, area: Math.round(f.area) })),
  skipped, rescued,
};
fs.mkdirSync(path.join(RAW, "derived"), { recursive: true });
fs.writeFileSync(path.join(RAW, "derived/grid.json"), JSON.stringify(out));

// 边界线(投影后,供前端画国界/区界),简化:只保留范围内,坐标取整到 0.1 km
const ringOut = (feats) => feats.map((f) => ({ id: f.id, rings: f.polys.flatMap((p) => p.rings.map((r) => r.map(([x, y]) => [Math.round((x - X0) * 10) / 10, Math.round((Y1 - y) * 10) / 10]))) }));
fs.writeFileSync(path.join(RAW, "derived/borders.json"), JSON.stringify({ n0: ringOut(n0), n2: ringOut(n2) }));

const landN = water.filter((v) => v === 0).length;
console.log(`grid ${cols}x${rows}=${N} cells; land=${landN} (foreign ${foreign.reduce((s, v) => s + v, 0)}), lake=${water.filter((v) => v === 3).length}`);
console.log(`NUTS3 kept=${n3.length}, with ≥1 hex=${[...count3].filter((c) => c > 0).length + rescued.length}, rescued=${rescued.length} [${rescued.join(",")}]`);
console.log(`skipped (outside map): ${skipped.map((s) => s.id).join(",")}`);
console.log(`countries on map: ${countryCodes.join(",")}`);
