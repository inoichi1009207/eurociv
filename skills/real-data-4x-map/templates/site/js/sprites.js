// 程序化绘制的地图插画:农田拼块、牧场、森林、针叶林、山、丘陵、荒漠、冻土、雪地、沼泽、
// 等距城市楼群(按人口分档)、郊区、农舍、机场、港口、电厂(核/煤/气/水/风/光)、奇观神殿。
// 每种图块按 (种类, 变体, 尺寸档) 缓存成离屏画布,地图绘制时直接贴图。
const SQ3 = Math.sqrt(3);
const cache = new Map();

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function hexClip(g, u) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; const x = Math.cos(a) * u, y = Math.sin(a) * u; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }
function canvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

// ---------- 小部件 ----------
function tree(g, x, y, s, r, conifer) {
  g.fillStyle = "rgba(30,40,20,.25)"; g.beginPath(); g.ellipse(x + s * 0.25, y + s * 0.05, s * 0.55, s * 0.22, 0, 0, 7); g.fill();
  if (conifer) {
    g.fillStyle = "#4a3a26"; g.fillRect(x - s * 0.06, y - s * 0.25, s * 0.12, s * 0.28);
    for (const [k, w] of [[0, 0.5], [0.35, 0.4], [0.65, 0.28]]) {
      g.fillStyle = k === 0 ? "#2c5232" : "#386340";
      g.beginPath(); g.moveTo(x - s * w, y - s * (0.2 + k * 0.6)); g.lineTo(x, y - s * (0.95 + k * 0.55)); g.lineTo(x + s * w, y - s * (0.2 + k * 0.6)); g.closePath(); g.fill();
    }
  } else {
    g.fillStyle = "#5a4128"; g.fillRect(x - s * 0.07, y - s * 0.4, s * 0.14, s * 0.42);
    const c = ["#3f6e2e", "#4d7d35", "#55803a", "#6b8f3a"][Math.floor(r() * 4)];
    g.fillStyle = c; g.beginPath(); g.arc(x, y - s * 0.72, s * 0.45, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,220,.18)"; g.beginPath(); g.arc(x - s * 0.14, y - s * 0.86, s * 0.2, 0, 7); g.fill();
  }
}
function box(g, x, y, w, h, top, left, right) {
  // 等距方块:底面中心 (x,y),宽 w(屏幕),高 h
  const d = w / 2, q = w / 4;
  g.fillStyle = left; g.beginPath(); g.moveTo(x - d, y - h); g.lineTo(x, y + q - h); g.lineTo(x, y + q); g.lineTo(x - d, y); g.closePath(); g.fill();
  g.fillStyle = right; g.beginPath(); g.moveTo(x + d, y - h); g.lineTo(x, y + q - h); g.lineTo(x, y + q); g.lineTo(x + d, y); g.closePath(); g.fill();
  g.fillStyle = top; g.beginPath(); g.moveTo(x, y - q - h); g.lineTo(x + d, y - h); g.lineTo(x, y + q - h); g.lineTo(x - d, y - h); g.closePath(); g.fill();
}
function house(g, x, y, s, r) {
  const roof = ["#b5523b", "#a6452f", "#8e5b3e", "#7b6a5a"][Math.floor(r() * 4)];
  box(g, x, y, s, s * 0.45, "#e8dcc4", "#cdbd9f", "#b8a888");
  g.fillStyle = roof; g.beginPath(); g.moveTo(x - s / 2, y - s * 0.45); g.lineTo(x, y - s * 0.95); g.lineTo(x + s / 2, y - s * 0.45); g.lineTo(x, y - s * 0.2); g.closePath(); g.fill();
}
function barn(g, x, y, s) {
  g.fillStyle = "rgba(30,30,20,.25)"; g.beginPath(); g.ellipse(x + s * 0.3, y + s * 0.1, s * 0.8, s * 0.25, 0, 0, 7); g.fill();
  g.fillStyle = "#d9d4c8"; g.fillRect(x - s * 0.75, y - s * 0.95, s * 0.28, s * 0.95);
  g.fillStyle = "#b9b3a6"; g.beginPath(); g.arc(x - s * 0.61, y - s * 0.95, s * 0.14, Math.PI, 0); g.fill();
  box(g, x + s * 0.1, y, s * 0.9, s * 0.45, "#a23a2c", "#b8402f", "#962f23");
  g.fillStyle = "#7d281f"; g.beginPath(); g.moveTo(x + s * 0.1 - s * 0.45, y - s * 0.45); g.lineTo(x + s * 0.1, y - s * 0.85); g.lineTo(x + s * 0.1 + s * 0.45, y - s * 0.45); g.lineTo(x + s * 0.1, y - s * 0.22); g.closePath(); g.fill();
  g.strokeStyle = "#f4eee2"; g.lineWidth = Math.max(0.6, s * 0.05); g.strokeRect(x - s * 0.08, y - s * 0.38, s * 0.16, s * 0.3);
}

