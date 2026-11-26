// 第 4 步:把网格、海拔、统计、维基数据合成网页用的 site/data/*.json。
// 原则(与 Karpathy 的 usaciv 相同):每个派生分类都写一条「规则」进数据表,网页百科逐条展示;
// 每个数字都带年份与来源;估算值显式标记。
import fs from "node:fs";
import path from "node:path";
import { RAW, readJSON } from "./lib/net.mjs";
import { makeLAEA, makeHexGrid, projectGeometry, makeIndex, hash01, smoothNoise } from "./lib/geo.mjs";
import { flatten } from "./lib/jsonstat.mjs";
import { SOURCES } from "./sources.mjs";
import { COUNTRY_ZH, YIELDS, DISTRICTS, TERRAIN, RELIEF, FEATURES, WATER, LENS_GROUPS, LENSES } from "./rules.mjs";

const OUT = path.resolve(RAW, "../site/data");
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
const write = (name, obj) => { fs.writeFileSync(path.join(OUT, name + ".json"), JSON.stringify(obj)); log(`wrote ${name}.json ${(fs.statSync(path.join(OUT, name + ".json")).size / 1024).toFixed(0)} KB`); };

const G = JSON.parse(fs.readFileSync(path.join(RAW, "derived/grid.json"), "utf8"));
const grid = makeHexGrid({ r: G.hexR, cols: G.cols, rows: G.rows });
const N = grid.count;
const proj = makeLAEA(10, 52);
const toGrid = (lon, lat) => { const [x, y] = proj.forward(lon, lat); return [x - G.origin.X0, G.origin.Y1 - y]; };
const cellLonLat = (i) => { const [cx, cy] = grid.center(i % G.cols, (i / G.cols) | 0); return proj.inverse(G.origin.X0 + cx, G.origin.Y1 - cy); };
const round = (v, d = 0) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// ============ 1. 统计数据 ============
function series(ds, filter) {
  // → Map(geo → {value, year}),每个 geo 取最新年份
  const rows = flatten(readJSON(`eurostat/${ds}.json`)).filter(filter);
  const m = new Map();
  for (const r of rows) { const y = +r.time; const c = m.get(r.geo); if (!c || y > c.year) m.set(r.geo, { value: r.value, year: y }); }
  return m;
}
const pop3 = series("demo_r_pjanaggr3", () => true);
const area3 = series("demo_r_d3area", () => true);
const gdp3 = series("nama_10r_3gdp", (r) => r.unit === "MIO_EUR");
const pps3 = series("nama_10r_3gdp", (r) => r.unit === "PPS_HAB_EU27_2020");
const pps2 = series("nama_10r_2gdp", (r) => r.unit === "PPS_HAB_EU27_2020");
const gdp2 = series("nama_10r_2gdp", (r) => r.unit === "MIO_EUR");
const rd2 = series("rd_e_gerdreg", (r) => r.unit === "PC_GDP");
const nights2 = series("tour_occ_nin2", (r) => r.unit === "NR");
const nightsPc2 = series("tour_occ_nin2", (r) => r.unit === "P_THAB");
const unemp2 = series("lfst_r_lfu3rt", () => true);
const tert2 = series("edat_lfse_04", () => true);
const lcRows = flatten(readJSON("eurostat/lan_lcv_ovw.json")).filter((r) => r.unit === "PC");
const lc2 = new Map(); // geo → {code: pct}, 取 2022,缺则 2018
for (const r of lcRows) {
  if (!lc2.has(r.geo)) lc2.set(r.geo, {});
  const o = lc2.get(r.geo);
  if (!o[r.landcover] || +r.time > o[r.landcover].year) o[r.landcover] = { value: r.value, year: +r.time };
}

