// 第 5 步:产出核对(机器判据,非零退出 = 不合格)。
// 1) 文件齐全且可解析;2) 关键覆盖率;3) 全图合计与 Eurostat 国家级(NUTS0)数字对账;4) 抽查几座城市。
import fs from "node:fs";
import path from "node:path";
import { RAW, readJSON } from "./lib/net.mjs";
import { flatten } from "./lib/jsonstat.mjs";

const OUT = path.resolve(RAW, "../site/data");
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) fails.push(msg); };
const J = (n) => JSON.parse(fs.readFileSync(path.join(OUT, n + ".json"), "utf8"));
const world = J("world"), regions = J("regions"), cities = J("cities"), places = J("places"), meta = J("meta");

const n = world.grid.cols * world.grid.rows;
for (const k of Object.keys(world.cells)) ok(world.cells[k].length === n, `cells.${k} 长度 = ${n}`);
const land = world.cells.water.filter((w) => w === 0).length;
const landData = world.cells.water.filter((w, i) => w === 0 && !world.cells.fog[i]).length;
const elevMissing = world.cells.water.filter((w, i) => w === 0 && world.cells.elev[i] === -9999).length;
ok(elevMissing / land < 0.01, `陆地格缺海拔 ${elevMissing}/${land}`);
const r3 = regions.r3;
const cov = (f) => r3.filter((r) => r[f] != null).length / r3.length;
ok(cov("pop") > 0.98, `NUTS3 人口覆盖 ${(cov("pop") * 100).toFixed(1)}%`);
ok(cov("gdp") > 0.95, `NUTS3 GDP 覆盖 ${(cov("gdp") * 100).toFixed(1)}%`);
ok(cov("jobs") > 0.85, `NUTS3 就业覆盖 ${(cov("jobs") * 100).toFixed(1)}%`);
ok(cities.length > 300, `城市数 ${cities.length}`);
ok(cities.filter((c) => c.capital).length >= 30, `首都数 ${cities.filter((c) => c.capital).length}`);
ok(cities.filter((c) => /^[一-鿿·]/.test(c.name)).length / cities.length > 0.6, `城市中文名比例 ${((cities.filter((c) => /^[一-鿿·]/.test(c.name)).length / cities.length) * 100).toFixed(0)}%`);
ok(places.wonders.length > 200, `奇观数 ${places.wonders.length}`);