// ---------- 地形图块 ----------
const BASE = { fields: "#b7a95a", pasture: "#8fb15a", forest: "#5f8a43", conifer: "#557a45", mountain: "#8b8273", hillsOnly: "#9aa35e", desert: "#dcc690", tundra: "#a7a98e", snow: "#eef2f5", marsh: "#7f9a6a" };
function drawTerrain(g, kind, u, r) {
  const W = SQ3 * u;
  g.fillStyle = BASE[kind] || "#8fb15a"; g.fillRect(-W, -u * 1.2, W * 2, u * 2.4);
  if (kind === "fields") {
    // 农田拼块:随机分割的矩形条,带细田埂
    const C = ["#c9b45a", "#d8c46e", "#a9b84f", "#8fae4a", "#b9963f", "#9c7b45", "#cdbd7a", "#7fa346", "#b5c26a", "#c7a45a"];
    const cell = u * 0.42;
    for (let y = -u * 1.1; y < u * 1.1; y += cell) {
      let x = -W * 0.6 - r() * cell;
      while (x < W * 0.6) {
        const w = cell * (0.6 + r() * 1.4);
        g.fillStyle = C[Math.floor(r() * C.length)]; g.fillRect(x, y, w, cell);
        if (u > 14 && r() < 0.5) { g.strokeStyle = "rgba(255,255,230,.12)"; g.lineWidth = 1; for (let k = 2; k < w; k += 3) { g.beginPath(); g.moveTo(x + k, y + 1); g.lineTo(x + k, y + cell - 1); g.stroke(); } }
        g.strokeStyle = "rgba(80,70,40,.35)"; g.lineWidth = Math.max(0.5, u * 0.02); g.strokeRect(x, y, w, cell);
        x += w;
      }
    }
  } else if (kind === "pasture") {
    g.strokeStyle = "rgba(255,255,220,.10)"; g.lineWidth = u * 0.12;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(-W, k * u * 0.35 + u * 0.2); g.lineTo(W, k * u * 0.35 - u * 0.2); g.stroke(); }
    g.strokeStyle = "rgba(60,90,40,.55)"; g.lineWidth = Math.max(0.8, u * 0.05);
    for (let k = 0; k < 3; k++) { const y0 = (r() - 0.5) * u * 1.3; g.beginPath(); g.moveTo(-W * 0.6, y0); g.lineTo(W * 0.6, y0 - u * 0.3 + r() * u * 0.6); g.stroke(); }
    for (let k = 0; k < 2; k++) tree(g, (r() - 0.5) * W * 0.8, (r() - 0.3) * u, u * 0.32, r, false);
  } else if (kind === "forest" || kind === "conifer") {
    const pts = [];
    for (let k = 0; k < 16; k++) pts.push([(r() - 0.5) * W * 0.95, (r() - 0.45) * u * 1.6]);
    pts.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => tree(g, x, y + u * 0.25, u * (0.32 + r() * 0.12), r, kind === "conifer"));
  } else if (kind === "mountain") {
    const peaks = [[-0.38, 0.45, 0.62], [0.35, 0.5, 0.58], [0, 0.3, 0.8]];
    for (const [ox, oy, sz] of peaks) {
      const bx = ox * u, by = oy * u, h = sz * u * 1.25, w = sz * u * 0.95;
      g.fillStyle = "#9a9081"; g.beginPath(); g.moveTo(bx - w, by); g.lineTo(bx, by - h); g.lineTo(bx + w, by); g.closePath(); g.fill();
      g.fillStyle = "#6c6358"; g.beginPath(); g.moveTo(bx, by - h); g.lineTo(bx + w, by); g.lineTo(bx + w * 0.15, by); g.closePath(); g.fill();
      g.fillStyle = "#f6f7f8"; g.beginPath(); g.moveTo(bx - w * 0.36, by - h * 0.64); g.lineTo(bx, by - h); g.lineTo(bx + w * 0.36, by - h * 0.64); g.lineTo(bx + w * 0.12, by - h * 0.7); g.lineTo(bx - w * 0.05, by - h * 0.6); g.closePath(); g.fill();
    }
  } else if (kind === "desert") {
    g.strokeStyle = "rgba(170,130,70,.45)"; g.lineWidth = Math.max(0.8, u * 0.04);
    for (let k = 0; k < 5; k++) { const y0 = (r() - 0.5) * u * 1.4, x0 = (r() - 0.5) * W * 0.6; g.beginPath(); g.moveTo(x0 - u * 0.4, y0); g.quadraticCurveTo(x0, y0 - u * 0.25, x0 + u * 0.4, y0); g.stroke(); }
    g.fillStyle = "#8a8a4a"; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc((r() - 0.5) * W * 0.8, (r() - 0.5) * u * 1.3, u * 0.06, 0, 7); g.fill(); }
  } else if (kind === "tundra") {
    g.strokeStyle = "#7f8a67"; g.lineWidth = Math.max(0.6, u * 0.03);
    for (let k = 0; k < 14; k++) { const x = (r() - 0.5) * W * 0.9, y = (r() - 0.5) * u * 1.5; g.beginPath(); g.moveTo(x - u * 0.05, y); g.lineTo(x, y - u * 0.1); g.lineTo(x + u * 0.05, y); g.stroke(); }
    g.fillStyle = "#c9cbbd"; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse((r() - 0.5) * W * 0.7, (r() - 0.5) * u, u * 0.12, u * 0.07, 0, 0, 7); g.fill(); }
  } else if (kind === "snow") {
    g.fillStyle = "#d3dde6"; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse((r() - 0.5) * W * 0.8, (r() - 0.5) * u * 1.3, u * 0.3, u * 0.08, -0.3, 0, 7); g.fill(); }
  } else if (kind === "marsh") {
    g.fillStyle = "#6fa7c4"; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse((r() - 0.5) * W * 0.7, (r() - 0.5) * u * 1.2, u * 0.22, u * 0.09, 0, 0, 7); g.fill(); }
    g.strokeStyle = "#4e6b3a"; g.lineWidth = Math.max(0.6, u * 0.03);
    for (let k = 0; k < 12; k++) { const x = (r() - 0.5) * W * 0.9, y = (r() - 0.5) * u * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - u * 0.04, y - u * 0.18); g.moveTo(x, y); g.lineTo(x + u * 0.05, y - u * 0.16); g.stroke(); }
  }
}
function drawHills(g, u, r) {
  for (const [ox, oy] of [[-0.35, 0.3], [0.3, 0.1], [-0.05, -0.35]]) {
    const x = ox * u + (r() - 0.5) * u * 0.1, y = oy * u, w = u * 0.42;
    const gr = g.createLinearGradient(x - w, y - w * 0.6, x + w, y);
    gr.addColorStop(0, "rgba(255,250,220,.30)"); gr.addColorStop(1, "rgba(60,50,20,.28)");
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - w * 1.1, x + w, y); g.closePath(); g.fill();
  }
}