// 就业(千人):按地区×行业取「与 TOTAL 同一年」的值
const empRows = flatten(readJSON("eurostat/nama_10r_3empers.json")).filter((r) => r.wstatus === "EMP");
const empY = new Map(); // geo → year(TOTAL 的最新年)
for (const r of empRows) if (r.nace_r2 === "TOTAL" && (!empY.has(r.geo) || +r.time > empY.get(r.geo))) empY.set(r.geo, +r.time);
const emp = new Map(); // geo → {nace: value}
for (const r of empRows) {
  if (+r.time !== empY.get(r.geo)) continue;
  if (!emp.has(r.geo)) emp.set(r.geo, {});
  emp.get(r.geo)[r.nace_r2] = r.value;
}
// 细分行业缺失时按「父类 × 本国已报告地区的子类占父类比例」估算,并记下哪些是估算
const PARENT = { J: "G-J", K: "K-N", M_N: "K-N", "R-U": "O-U" };
const ratio = {}; // `${cntr}|${code}` → 子/父
for (const [code, par] of Object.entries(PARENT)) {
  const acc = {};
  for (const [geo, o] of emp) {
    if (geo.length !== 5 || o[code] == null || o[par] == null || o[par] <= 0) continue;
    const c = geo.slice(0, 2);
    acc[c] = acc[c] || [0, 0]; acc[c][0] += o[code]; acc[c][1] += o[par];
    acc.ALL = acc.ALL || [0, 0]; acc.ALL[0] += o[code]; acc.ALL[1] += o[par];
  }
  for (const [c, [a, b]] of Object.entries(acc)) ratio[`${c}|${code}`] = a / b;
}
let estCount = 0, estTotal = 0;
function jobsOf(geo) {
  const o = emp.get(geo);
  if (!o || o.TOTAL == null) return null;
  const est = [];
  const get = (code) => {
    if (o[code] != null) return o[code];
    const par = PARENT[code];
    if (par && o[par] != null) {
      const rt = ratio[`${geo.slice(0, 2)}|${code}`] ?? ratio[`ALL|${code}`];
      est.push(code);
      return o[par] * rt;
    }
    return null;
  };
  const j = {
    total: o.TOTAL, agri: o.A ?? null, industry: o["B-E"] ?? null, construction: o.F ?? null,
    trade: o["G-I"] ?? null, info: get("J"), finance: get("K"), realestate: o.L ?? null, professional: get("M_N"),
    public: o["O-Q"] ?? null, arts: get("R-U"),
  };
  estTotal++; if (est.length) estCount++;
  return { year: empY.get(geo), jobs: j, estimated: est };
}

