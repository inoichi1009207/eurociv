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
  ok(worst < 0.01 && tested > 30, `${label}:${tested} 个「国家×年」NUTS3 之和对国家值,最大偏差 ${(worst * 100).toFixed(3)}%(${worstK})`);
}
reconcile(flatten(readJSON("eurostat/nama_10r_3gdp.json")).filter((r) => r.unit === "MIO_EUR"), "GDP 对账");
reconcile(flatten(readJSON("eurostat/demo_r_pjanaggr3.json")), "人口对账");
// 地图里的数与原始数据逐条一致(抽 50 个地区)
const rawGdp = new Map(); for (const r of flatten(readJSON("eurostat/nama_10r_3gdp.json"))) if (r.unit === "MIO_EUR") rawGdp.set(`${r.geo}|${r.time}`, r.value);
const sample = r3.filter((r) => r.gdp != null).filter((_, k) => k % 23 === 0).slice(0, 50);
ok(sample.every((r) => Math.abs(rawGdp.get(`${r.id}|${r.gdp_year}`) - r.gdp) <= 1), `抽查 ${sample.length} 个地区的 GDP 与原始数据一致(误差 ≤ 1 百万欧元,取整所致)`);
const skippedPop = flatten(readJSON("eurostat/demo_r_pjanaggr3.json")).filter((r) => world.skipped.some((s) => s.id === r.geo) && r.time === "2025").reduce((s, r) => s + r.value, 0);
console.log(`信息:略去的远方地区 2025 年人口合计 ${Math.round(skippedPop / 1e4)} 万`);

// 抽查:几座城市应落在预期 NUTS3、并是首都
const expect = [["巴黎", "FR101"], ["柏林", "DE300"], ["罗马", "ITI43"], ["华沙", "PL911"], ["维也纳", "AT130"]];
for (const [name, id] of expect) {
  const c = cities.find((x) => x.name === name);
  ok(c && r3[c.r3].id === id && c.capital, `${name} → ${c ? r3[c.r3].id : "未找到"}${c?.capital ? " 首都" : ""}(预期 ${id} 首都)`);
}
const campus = cities.filter((c) => c.districts.some((d) => d.key === "campus")).map((c) => c.name);
console.log(`学院城市示例: ${campus.slice(0, 12).join("、")}`);
console.log(`陆地 ${land} 格,其中有数据 ${landData} 格`);
if (fails.length) { console.log(`\n${fails.length} 项不合格`); process.exit(1); }
console.log("\n全部通过");