// ---------- 城市 ----------
export function cityTier(pop) { return pop >= 3e6 ? 4 : pop >= 1e6 ? 3 : pop >= 4e5 ? 2 : pop >= 2e5 ? 1 : 0; }
function drawCity(g, u, r, tier) {
  // 地面
  g.fillStyle = "#c9c0a8"; g.fillRect(-u * 2, -u * 2, u * 4, u * 4);
  g.strokeStyle = "rgba(120,110,90,.5)"; g.lineWidth = Math.max(0.6, u * 0.025);
  for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(-u * 1.2, k * u * 0.22 - u * 0.6); g.lineTo(u * 1.2, k * u * 0.22 + u * 0.6); g.stroke(); g.beginPath(); g.moveTo(-u * 1.2, k * u * 0.22 + u * 0.6); g.lineTo(u * 1.2, k * u * 0.22 - u * 0.6); g.stroke(); }
  // 等距地块,中心高、外圈低
  const lots = [];
  const n = [3, 4, 5, 5, 6][tier];
  const step = (u * 1.5) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = (i - j) * step * 0.5 * 1.15, y = (i + j - (n - 1)) * step * 0.29 + u * 0.15;
    if (Math.hypot(x / u, y / u * 1.6) > 0.82) continue;
    const dc = Math.hypot(x, y * 1.8) / u;
    lots.push([x, y, dc]);
  }
  lots.sort((a, b) => a[1] - b[1]);
  const maxH = [0.25, 0.4, 0.6, 0.85, 1.15][tier] * u;
  const palettes = [["#e9e4d8", "#c9c2b2", "#b3ab99"], ["#d9cbb3", "#b9a98d", "#a39276"], ["#c8d4de", "#9fb1c0", "#8799aa"], ["#e2d2c2", "#c1a991", "#a88f78"], ["#b8c7d6", "#8ea2b6", "#768aa0"]];
  for (const [x, y, dc] of lots) {
    const w = step * (0.62 + r() * 0.15);
    if (r() < 0.12 && dc > 0.35) { tree(g, x, y + w * 0.2, w * 0.7, r, false); continue; }
    const tall = Math.max(0.15, 1 - dc * 1.15) * maxH * (0.45 + r() * 0.75);
    if (tier <= 1 || tall < u * 0.18) { house(g, x, y, w * 0.9, r); continue; }
    const p = palettes[Math.floor(r() * palettes.length)];
    box(g, x, y, w, tall, p[0], p[1], p[2]);
    // 窗户条
    if (u > 18) { g.fillStyle = "rgba(60,80,110,.35)"; for (let k = w * 0.4; k < tall - 2; k += Math.max(2, u * 0.08)) g.fillRect(x - w / 2 + w * 0.12, y - k, w * 0.3, Math.max(0.6, u * 0.02)); }
  }
}
function drawSuburb(g, u, r) {
  g.fillStyle = "#9db667"; g.fillRect(-u * 2, -u * 2, u * 4, u * 4);
  const pts = []; for (let k = 0; k < 9; k++) pts.push([(r() - 0.5) * u * 1.3, (r() - 0.5) * u * 1.1]);
  pts.sort((a, b) => a[1] - b[1]).forEach(([x, y], k) => (k % 3 === 2 ? tree(g, x, y, u * 0.28, r, false) : house(g, x, y, u * 0.24, r)));
}

