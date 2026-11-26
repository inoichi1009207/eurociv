// 诊断:给定经纬度,查它落在哪个 NUTS3(与 build 同法)。只读。
import fs from "node:fs"; import path from "node:path";
import { RAW, readJSON } from "./lib/net.mjs";
import { makeLAEA, projectGeometry, makeIndex, inPolys } from "./lib/geo.mjs";
const G = JSON.parse(fs.readFileSync(path.join(RAW, "derived/grid.json"), "utf8"));
const proj = makeLAEA(10, 52);
const toGrid = (lon, lat) => { const [x, y] = proj.forward(lon, lat); return [x - G.origin.X0, G.origin.Y1 - y]; };
const gj = readJSON("gisco/nuts2024_l3.geojson");
const byId = new Map(gj.features.map((f) => [f.properties.NUTS_ID, f]));
const polys = G.n3.map((f) => ({ id: f.id, polys: projectGeometry(byId.get(f.id).geometry, toGrid) }));
const idx = makeIndex(polys, 40);
for (const [lon, lat] of [[12.4828, 41.893], [28.9603, 41.01], [2.35, 48.85]]) {
  const [x, y] = toGrid(lon, lat); const k = idx.find(x, y);
  const brute = polys.findIndex((p) => inPolys(x, y, p.polys));
  console.log(lon, lat, "->", k >= 0 ? polys[k].id : -1, "brute", brute >= 0 ? polys[brute].id : -1);
}
