// 第 1 步:把所有原始数据下载到 raw/(不入库)。可重复运行,已下载的跳过。
// 用法: node pipeline/fetch.mjs [组名...]   组名: geo elev stat wd
import { download } from "./lib/net.mjs";
import { SOURCES } from "./sources.mjs";

const want = new Set(process.argv.slice(2));
const jobs = [];
for (const s of SOURCES) {
  if (want.size && !want.has(s.group)) continue;
  for (const f of s.files) jobs.push({ src: s.id, ...f });
}

let ok = 0, fail = 0;
// 适度并发:同一主机不超过 3 个
const byHost = new Map();
for (const j of jobs) {
  const h = new URL(j.url).host;
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(j);
}
await Promise.all(
  [...byHost.values()].map(async (list) => {
    // 维基数据查询服务对并发很敏感(429),串行并间隔 3 秒
    const serial = new URL(list[0].url).host === "query.wikidata.org";
    const L = serial ? 1 : 3;
    const lanes = Array.from({ length: Math.min(L, list.length) }, async (_, k) => {
      for (let i = k; i < list.length; i += L) {
        const j = list[i];
        if (serial && i > 0) await new Promise((r) => setTimeout(r, 3000));
        const t0 = Date.now();
        try {
          await download(j.url, j.file, { timeoutMs: j.timeoutMs || 180000, headers: j.headers });
          ok++;
          console.log(`ok   ${j.file}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        } catch (e) {
          fail++;
          console.log(`FAIL ${j.file}: ${e.message}`);
        }
      }
    });
    await Promise.all(lanes);
  }),
);
console.log(`done: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