// ---------- 设施与奇观(不裁成六边形的小物件,画在格内偏一侧) ----------
function drawFacility(g, kind, u, r) {
  const s = u * 0.55;
  g.lineCap = "round";
  if (kind === "airport") {
    g.save(); g.rotate(-0.45);
    g.fillStyle = "#5b5b58"; g.fillRect(-s * 1.1, -s * 0.12, s * 2.2, s * 0.24);
    g.strokeStyle = "#f2f2f2"; g.lineWidth = Math.max(0.5, s * 0.04); g.setLineDash([s * 0.12, s * 0.1]); g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke(); g.setLineDash([]);
    g.restore();
    g.fillStyle = "#f7f7f7"; g.beginPath(); g.moveTo(s * 0.55, -s * 0.55); g.lineTo(s * 0.62, -s * 0.2); g.lineTo(s * 0.95, -s * 0.05); g.lineTo(s * 0.6, -s * 0.08); g.lineTo(s * 0.55, s * 0.18); g.lineTo(s * 0.5, -s * 0.08); g.lineTo(s * 0.15, -s * 0.05); g.lineTo(s * 0.48, -s * 0.2); g.closePath(); g.fill();
    box(g, -s * 0.5, s * 0.55, s * 0.6, s * 0.25, "#dfe6ec", "#b9c4ce", "#9fabb6");
  } else if (kind === "port") {
    g.fillStyle = "#7a6a55"; g.fillRect(-s * 0.9, s * 0.2, s * 1.8, s * 0.25);
    g.strokeStyle = "#d8762c"; g.lineWidth = Math.max(1, s * 0.08); g.beginPath(); g.moveTo(-s * 0.3, s * 0.2); g.lineTo(-s * 0.3, -s * 0.8); g.lineTo(s * 0.5, -s * 0.8); g.moveTo(-s * 0.3, -s * 0.5); g.lineTo(s * 0.1, -s * 0.8); g.stroke();
    for (const [x, c] of [[0.2, "#3d6fb6"], [0.45, "#c8503c"], [0.7, "#4f9a5a"]]) box(g, x * s - s * 0.2, s * 0.18, s * 0.22, s * 0.16, c, c, c);
  } else if (kind === "nuclear") {
    for (const ox of [-0.35, 0.35]) {
      g.fillStyle = "#cfd3d6"; g.beginPath(); g.moveTo(ox * s - s * 0.32, s * 0.5); g.quadraticCurveTo(ox * s - s * 0.12, -s * 0.05, ox * s - s * 0.22, -s * 0.45); g.lineTo(ox * s + s * 0.22, -s * 0.45); g.quadraticCurveTo(ox * s + s * 0.12, -s * 0.05, ox * s + s * 0.32, s * 0.5); g.closePath(); g.fill();
      g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(ox * s, -s * 0.45, s * 0.22, s * 0.95);
      g.fillStyle = "rgba(255,255,255,.85)"; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(ox * s + (k - 1) * s * 0.1, -s * 0.6 - k * s * 0.15, s * 0.16, 0, 7); g.fill(); }
    }
  } else if (kind === "coal" || kind === "gas" || kind === "oil") {
    box(g, -s * 0.2, s * 0.5, s * 0.9, s * 0.35, "#a99d8e", "#8a7f71", "#766c60");
    g.fillStyle = "#8a4a3a"; g.fillRect(s * 0.25, -s * 0.6, s * 0.16, s * 1.1);
    g.fillStyle = kind === "coal" ? "rgba(70,65,60,.8)" : "rgba(240,240,240,.85)";
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(s * 0.33 + k * s * 0.15, -s * 0.75 - k * s * 0.15, s * 0.14, 0, 7); g.fill(); }
  } else if (kind === "hydro") {
    g.fillStyle = "#6fa7c4"; g.beginPath(); g.ellipse(0, -s * 0.35, s * 0.9, s * 0.3, 0, 0, 7); g.fill();
    g.fillStyle = "#c9c4b8"; g.beginPath(); g.moveTo(-s * 0.95, -s * 0.15); g.quadraticCurveTo(0, s * 0.15, s * 0.95, -s * 0.15); g.lineTo(s * 0.95, s * 0.1); g.quadraticCurveTo(0, s * 0.4, -s * 0.95, s * 0.1); g.closePath(); g.fill();
    g.strokeStyle = "#e8f4fa"; g.lineWidth = Math.max(0.8, s * 0.06); for (const x of [-0.3, 0, 0.3]) { g.beginPath(); g.moveTo(x * s, s * 0.25); g.lineTo(x * s, s * 0.6); g.stroke(); }
  } else if (kind === "wind") {
    for (const ox of [-0.4, 0.35]) {
      g.strokeStyle = "#f2f2f2"; g.lineWidth = Math.max(0.8, s * 0.06); g.beginPath(); g.moveTo(ox * s, s * 0.55); g.lineTo(ox * s, -s * 0.35); g.stroke();
      for (let k = 0; k < 3; k++) { const a = r() + (k * 2 * Math.PI) / 3; g.beginPath(); g.moveTo(ox * s, -s * 0.35); g.lineTo(ox * s + Math.cos(a) * s * 0.45, -s * 0.35 + Math.sin(a) * s * 0.45); g.stroke(); }
    }
  } else if (kind === "solar") {
    for (let k = 0; k < 3; k++) { g.fillStyle = "#2d4f7a"; g.beginPath(); const y = k * s * 0.3 - s * 0.3; g.moveTo(-s * 0.7, y); g.lineTo(s * 0.5, y - s * 0.1); g.lineTo(s * 0.7, y + s * 0.12); g.lineTo(-s * 0.5, y + s * 0.22); g.closePath(); g.fill(); g.strokeStyle = "rgba(200,230,255,.6)"; g.lineWidth = 0.6; g.stroke(); }
  } else if (kind === "wonder" || kind === "wonderNatural") {
    g.fillStyle = "rgba(40,30,10,.3)"; g.beginPath(); g.ellipse(s * 0.1, s * 0.6, s * 0.95, s * 0.25, 0, 0, 7); g.fill();
    if (kind === "wonder") {
      g.fillStyle = "#e9dcb8"; g.fillRect(-s * 0.8, s * 0.35, s * 1.6, s * 0.2);
      g.fillStyle = "#f4ead0"; for (let k = 0; k < 5; k++) g.fillRect(-s * 0.68 + k * s * 0.32, -s * 0.2, s * 0.14, s * 0.56);
      g.fillStyle = "#d8c99c"; g.fillRect(-s * 0.8, -s * 0.32, s * 1.6, s * 0.14);
      g.fillStyle = "#c9a45c"; g.beginPath(); g.moveTo(-s * 0.85, -s * 0.32); g.lineTo(0, -s * 0.75); g.lineTo(s * 0.85, -s * 0.32); g.closePath(); g.fill();
    } else {
      g.fillStyle = "#8a8273"; g.beginPath(); g.moveTo(-s * 0.8, s * 0.5); g.lineTo(-s * 0.1, -s * 0.7); g.lineTo(s * 0.6, s * 0.5); g.closePath(); g.fill();
      g.fillStyle = "#f6f7f8"; g.beginPath(); g.moveTo(-s * 0.35, -s * 0.28); g.lineTo(-s * 0.1, -s * 0.7); g.lineTo(s * 0.15, -s * 0.28); g.closePath(); g.fill();
      tree(g, s * 0.55, s * 0.55, s * 0.55, rng(3), true);
    }
    g.strokeStyle = "#d9b56a"; g.lineWidth = Math.max(1, s * 0.07); g.beginPath(); g.ellipse(s * 0.05, s * 0.05, s * 1.1, s * 0.95, 0, 0, 7); g.stroke();
  } else if (kind === "barn") {
    barn(g, 0, s * 0.3, s * 0.75);
  }
}