// 对账:对「该年全部 NUTS3 都有值」的国家,NUTS3 之和应等于 NUTS0 国家值(验证单位、代码集与解析无误)。
// 地图上被略去的远方地区(加那利等)另算覆盖率,不混进对账。
const allN3 = readJSON("gisco/nuts2024_l3.geojson").features.map((f) => f.properties.NUTS_ID);
const n3ByC = new Map(); for (const id of allN3) { const c = id.slice(0, 2); if (!n3ByC.has(c)) n3ByC.set(c, []); n3ByC.get(c).push(id); }
function reconcile(rows, label) {
  const v = new Map(); for (const r of rows) v.set(`${r.geo}|${r.time}`, r.value);
  const years = [...new Set(rows.map((r) => r.time))];
  let worst = 0, worstK = "", tested = 0;
  for (const [c, ids] of n3ByC) for (const y of years) {
    const t = v.get(`${c}|${y}`); if (!t) continue;
    const vals = ids.map((id) => v.get(`${id}|${y}`)); if (vals.some((x) => x == null)) continue;
    vals.push(v.get(`${c}ZZZ|${y}`) ?? 0); // 区外(extra-regio,如北海大陆架)只在国家合计里
    tested++; const d = Math.abs(vals.reduce((s, x) => s + x, 0) - t) / t;
    if (d > worst) { worst = d; worstK = `${c}|${y}`; }
  }
  ok(worst < 0.0001 && tested > 30, `${label}:${tested} 个「国家×年」NUTS3 之和对国家值,最大偏差 ${(worst * 100).toFixed(3)}%(${worstK})`);
}
reconcile(flatten(readJSON("eurostat/nama_10r_3gdp.json")).filter((r) => r.unit === "MIO_EUR"), "GDP 对账");
reconcile(flatten(readJSON("eurostat/demo_r_pjanaggr3.json")), "人口对账");
// 地图里的数与原始数据逐条一致(抽 50 个地区)
const rawGdp = new Map(); for (const r of flatten(readJSON("eurostat/nama_10r_3gdp.json"))) if (r.unit === "MIO_EUR") rawGdp.set(`${r.geo}|${r.time}`, r.value);
// 全量比对(不抽样):每个地区的人口、GDP、总就业都应等于原始数据里该地区「最新年份」的值
const latestRaw = (rows) => { const m = new Map(); for (const r of rows) { const c = m.get(r.geo); if (!c || +r.time > c.year) m.set(r.geo, { year: +r.time, value: r.value }); } return m; };
const lGdp = latestRaw(flatten(readJSON("eurostat/nama_10r_3gdp.json")).filter((r) => r.unit === "MIO_EUR"));
const lPop = latestRaw(flatten(readJSON("eurostat/demo_r_pjanaggr3.json")));
const lEmp = latestRaw(flatten(readJSON("eurostat/nama_10r_3empers.json")).filter((r) => r.wstatus === "EMP" && r.nace_r2 === "TOTAL"));
const mism = (m, f, fy, tol) => r3.filter((r) => { const x = m.get(r.id); return x ? !(r[f] != null && Math.abs(r[f] - x.value) <= tol && r[fy] === x.year) : r[f] != null; });
for (const [m, f, fy, tol, label] of [[lGdp, "gdp", "gdp_year", 1, "GDP"], [lPop, "pop", "pop_year", 0, "人口"]]) {
  const bad = mism(m, f, fy, tol);
  ok(bad.length === 0, `全部 ${r3.length} 个地区的${label}与原始最新年份值一致(不一致 ${bad.length}:${bad.slice(0, 5).map((r) => r.id).join(",")})`);
}
const badEmp = r3.filter((r) => { const x = lEmp.get(r.id); return x ? !(r.jobs && Math.abs(r.jobs.total - x.value) < 1e-6 && r.jobs_year === x.year) : r.jobs != null; });
ok(badEmp.length === 0, `全部地区总就业与原始一致(不一致 ${badEmp.length})`);
// 产出语义:分量全缺必须是 null,不得显示 0;有分量时等于分量之和
const yBad = r3.filter((r) => {
  if (!r.jobs) return false;
  const chk = (y, parts) => { const v = parts.map((k) => r.jobs[k]); if (v.some((x) => x == null)) return y !== null; return Math.abs(y - v.reduce((s, x) => s + x, 0)) > 0.06; };
  return chk(r.yields.production, ["industry", "construction"]) || chk(r.yields.science, ["info", "professional"]) || chk(r.yields.food, ["agri"]) || chk(r.yields.culture, ["arts"]);
});
ok(yBad.length === 0, `产出与就业分量一致、任一分量缺失即为空(违规 ${yBad.length}:${yBad.slice(0, 5).map((r) => r.id).join(",")})`);
const skippedPop = flatten(readJSON("eurostat/demo_r_pjanaggr3.json")).filter((r) => world.skipped.some((s) => s.id === r.geo) && r.time === "2025").reduce((s, r) => s + r.value, 0);
console.log(`信息:略去的远方地区 2025 年人口合计 ${Math.round(skippedPop / 1e4)} 万`);