// ============ 2. 地区表 ============
const n3 = G.n3, n2 = G.n2;
const r2Index = new Map(n2.map((f, k) => [f.id, k]));
const yieldOf = (J, gdp) => ({
  food: J ? round(J.agri, 1) : null,
  production: J ? round((J.industry ?? 0) + (J.construction ?? 0), 1) : null,
  gold: gdp ?? null,
  science: J ? round((J.info ?? 0) + (J.professional ?? 0), 1) : null,
  culture: J ? round(J.arts, 1) : null,
});
const regions3 = n3.map((f) => {
  const p = pop3.get(f.id), a = area3.get(f.id), g = gdp3.get(f.id), pp = pps3.get(f.id);
  const J = jobsOf(f.id);
  const areaKm2 = a?.value ?? f.area;
  return {
    id: f.id, name: f.name, cntr: f.cntr, r2: r2Index.get(f.id.slice(0, 4)) ?? -1,
    pop: p?.value ?? null, pop_year: p?.year ?? null,
    area: round(areaKm2), area_src: a ? "eurostat" : "geometry",
    density: p ? round(p.value / areaKm2, 1) : null,
    gdp: g ? round(g.value) : null, gdp_year: g?.year ?? null,
    gdp_pc_pps: pp ? round(pp.value) : null, gdp_pc_pps_year: pp?.year ?? null,
    jobs: J?.jobs ?? null, jobs_year: J?.year ?? null, jobs_estimated: J?.estimated ?? [],
    yields: yieldOf(J?.jobs, g ? round(g.value) : null),
    mount: f.mount, urbn: f.urbn, coast: f.coast,
    share_industry: J?.jobs?.industry != null ? round((100 * ((J.jobs.industry ?? 0) + (J.jobs.construction ?? 0))) / J.jobs.total, 1) : null,
    share_agri: J?.jobs?.agri != null ? round((100 * J.jobs.agri) / J.jobs.total, 2) : null,
  };
});
log(`jobs: ${estTotal} regions, ${estCount} with ≥1 estimated sub-sector`);
const regions2 = n2.map((f) => {
  const lc = lc2.get(f.id) || {};
  const pc = (c) => (lc[c] ? round(lc[c].value, 1) : null);
  const pp = pps2.get(f.id), rd = rd2.get(f.id), nt = nights2.get(f.id), ntp = nightsPc2.get(f.id), un = unemp2.get(f.id), te = tert2.get(f.id), g = gdp2.get(f.id);
  return {
    id: f.id, name: f.name, cntr: f.cntr,
    gdp: g ? round(g.value) : null, gdp_year: g?.year ?? null,
    gdp_pc_pps: pp ? round(pp.value) : null, gdp_pc_pps_year: pp?.year ?? null,
    rd_pct: rd ? round(rd.value, 2) : null, rd_year: rd?.year ?? null,
    nights: nt ? round(nt.value) : null, nights_pc: ntp ? round(ntp.value) : null, nights_year: nt?.year ?? null,
    unemp: un ? round(un.value, 1) : null, unemp_year: un?.year ?? null,
    tertiary: te ? round(te.value, 1) : null, tertiary_year: te?.year ?? null,
    lc: { built: pc("A00"), crop: pc("B00"), wood: pc("C00"), shrub: pc("D00"), grass: pc("E00"), bare: pc("F00"), water: pc("G00"), wet: pc("H00") },
    lc_year: lc.C00?.year ?? null,
    cohesion: pp ? (pp.value < 75 ? 0 : pp.value < 100 ? 1 : 2) : null,
  };
});

// ============ 3. 海拔与地形 ============
const samples = JSON.parse(fs.readFileSync(path.join(RAW, "elev/samples.json"), "utf8"));
const elevOf = (i) => { const v = []; for (let s = 0; s < 4; s++) { const e = samples[`${i}.${s}`]; if (e != null) v.push(e); } return v; };
const elev = new Int16Array(N).fill(-9999), relief = new Uint8Array(N), terrain = new Uint8Array(N), feature = new Uint8Array(N), water = new Uint8Array(N);
const own = (i) => G.water[i] === 0;
// 冰川面
const glaciers = readJSON("ne/ne_50m_glaciated_areas.geojson").features.map((f) => ({ polys: projectGeometry(f.geometry, (lon, lat) => toGrid(lon, lat)) }));
const glIdx = makeIndex(glaciers, 50);
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
for (let i = 0; i < N; i++) {
  const v = elevOf(i);
  if (v.length) elev[i] = Math.round(v.reduce((s, x) => s + x, 0) / v.length);
}
// 离岸距离
const dist = new Int16Array(N).fill(99), q = [];
for (let i = 0; i < N; i++) if (own(i)) { dist[i] = 0; q.push(i); }
for (let h = 0; h < q.length; h++) for (const j of grid.neighbors(q[h])) if (j >= 0 && dist[j] > dist[q[h]] + 1) { dist[j] = dist[q[h]] + 1; q.push(j); }

