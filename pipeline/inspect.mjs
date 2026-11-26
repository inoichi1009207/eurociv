// 诊断:各数据集的 geo 代码与 NUTS 2024 边界的匹配率、最新年份。只读,不产出。
import { readJSON } from "./lib/net.mjs";
import { flatten, commonYear } from "./lib/jsonstat.mjs";

const l3 = readJSON("gisco/nuts2024_l3.geojson");
const l2 = readJSON("gisco/nuts2024_l2.geojson");
const ids3 = new Set(l3.features.map((f) => f.properties.NUTS_ID));
const ids2 = new Set(l2.features.map((f) => f.properties.NUTS_ID));
const ctry = [...new Set(l3.features.map((f) => f.properties.CNTR_CODE))].sort();
console.log("NUTS3", ids3.size, "NUTS2", ids2.size, "countries", ctry.join(","));
console.log("props", JSON.stringify(l3.features[0].properties));

const sets = {
  nama_10r_3gdp: [ids3, (r) => r.unit === "MIO_EUR"],
  nama_10r_3empers: [ids3, (r) => r.nace_r2 === "TOTAL"],
  demo_r_pjanaggr3: [ids3, () => true],
  demo_r_d3area: [ids3, () => true],
  nama_10r_2gdp: [ids2, (r) => r.unit === "PPS_HAB_EU27_2020"],
  rd_e_gerdreg: [ids2, (r) => r.unit === "PC_GDP"],
  tour_occ_nin2: [ids2, (r) => r.unit === "NR"],
  lfst_r_lfu3rt: [ids2, () => true],
  edat_lfse_04: [ids2, () => true],
  lan_lcv_ovw: [ids2, (r) => r.landcover === "C00"],
};
for (const [ds, [ids, f]] of Object.entries(sets)) {
  const js = readJSON(`eurostat/${ds}.json`);
  const rows = flatten(js).filter(f);
  const y = commonYear(rows);
  const have = new Set(rows.filter((r) => +r.time === y).map((r) => r.geo));
  const anyYear = new Set(rows.map((r) => r.geo));
  const hit = [...ids].filter((g) => have.has(g)).length;
  const hitAny = [...ids].filter((g) => anyYear.has(g)).length;
  const missC = new Map();
  for (const g of ids) if (!anyYear.has(g)) missC.set(g.slice(0, 2), (missC.get(g.slice(0, 2)) || 0) + 1);
  console.log(`${ds.padEnd(18)} year=${y} match@year=${hit}/${ids.size} anyYear=${hitAny} missing-by-country=${JSON.stringify(Object.fromEntries(missC))}`);
  if (ds === "nama_10r_2gdp") console.log("  units:", JSON.stringify(js.dimension.unit.category.label));
}
