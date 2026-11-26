// 诊断:某个维基数据城市在 build 的筛选链上卡在哪一步。只读。用法: node pipeline/probe-city.mjs Q220 Q406
import { readJSON } from "./lib/net.mjs";
const rows = readJSON("wikidata/cities.json").results.bindings;
for (const id of process.argv.slice(2)) {
  const mine = rows.filter((b) => b.item.value.endsWith("/" + id));
  console.log(id, "rows:", mine.length, mine.slice(0, 3).map((b) => `${b.coord.value} pop=${b.pop.value} cap=${b.capital?.value.split("/").pop()}`).join(" ; "));
  if (!mine.length) continue;
  const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(mine[0].coord.value);
  const [lon, lat] = [+m[1], +m[2]];
  const near = new Map();
  for (const b of rows) {
    const p = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.coord.value);
    const d = Math.hypot((+p[1] - lon) * Math.cos((lat * Math.PI) / 180), +p[2] - lat) * 111;
    if (d < 6 && !b.item.value.endsWith("/" + id)) near.set(b.item.value.split("/").pop(), `${b.n_en?.value}|${b.n_zh?.value}|pop=${b.pop.value}|d=${d.toFixed(1)}km`);
  }
  console.log("  within 6km:", [...near.entries()].map(([k, v]) => k + " " + v).join("\n    "));
}