for (let i = 0; i < N; i++) {
  if (G.water[i] === 3) { water[i] = 3; continue; }
  if (G.water[i] === 1) { water[i] = dist[i] === 1 || (elev[i] !== -9999 && elev[i] > -200) ? 2 : 1; continue; }
  water[i] = 0;
  // 起伏:格内采样 + 相邻陆地格中心,共最多 10 个点的标准差与最大值
  const pts = elevOf(i);
  for (const j of grid.neighbors(i)) if (j >= 0 && own(j)) { const e = samples[`${j}.0`]; if (e != null) pts.push(e); }
  if (pts.length < 2) continue;
  const s = sd(pts), mx = Math.max(...pts), mean = elev[i];
  relief[i] = (mx >= 1800 && s >= 280) || mean >= 2000 ? 2 : s >= 110 || (mean >= 600 && s >= 60) ? 1 : 0;
}
// 底色地形与地貌:NUTS2 内按土地覆盖比例,用平滑噪声排序后「按名额」分配 —— 区域整体比例与 Eurostat LUCAS 一致
const cellsBy2 = new Map();
for (let i = 0; i < N; i++) if (water[i] === 0 && G.nuts2[i] >= 0) { const k = G.nuts2[i]; if (!cellsBy2.has(k)) cellsBy2.set(k, []); cellsBy2.get(k).push(i); }
const T = Object.fromEntries(TERRAIN.map((t) => [t.key, t.id])), F = Object.fromEntries(FEATURES.map((t) => [t.key, t.id]));
function climate(i) {
  const [lon, lat] = cellLonLat(i);
  const e = elev[i] === -9999 ? 0 : elev[i];
  const [gx, gy] = grid.center(i % G.cols, (i / G.cols) | 0);
  if (glIdx.find(gx, gy) >= 0) return "snow";
  if (lat >= 67 || (lat >= 62 && e >= 500) || (lat >= 63 && lon < -12) || e >= 1900) return "tundra";
  return null;
}
for (let i = 0; i < N; i++) if (water[i] === 0) { const c = climate(i); terrain[i] = c ? T[c] : T.grassland; }
const assign = (cells, share, scoreFn, apply) => {
  const k = Math.round((share / 100) * cells.length);
  if (k <= 0) return;
  [...cells].sort((a, b) => scoreFn(a) - scoreFn(b)).slice(0, k).forEach(apply);
};
const nz = (i, scale, seed) => { const [x, y] = grid.center(i % G.cols, (i / G.cols) | 0); return smoothNoise(x, y, scale, seed) * 0.8 + hash01(i, seed) * 0.2; };
for (const [k, cells] of cellsBy2) {
  const lc = regions2[k].lc;
  const free = cells.filter((i) => terrain[i] === T.grassland);
  // 平原 = 耕地比例(偏低处、平地优先);其余为草原
  if (lc.crop != null) assign(free, (lc.crop / Math.max(1, (lc.crop ?? 0) + (lc.grass ?? 0) + (lc.shrub ?? 0))) * 100, (i) => nz(i, 90, 1) + relief[i] * 0.4, (i) => (terrain[i] = T.plains));
  // 荒漠:裸地比例 ≥ 8% 且纬度 < 44° 的大区,按裸地比例放
  const lat = cellLonLat(cells[0])[1];
  if (lc.bare != null && lc.bare >= 8 && lat < 44) assign(free.filter((i) => relief[i] < 2), lc.bare, (i) => nz(i, 70, 2), (i) => (terrain[i] = T.desert));
  // 森林 = 林地比例(山丘优先)
  if (lc.wood != null) assign(cells.filter((i) => relief[i] < 2 && terrain[i] !== T.snow), lc.wood, (i) => nz(i, 60, 3) - relief[i] * 0.25, (i) => (feature[i] = F.woods));
  // 沼泽 = 湿地比例(只在平地)
  if (lc.wet != null && lc.wet >= 0.5) assign(cells.filter((i) => relief[i] === 0 && !feature[i]), lc.wet * 2, (i) => nz(i, 40, 4), (i) => (feature[i] = F.marsh));
}
// 无 LUCAS 数据的陆地(迷雾区、少数非欧盟国家):只按纬度与海拔粗推
for (let i = 0; i < N; i++) {
  if (water[i] !== 0 || (G.nuts2[i] >= 0 && regions2[G.nuts2[i]].lc.wood != null)) continue;
  if (terrain[i] !== T.grassland) continue;
  const [lon, lat] = cellLonLat(i);
  if (lat < 37 && (lon > 34 || lat < 35.5)) terrain[i] = T.desert;
  else if (lat < 46) terrain[i] = hash01(i, 7) < 0.6 ? T.plains : T.grassland;
  if (lat > 55 && relief[i] < 2 && hash01(i, 8) < 0.55) feature[i] = F.woods;
  else if (lat <= 55 && lat > 44 && relief[i] < 2 && hash01(i, 9) < 0.25) feature[i] = F.woods;
}
const stat = (arr, ids) => Object.fromEntries(ids.map((t) => [t.key, [...arr.keys()].filter((i) => water[i] === 0 && arr[i] === t.id).length]));
log("relief", JSON.stringify(stat(relief, RELIEF)), "terrain", JSON.stringify(stat(terrain, TERRAIN)), "feature", JSON.stringify(stat(feature, FEATURES)));

