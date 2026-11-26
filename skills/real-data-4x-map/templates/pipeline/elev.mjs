// 第 3 步:按格采样海拔(NOAA ETOPO1,经 OpenTopoData 公共 API)。
// 公共 API 限额:每次 ≤100 点、每秒 1 次、每天 1000 次 —— 这里按 1.15 秒间隔串行,并逐批写缓存,可断点续跑。
// 采样:陆地格 4 点(中心 + 3 个交替顶点方向),近岸 4 格内的水格 1 点(判浅海/深海),更远的海不采样(按深海处理)。
import fs from "node:fs";
import path from "node:path";
import { RAW } from "./lib/net.mjs";
import { makeLAEA, makeHexGrid } from "./lib/geo.mjs";

const G = JSON.parse(fs.readFileSync(path.join(RAW, "derived/grid.json"), "utf8"));
const grid = makeHexGrid({ r: G.hexR, cols: G.cols, rows: G.rows });
const proj = makeLAEA(10, 52);
const CACHE = path.join(RAW, "elev/samples.json");
fs.mkdirSync(path.dirname(CACHE), { recursive: true });
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

// 离陆地的格距(BFS)
const N = grid.count, dist = new Int16Array(N).fill(99), q = [];
for (let i = 0; i < N; i++) if (G.water[i] === 0) { dist[i] = 0; q.push(i); }
for (let h = 0; h < q.length; h++) for (const j of grid.neighbors(q[h])) if (j >= 0 && dist[j] > dist[q[h]] + 1) { dist[j] = dist[q[h]] + 1; q.push(j); }

const pts = []; // [key, lat, lon]
const OFF = [[0, 0], ...[0, 2, 4].map((k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [Math.cos(a) * 0.65 * G.hexR, Math.sin(a) * 0.65 * G.hexR]; })];
for (let i = 0; i < N; i++) {
  const nS = G.water[i] === 0 ? (G.foreign[i] ? 1 : 4) : dist[i] <= 4 ? 1 : 0;
  const [cx, cy] = grid.center(i % G.cols, (i / G.cols) | 0);
  for (let s = 0; s < nS; s++) {
    const key = `${i}.${s}`;
    if (key in cache) continue;
    const [lon, lat] = proj.inverse(G.origin.X0 + cx + OFF[s][0], G.origin.Y1 - (cy + OFF[s][1]));
    pts.push([key, +lat.toFixed(4), +lon.toFixed(4)]);
  }
}
const batches = Math.ceil(pts.length / 100);
console.log(`to sample: ${pts.length} points in ${batches} calls (cached ${Object.keys(cache).length})`);
if (batches > 990) { console.log("超过公共 API 每日 1000 次上限,请分天运行(脚本可续跑)"); }

let done = 0;
for (let b = 0; b < Math.min(batches, 990); b++) {
  const chunk = pts.slice(b * 100, b * 100 + 100);
  const url = "https://api.opentopodata.org/v1/etopo1?locations=" + chunk.map((p) => `${p[1]},${p[2]}`).join("|");
  const t0 = Date.now();
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "eurociv-builder/0.1" } });
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 5000)); continue; }
      const j = await r.json();
      if (j.status !== "OK") throw new Error(j.error || j.status);
      j.results.forEach((res, k) => { cache[chunk[k][0]] = res.elevation === null ? null : Math.round(res.elevation); });
      ok = true;
    } catch (e) {
      console.log(`batch ${b} attempt ${attempt}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
    }
  }
  if (!ok) { console.log(`batch ${b} gave up`); continue; }
  done++;
  if (done % 10 === 0 || b === batches - 1) {
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`${done}/${batches} calls, cached ${Object.keys(cache).length}`);
  }
  const wait = 1150 - (Date.now() - t0);
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
}
fs.writeFileSync(CACHE, JSON.stringify(cache));
console.log(`finished: ${Object.keys(cache).length} samples cached`);
