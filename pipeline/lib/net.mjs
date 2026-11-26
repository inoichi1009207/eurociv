// 下载工具:带超时、重试、断点跳过(已存在且非空的文件不重下)。
import fs from "node:fs";
import path from "node:path";

export const RAW = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../raw");

export async function download(url, file, { timeoutMs = 120000, retries = 3, headers = {} } = {}) {
  const out = path.join(RAW, file);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "eurociv-builder/0.1 (open data map)", ...headers },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length === 0) throw new Error(`empty body for ${url}`);
      fs.writeFileSync(out + ".part", buf);
      fs.renameSync(out + ".part", out);
      return out;
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

export function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(RAW, file), "utf8"));
}