// ============ 4. 国家 ============
const ne = readJSON("ne/ne_50m_admin_0_countries.geojson");
const neZh = new Map();
for (const f of ne.features) { let c = f.properties.ISO_A2_EH || f.properties.ISO_A2; if (c === "GR") c = "EL"; if (c === "GB") c = "UK"; neZh.set(c, f.properties.NAME_ZH); }
// 国色:相邻国家颜色不同(贪心着色)
const PALETTE = ["#c8503c", "#3d6fb6", "#d9a23a", "#4f9a5a", "#8a5bb0", "#2fa3a3", "#c96fa0", "#7c8b2f", "#b8733a", "#5a6fd0", "#a83a5f", "#3f8f7a"];
const adj = G.countries.map(() => new Set());
for (let i = 0; i < N; i++) { const a = G.country[i]; if (a < 0) continue; for (const j of grid.neighbors(i)) { const b = j >= 0 ? G.country[j] : -1; if (b >= 0 && b !== a) { adj[a].add(b); adj[b].add(a); } } }
const order = G.countries.map((_, k) => k).sort((a, b) => adj[b].size - adj[a].size);
const colorOf = [];
for (const k of order) { const used = new Set([...adj[k]].map((j) => colorOf[j])); colorOf[k] = PALETTE.findIndex((_, c) => !used.has(c)); if (colorOf[k] < 0) colorOf[k] = k % PALETTE.length; }
// 「有数据」以实际有非迷雾格为准(乌克兰在 NUTS0 里有轮廓,但无 NUTS2/3)
const hasData = new Set(); for (let i = 0; i < N; i++) if (G.water[i] === 0 && !G.foreign[i] && G.country[i] >= 0) hasData.add(G.country[i]);
const countries = G.countries.map((c, k) => ({ code: c.code, name: COUNTRY_ZH[c.code] || neZh.get(c.code) || c.ne || c.code, nuts: hasData.has(k), color: hasData.has(k) ? PALETTE[colorOf[k]] : "#77756c" }));