// ---------- 对外接口:取缓存的图块画布 ----------
// type: 地形种类 / "city0..4" / "suburb" / 设施种类;u: 屏幕上的六边形外接圆半径(像素)
export function sprite(type, variant, u) {
  const b = u < 12 ? Math.max(4, Math.round(u)) : u < 40 ? Math.round(u / 2) * 2 : Math.round(u / 6) * 6;
  const key = `${type}|${variant}|${b}`;
  let c = cache.get(key);
  if (c) return c;
  const pad = 1.2;
  const W = SQ3 * b * pad, H = 2 * b * pad;
  const isFacility = ["airport", "port", "nuclear", "coal", "gas", "oil", "hydro", "wind", "solar", "wonder", "wonderNatural", "barn"].includes(type);
  c = canvas(W, H);
  const g = c.getContext("2d");
  g.translate(W / 2, H / 2);
  const r = rng(variant * 7919 + type.length * 104729 + 1);
  if (isFacility) drawFacility(g, type, b, r);
  else {
    g.save(); hexClip(g, b * 1.02); g.clip();
    if (type.startsWith("city")) drawCity(g, b, r, +type.slice(4));
    else if (type === "suburb") drawSuburb(g, b, r);
    else if (type.endsWith("+hills")) { drawTerrain(g, type.replace("+hills", ""), b, r); drawHills(g, b, r); }
    else drawTerrain(g, type, b, r);
    g.restore();
  }
  c.u = b; c.pad = pad;
  if (cache.size > 900) cache.clear();
  cache.set(key, c);
  return c;
}