// 抽查:几座城市应落在预期 NUTS3、并是首都
const expect = [["巴黎", "FR101"], ["柏林", "DE300"], ["罗马", "ITI43"], ["华沙", "PL911"], ["维也纳", "AT130"]];
for (const [name, id] of expect) {
  const c = cities.find((x) => x.name === name);
  ok(c && r3[c.r3].id === id && c.capital, `${name} → ${c ? r3[c.r3].id : "未找到"}${c?.capital ? " 首都" : ""}(预期 ${id} 首都)`);
}
// 网格归属:随机 400 个有数据陆地格,用原始边界独立做格心点查,与 cells.r3 一致率应 ≥ 90%(其余是边境格多数票的正常差异)
{
  const { makeLAEA, makeHexGrid, projectGeometry, makeIndex } = await import("./lib/geo.mjs");
  const G = JSON.parse(fs.readFileSync(path.join(RAW, "derived/grid.json"), "utf8"));
  const grid = makeHexGrid({ r: G.hexR, cols: G.cols, rows: G.rows });
  const proj = makeLAEA(10, 52);
  const gj = readJSON("gisco/nuts2024_l3.geojson");
  const feats = gj.features.map((f) => ({ id: f.properties.NUTS_ID, polys: projectGeometry(f.geometry, (lon, lat) => proj.forward(lon, lat)) }));
  const idx = makeIndex(feats, 40);
  const cand = []; for (let i = 0; i < n; i++) if (world.cells.water[i] === 0 && !world.cells.fog[i] && world.cells.r3[i] >= 0) cand.push(i);
  let seed = 7, same = 0, tried = 0;
  for (let k = 0; k < 400; k++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const i = cand[seed % cand.length];
    const [cx, cy] = grid.center(i % G.cols, (i / G.cols) | 0);
    const f = idx.find(G.origin.X0 + cx, G.origin.Y1 - cy);
    if (f < 0) continue; tried++;
    if (feats[f].id === r3[world.cells.r3[i]].id) same++;
  }
  ok(tried > 300 && same / tried >= 0.9, `格子归属独立复算:${same}/${tried} 一致`);
}
// 区域判定双向复算:独立实现全部 8 条规则,算出的集合必须与发布的完全相同(多给、漏给都算错)
{
  const { makeHexGrid } = await import("./lib/geo.mjs");
  const grid = makeHexGrid({ r: world.grid.r, cols: world.grid.cols, rows: world.grid.rows });
  const EST = { info: "J", finance: "K", professional: "M_N", arts: "R-U" };
  const avg = {};
  for (const k of ["agri", "industry", "construction", "info", "finance", "realestate", "professional", "arts"]) {
    let a = 0, d = 0;
    for (const r of r3) if (r.jobs?.[k] != null && !(EST[k] && r.jobs_estimated.includes(EST[k]))) { a += r.jobs[k]; d += r.jobs.total; }
    avg[k] = a / d;
  }
  const LQ = (r, ks) => { if (!r.jobs) return NaN; const v = ks.reduce((t, k) => t + (r.jobs[k] ?? NaN), 0); return v / r.jobs.total / ks.reduce((t, k) => t + avg[k], 0); };
  const th = Object.fromEntries(meta.districts.map((d) => [d.key, d]));
  const diffs = [];
  for (const c of cities) {
    const r = r3[c.r3], r2 = r.r2 >= 0 ? regions.r2[r.r2] : null, est = new Set(r.jobs_estimated);
    const want = new Set();
    if (c.capital) want.add("gov");
    if (r2?.rd_pct >= th.campus.min_rd || (LQ(r, ["info", "professional"]) >= th.campus.min_lq && !est.has("J") && !est.has("M_N"))) want.add("campus");
    if (LQ(r, ["industry", "construction"]) >= th.industrial.min_lq) want.add("industrial");
    if (LQ(r, ["finance", "realestate", "professional"]) >= th.commercial.min_lq && !est.has("K") && !est.has("M_N")) want.add("commercial");
    if (LQ(r, ["arts"]) >= th.theater.min_lq && !est.has("R-U")) want.add("theater");
    if (r2?.nights_pc >= th.entertainment.min_nights_pc) want.add("entertainment");
    if (c.cell >= 0 && [c.cell, ...grid.neighbors(c.cell)].some((j) => j >= 0 && world.cells.water[j] === 2)) want.add("harbor");
    if (LQ(r, ["agri"]) >= th.farm.min_lq) want.add("farm");
    const got = new Set(c.districts.map((d) => d.key));
    for (const k of want) if (!got.has(k)) diffs.push(`${c.name} 漏 ${k}`);
    for (const k of got) if (!want.has(k)) diffs.push(`${c.name} 多 ${k}`);
  }
  ok(diffs.length === 0, `区域判定独立复算与发布完全一致(差异 ${diffs.length}:${diffs.slice(0, 6).join(",")})`);
}
// 网格父子一致:每格的 NUTS3 必须属于该格的 NUTS2
{
  let bad = 0; for (let i = 0; i < n; i++) { const k3 = world.cells.r3[i], k2 = world.cells.r2[i]; if (k3 >= 0 && (k2 < 0 || !r3[k3].id.startsWith(regions.r2[k2].id))) bad++; }
  ok(bad === 0, `每格的 NUTS3 都属于其 NUTS2(违规 ${bad} 格)`);
}
// 电站:装机量级合理、状态都在白名单
{
  const B = readJSON("wikidata/power.json").results.bindings;
  const st = new Map(); for (const b of B) { const id = b.item.value.split("/").pop(); if (!st.has(id)) st.set(id, new Set()); if (b.use) st.get(id).add(b.use.value.split("/").pop()); }
  const badUse = places.resources.filter((r) => [...(st.get(r.id) || [])].some((u) => !["Q55654238", "Q109551035"].includes(u)));
  ok(badUse.length === 0, `收录电站的 P5817 状态只可能是在用/部分运行(违规 ${badUse.length})`);
  const closed = new Set(B.filter((b) => b.end || b.closed || b.badType).map((b) => b.item.value.split("/").pop()));
  const badClosed = places.resources.filter((r) => closed.has(r.id) || !r.name);
  ok(badClosed.length === 0, `收录电站无关闭日期、解散日期、拟建/在建/退役类型,且都有名称(违规 ${badClosed.length})`);
  const big = places.resources.filter((r) => r.mw != null && (r.mw > 7000 || r.mw <= 0));
  ok(big.length === 0, `电站装机在 0–7000 MW 之间(越界 ${big.length}:${big.map((r) => r.name + " " + r.mw).join(";")})`);
}
// 城市不应来自非 NUTS 国家:城市坐标若落在 Natural Earth 的迷雾国家(白俄罗斯、叙利亚、伊拉克等)轮廓里即违规
{
  const { makeLAEA, projectGeometry, makeIndex } = await import("./lib/geo.mjs");
  const G = JSON.parse(fs.readFileSync(path.join(RAW, "derived/grid.json"), "utf8"));
  const proj = makeLAEA(10, 52);
  const toGrid = (lon, lat) => { const [x, y] = proj.forward(lon, lat); return [x - G.origin.X0, G.origin.Y1 - y]; };
  const fog = new Set(world.countries.filter((c) => !c.nuts).map((c) => c.code));
  const feats = readJSON("ne/ne_50m_admin_0_countries.geojson").features
    .filter((f) => { let c = f.properties.ISO_A2_EH || f.properties.ISO_A2; if (c === "GB") c = "UK"; return fog.has(c); })
    .map((f) => ({ name: f.properties.NAME, polys: projectGeometry(f.geometry, toGrid) }));
  const idx = makeIndex(feats, 50);
  const bad = cities.filter((c) => idx.find(c.x, c.y) >= 0);
  ok(bad.length === 0, `无境外城市被归入 NUTS 国家(违规 ${bad.length}:${bad.map((c) => c.name + "@" + feats[idx.find(c.x, c.y)].name).join(",")})`);
}
const campus = cities.filter((c) => c.districts.some((d) => d.key === "campus")).map((c) => c.name);
console.log(`学院城市示例: ${campus.slice(0, 12).join("、")}`);
console.log(`陆地 ${land} 格,其中有数据 ${landData} 格`);
if (fails.length) { console.log(`\n${fails.length} 项不合格`); process.exit(1); }
console.log("\n全部通过");