// ============ 5. 城市 ============
const wdRows = (file) => (fs.existsSync(path.join(RAW, `wikidata/${file}.json`)) ? readJSON(`wikidata/${file}.json`).results.bindings : null);
const qid = (u) => u?.value?.split("/").pop();
const pt = (b) => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.coord.value); return [+m[1], +m[2]]; };
// 维基数据常只有 zh(多为繁体)标签:统一转简体(opencc-js,构建期依赖;未安装时原样保留)
let toSimp = (s) => s;
try { const OpenCC = await import("opencc-js"); toSimp = OpenCC.Converter({ from: "tw", to: "cn" }); } catch { console.log("(未安装 opencc-js,中文名不做繁转简)"); }
const zhName = (b) => { const v = b.n_zh?.value; return v && !/^Q\d+$/.test(v) ? toSimp(v) : null; };
const n3polys = (() => {
  const gj = readJSON("gisco/nuts2024_l3.geojson");
  const byId = new Map(gj.features.map((f) => [f.properties.NUTS_ID, f]));
  return n3.map((f) => ({ polys: projectGeometry(byId.get(f.id).geometry, (lon, lat) => toGrid(lon, lat)) }));
})();
const idx3raw = makeIndex(n3polys, 40);
// 简化边界有缝(梵蒂冈的洞、博斯普鲁斯海峡、海岸线):落空时向外环状搜索 3–15 km
const idx3 = {
  find(x, y) {
    const k = idx3raw.find(x, y);
    if (k >= 0) return k;
    for (const rad of [3, 6, 10, 15]) for (let a = 0; a < 12; a++) {
      const kk = idx3raw.find(x + rad * Math.cos((a * Math.PI) / 6), y + rad * Math.sin((a * Math.PI) / 6));
      if (kk >= 0) return kk;
    }
    return -1;
  },
};
const cityRows = wdRows("cities");
let cities = [];
if (cityRows) {
  const by = new Map();
  for (const b of cityRows) {
    const id = qid(b.item);
    const o = by.get(id) || { id, pop: 0, sl: +(b.sl?.value || 0), coord: pt(b), zh: zhName(b), en: b.n_en?.value || null, country: qid(b.country), capitalOf: new Set() };
    o.pop = Math.max(o.pop, +b.pop.value);
    if (b.capital) o.capitalOf.add(qid(b.capital));
    if (!o.zh) o.zh = zhName(b);
    by.set(id, o);
  }
  // 去重:7 km 内的多个条目(城市本体、都会区、同名行政单位)只留维基链接数最多者 —— 通常就是「那座城市」本身
  const list = [...by.values()].sort((a, b) => b.sl - a.sl || b.pop - a.pop);
  const kept = [];
  for (const c of list) {
    const [x, y] = toGrid(...c.coord);
    if (kept.some((k) => Math.hypot(k.x - x, k.y - y) < 7)) continue;
    const r3 = idx3.find(x, y);
    if (r3 < 0) continue; // 只要 NUTS 覆盖内的城市
    const cell = grid.locate(x, y);
    if (!c.zh && !c.en) continue; // 无任何名称的条目(只有 Q 号)不要
    kept.push({ ...c, x, y, r3, cell });
  }
  cities = kept.sort((a, b) => b.pop - a.pop); // 旗标按人口从大到小排,大城市优先占位
}
// 国家首都:维基数据「P1376 首都所属」指向该城市所在国家
// 荷兰例外:阿姆斯特丹的 P17 是「荷兰」(Q55),而 P1376 指向「荷兰王国」(Q29999)
const CAPITAL_ALIAS = { Q55: "Q29999" };
const capitalOK = (c) => c.capitalOf.has(c.country) || c.capitalOf.has(CAPITAL_ALIAS[c.country]);
// 区位商(相对全图平均)
const sumBy = (key) => regions3.reduce((s, r) => s + (r.jobs?.[key] ?? 0), 0);
const totalJobs = sumBy("total");
const avgShare = Object.fromEntries(["agri", "industry", "construction", "info", "finance", "realestate", "professional", "arts", "trade"].map((k) => [k, sumBy(k) / totalJobs]));
const lq = (r, keys) => { if (!r.jobs) return null; const v = keys.reduce((s, k) => s + (r.jobs[k] ?? NaN), 0); const a = keys.reduce((s, k) => s + avgShare[k], 0); return isFinite(v) ? v / r.jobs.total / a : null; };
const DZ = Object.fromEntries(DISTRICTS.map((d) => [d.key, d]));
const seenR3 = new Set();
cities = cities.map((c, rank) => {
  const r = regions3[c.r3], r2 = r.r2 >= 0 ? regions2[r.r2] : null;
  const primary = !seenR3.has(c.r3); seenR3.add(c.r3);
  const d = [];
  const add = (key, why) => d.push({ key, why });
  if (capitalOK(c)) add("gov", "国家首都(维基数据 P1376)");
  const lqInd = lq(r, ["industry", "construction"]), lqSci = lq(r, ["info", "professional"]), lqFin = lq(r, ["finance", "realestate", "professional"]), lqArt = lq(r, ["arts"]);
  const est = new Set(r.jobs_estimated);
  if (r2?.rd_pct >= DZ.campus.min_rd || (lqSci >= DZ.campus.min_lq && !est.has("J") && !est.has("M_N"))) add("campus", r2?.rd_pct >= DZ.campus.min_rd ? `所在大区研发投入占 GDP ${r2.rd_pct}%(${r2.rd_year})` : `信息通信+专业科研就业区位商 ${lqSci.toFixed(2)}`);
  if (lqInd >= DZ.industrial.min_lq) add("industrial", `工业+建筑就业区位商 ${lqInd.toFixed(2)}`);
  if (lqFin >= DZ.commercial.min_lq && !est.has("K")) add("commercial", `金融+地产+专业服务就业区位商 ${lqFin.toFixed(2)}`);
  if (lqArt >= DZ.theater.min_lq && !est.has("R-U")) add("theater", `艺术娱乐等服务就业区位商 ${lqArt.toFixed(2)}`);
  if (r2?.nights_pc >= DZ.entertainment.min_nights_pc) add("entertainment", `所在大区每千居民游客过夜 ${Math.round(r2.nights_pc)} 晚(${r2.nights_year})`);
  if (c.cell >= 0 && grid.neighbors(c.cell).concat([c.cell]).some((j) => j >= 0 && water[j] === 2)) add("harbor", "城市所在格邻接海岸");
  if (r.jobs && lq(r, ["agri"]) >= DZ.farm.min_lq) add("farm", `农林渔就业区位商 ${lq(r, ["agri"]).toFixed(2)}`);
  return {
    id: c.id, name: c.zh || c.en || c.id, name_en: c.en, zh: !!c.zh, cntr: r.cntr, x: round(c.x, 1), y: round(c.y, 1), cell: c.cell,
    pop: c.pop, capital: capitalOK(c), r3: c.r3, primary, districts: d, rank,
  };
});
log(`cities: ${cities.length} (zh names ${cities.filter((c) => c.zh).length}, capitals ${cities.filter((c) => c.capital).length})`);
const dcount = {}; for (const c of cities) for (const d of c.districts) dcount[d.key] = (dcount[d.key] || 0) + 1;
log("districts", JSON.stringify(dcount));

