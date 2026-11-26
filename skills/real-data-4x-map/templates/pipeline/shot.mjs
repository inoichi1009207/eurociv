// 无头浏览器截图(没有浏览器扩展时用)。用法:node pipeline/shot.mjs <输出.png> [hash] [宽x高]
// 依赖本机已装的 Edge 或 Chrome;本地服务需已在 8765 端口运行。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [out, hash = "", size = "1600x1000"] = process.argv.slice(2);
if (!out) { console.error("用法: node pipeline/shot.mjs <out.png> [hash] [WxH]"); process.exit(2); }
const candidates = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const exe = candidates.find((p) => fs.existsSync(p));
if (!exe) { console.error("找不到 Edge/Chrome"); process.exit(2); }
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "shot-"));
const [w, h] = size.split("x");
const args = ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${prof}`, `--window-size=${w},${h}`,
  "--virtual-time-budget=9000", `--screenshot=${path.resolve(out)}`, `http://127.0.0.1:8765/${hash ? "#" + hash : ""}`];
const p = spawn(exe, args, { windowsHide: true, stdio: "ignore" });
const timer = setTimeout(() => { p.kill(); console.error("超时"); process.exit(1); }, 40000);
p.on("exit", () => { clearTimeout(timer); fs.rmSync(prof, { recursive: true, force: true }); console.log(fs.existsSync(out) ? `ok ${out}` : "未生成"); });
