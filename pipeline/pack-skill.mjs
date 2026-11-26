// 把参考实现(管线 + 网页,不含数据)复制进 skill 的 templates/,让 skill 单独拷走也能用。
// node pipeline/pack-skill.mjs          复制
// node pipeline/pack-skill.mjs --check  只核对是否同步(不同步则退出码 1,发布前跑)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DEST = path.join(ROOT, "skills/real-data-4x-map/templates");
const SKIP = /^(probe|inspect)/; // 诊断脚本不进模板
const files = [];
const walk = (dir, rel = "") => {
  for (const e of fs.readdirSync(path.join(ROOT, dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) { if (!(dir === "site" && e.name === "data")) walk(dir, r); }
    else if (!SKIP.test(e.name)) files.push(path.join(dir, r));
  }
};
walk("pipeline"); walk("site");
files.push("package.json", ".gitignore");

const check = process.argv.includes("--check");
let diff = 0;
for (const f of files) {
  const src = path.join(ROOT, f), dst = path.join(DEST, f);
  const same = fs.existsSync(dst) && fs.readFileSync(dst).equals(fs.readFileSync(src));
  if (same) continue;
  diff++;
  if (check) { console.log(`不同步: ${f}`); continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
console.log(check ? (diff ? `${diff} 个文件不同步` : `模板与仓库一致(${files.length} 个文件)`) : `已复制 ${diff} 个文件到 templates/(共 ${files.length})`);
process.exit(check && diff ? 1 : 0);