// ============ 6. 奇观(世界遗产)与资源(电站) ============
const wonders = [];
const whs = wdRows("whs");
if (whs) {
  const by = new Map();
  for (const b of whs) {
    // 系列遗产的各组成部分编号形如 310-001、99bis、859rev:归一到主编号;没有遗产编号的条目多是某遗产内的单体建筑,略去
    if (!b.whsid) continue;
    const key = b.whsid.value.replace(/[-_].*$/, "").replace(/(bis|ter|rev|quater)+$/i, "");
    const o = by.get(key) || { key, items: new Map(), crit: new Set(), zh: null, en: null, main: null };
    o.items.set(qid(b.item), pt(b));
    if (b.crit) o.crit.add(qid(b.crit));
    const isMain = !/[-_]/.test(b.whsid.value);
    // 名称与位置优先取主条目(编号不带「-001」类后缀者),否则取遇到的第一个组成部分
    if (isMain && !o.main) { o.main = pt(b); o.zh = zhName(b) || o.zh; o.en = b.n_en?.value || o.en; }
    if (!o.zh) o.zh = zhName(b);
    if (!o.en) o.en = b.n_en?.value || null;
    by.set(key, o);
  }
  for (const o of by.values()) {
    const [lon, lat] = o.main || [...o.items.values()][0];
    const [x, y] = toGrid(lon, lat);
    const cell = grid.locate(x, y);
    if (cell < 0 || water[cell] !== 0 || G.foreign[cell]) continue;
    wonders.push({ id: o.key, name: o.zh || o.en, name_en: o.en, x: round(x, 1), y: round(y, 1), cell, parts: o.items.size, r3: G.nuts3[cell] });
  }
}
// 自然/文化:用维基数据「世界遗产标准」的条目号无法直接判断,这里按名字关键词粗分并在百科说明
const NATURAL_RE = /(national park|国家公园|forest|森林|mountain|山|lake|湖|coast|海岸|cave|洞|volcan|火山|fjord|峡湾|dolomit|白云石|glacier|冰川|island|岛|wadden|瓦登|beech|山毛榉|gorge|峡谷|delta|三角洲|reserve|保护区|geopark|地质|nature)/i;
wonders.forEach((w) => (w.natural = NATURAL_RE.test(w.name_en || "") || NATURAL_RE.test(w.name || "")));
const resources = [];
const pw = wdRows("power");
if (pw) {
  const by = new Map();
  for (const b of pw) {
    const id = qid(b.item);
    const o = by.get(id) || { id, kind: qid(b.kind) === "Q134447" ? "nuclear" : "hydro", coord: pt(b), mw: null, uses: new Set(), zh: zhName(b), en: b.n_en?.value };
    if (b.mw) o.mw = Math.max(o.mw ?? 0, +b.mw.value);
    if (b.use) o.uses.add(qid(b.use));
    by.set(id, o);
  }
  const CLOSED = new Set(["Q75291252", "Q12377751", "Q109551565", "Q56556915", "Q30108381"]); // 已关闭/拆除/废弃/在建等状态
  for (const o of by.values()) {
    if ([...o.uses].some((u) => CLOSED.has(u))) continue;
    if (o.kind === "hydro" && !(o.mw >= 300)) continue;
    if (o.kind === "nuclear" && o.mw != null && o.mw < 100) continue;
    const [x, y] = toGrid(...o.coord);
    const cell = grid.locate(x, y);
    if (cell < 0 || G.foreign[cell] || (G.nuts2[cell] < 0 && water[cell] === 0)) continue;
    resources.push({ id: o.id, kind: o.kind, name: o.zh || o.en, name_en: o.en, mw: o.mw, x: round(x, 1), y: round(y, 1), cell });
  }
}
log(`wonders ${wonders.length} (natural ${wonders.filter((w) => w.natural).length}), resources ${resources.length} (nuclear ${resources.filter((r) => r.kind === "nuclear").length})`);

// ============ 7. 河流 ============
const rivers = [];
for (const f of readJSON("ne/ne_50m_rivers_lake_centerlines.geojson").features) {
  const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const ln of lines) {
    const pts = ln.map(([lon, lat]) => toGrid(lon, lat)).filter(([x, y]) => x > -50 && y > -50 && x < G.cols * grid.w + 50 && y < G.rows * grid.h + 50);
    if (pts.length < 2) continue;
    rivers.push({ name: f.properties.name_zh || f.properties.name, rank: f.properties.scalerank, pts: pts.map(([x, y]) => [round(x, 1), round(y, 1)]) });
  }
}

// ============ 8. 全域汇总与透镜 ============
const sumY = (k) => regions3.reduce((s, r) => s + (r.yields[k] ?? 0), 0);
const nation = {
  name: "欧洲", pop: regions3.reduce((s, r) => s + (r.pop ?? 0), 0),
  yields: Object.fromEntries(YIELDS.map((y) => [y.key, round(sumY(y.key), 1)])),
  regions: regions3.length, cities: cities.length, wonders: wonders.length,
};
const world = {
  version: 1, generated: new Date().toISOString().slice(0, 10),
  grid: { r: G.hexR, cols: G.cols, rows: G.rows, w: grid.w, h: grid.h },
  projection: G.projection,
  cells: {
    water: Array.from(water), terrain: Array.from(terrain), relief: Array.from(relief), feature: Array.from(feature),
    elev: Array.from(elev), r3: G.nuts3, r2: G.nuts2, country: G.country, fog: G.foreign,
  },
  tables: { water: WATER, terrain: TERRAIN, relief: RELIEF, feature: FEATURES },
  countries, rivers, skipped: G.skipped, rescued: G.rescued,
};
write("world", world);
write("regions", { r3: regions3, r2: regions2 });
write("cities", cities);
write("places", { wonders, resources });
write("meta", { nation, yields: YIELDS, districts: DISTRICTS, lensGroups: LENS_GROUPS, lenses: LENSES });
write("sources", SOURCES.map(({ files, group, ...s }) => ({ ...s, files: files.map((f) => f.url.split("?")[0]) })));
