// 地图绘制:插画地形(sprites.js)、城市楼群、公路铁路、电厂矿山农业资源、奇观、国界(沿格边的双色线)、
// 国名、城市旗标(标签 + 人口 + 名字 + 产出行)。坐标:网格 km,原点左上,y 向下;屏幕 = (g - cam) * s + 视口中心。
import { sprite, cityTier } from "./sprites.js";

const SQ3 = Math.sqrt(3);
// 尖顶六边形:角 k 在 30° + 60°k;邻居方向 n(E,NE,NW,W,SW,SE)对应的边端点角序号
export const EDGE = [[5, 0], [4, 5], [3, 4], [2, 3], [1, 2], [0, 1]];

export function hexGeometry(G) {
  const { r, cols, rows } = G.grid;
  const w = SQ3 * r, h = 1.5 * r;
  const center = (i) => { const col = i % cols, row = (i / cols) | 0; return [w * (col + 0.5 * (row & 1)) + w / 2, h * row + r]; };
  const corners = Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const idx = (c, rr) => (c < 0 || rr < 0 || c >= cols || rr >= rows ? -1 : rr * cols + c);
  const nb = new Int32Array(cols * rows * 6);
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols, row = (i / cols) | 0, odd = row & 1;
    const d = odd ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
    for (let n = 0; n < 6; n++) nb[i * 6 + n] = idx(col + d[n][0], row + d[n][1]);
  }
  function locate(x, y) {
    const px = x - w / 2, py = y - r;
    const q = ((SQ3 / 3) * px - py / 3) / r, rr = ((2 / 3) * py) / r;
    let cx = q, cz = rr, cy = -cx - cz;
    let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
    const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return idx(rx + (rz - (rz & 1)) / 2, rz);
  }
  return { r, w, h, cols, rows, center, corners, nb, locate, width: w * (cols + 0.5), height: h * rows + r / 2 };
}

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, k) => v + (B[k] - v) * t)); };

export const DISTRICT_TAG = { gov: "首都", campus: "学院城", commercial: "金融城", industrial: "工业城", theater: "文艺城", entertainment: "旅游城", harbor: "港口城", farm: "农业城" };
const TAG_ORDER = ["gov", "campus", "commercial", "industrial", "theater", "entertainment", "harbor", "farm"];
export const cityTag = (c) => TAG_ORDER.find((k) => c.districts.some((d) => d.key === k)) || null;
export const RES_ICON = { wheat: "🌾", maize: "🌽", barley: "🍺", grapes: "🍇", olives: "🫒", potato: "🥔", sugarbeet: "🍬", rapeseed: "🌼", timber: "🪵",
  coal: "🪨", iron: "⛓️", copper: "🟠", gold: "🥇", silver: "🥈", salt: "🧂", potash: "🧪", uranium: "☢️", zinc: "🔩", bauxite: "🟤", stone: "🗿", oil: "🛢️" };
export const RES_NAME = { wheat: "小麦", maize: "玉米", barley: "大麦", grapes: "葡萄", olives: "橄榄", potato: "土豆", sugarbeet: "甜菜", rapeseed: "油菜", timber: "木材",
  coal: "煤", iron: "铁矿", copper: "铜矿", gold: "金矿", silver: "银矿", salt: "盐", potash: "钾盐", uranium: "铀矿", zinc: "铅锌矿", bauxite: "铝土矿", stone: "石材", oil: "油田" };
export const POWER_NAME = { nuclear: "核电站", coal: "煤电厂", gas: "燃气电厂", oil: "燃油电厂", hydro: "水电站", wind: "风电", solar: "光伏" };
const SERIF = '"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif';
const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

export function createRenderer(canvas, W, H) {
  const ctx = canvas.getContext("2d");
  const { world, cities, places, features, regions } = W;
  const C = world.cells;
  const N = H.cols * H.rows;
  const countryColor = world.countries.map((c) => c.color);
  let hits = [];

  // ---------- 预计算:离岸距离、海色、山体阴影、每格图块种类 ----------
  const land = (i) => i >= 0 && C.water[i] === 0;
  const dist = new Int16Array(N).fill(99), q = [];
  for (let i = 0; i < N; i++) if (land(i)) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) for (let n = 0; n < 6; n++) { const j = H.nb[q[h] * 6 + n]; if (j >= 0 && dist[j] > dist[q[h]] + 1) { dist[j] = dist[q[h]] + 1; q.push(j); } }
  const OCEAN = ["#5aa2c4", "#4791b8", "#3a7fa8", "#2f6d96", "#275d84", "#214f74", "#1c4466", "#183b5b"];
  const LAKE = "#5aa6cf";
  const elevAt = (i) => (i < 0 || C.water[i] !== 0 || C.elev[i] === -9999 ? 0 : C.elev[i]);
  const hash = (i, s = 1) => { let h = Math.imul(i ^ Math.imul(s, 0x9e3779b9), 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const shade = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!land(i)) { shade[i] = 1; continue; }
    const nb = (n) => H.nb[i * 6 + n];
    const dzdx = (elevAt(nb(0)) - elevAt(nb(3))) / (2 * H.w);
    const dzdy = (elevAt(nb(4)) + elevAt(nb(5)) - elevAt(nb(1)) - elevAt(nb(2))) / (4 * H.h);
    shade[i] = Math.max(0.7, Math.min(1.25, 1 - (0.008 * (dzdx + dzdy)) / Math.SQRT2));
  }
  const cityByCell = new Map(cities.map((c) => [c.cell, c]));
  const suburb = new Uint8Array(N);
  for (const c of cities) if (c.cell >= 0 && cityTier(c.pop) >= 3) for (let n = 0; n < 6; n++) { const j = H.nb[c.cell * 6 + n]; if (land(j) && !cityByCell.has(j)) suburb[j] = 1; }
  const T = world.tables.terrain.map((t) => t.key);
  const kind = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    if (!land(i)) continue;
    const c = cityByCell.get(i);
    if (c) { kind[i] = "city" + cityTier(c.pop); continue; }
    if (suburb[i]) { kind[i] = "suburb"; continue; }
    if (C.relief[i] === 2) { kind[i] = "mountain"; continue; }
    const [, gy] = H.center(i);
    if (C.feature[i] === 1) { kind[i] = T[C.terrain[i]] === "tundra" || elevAt(i) > 800 || gy < H.height * 0.4 ? "conifer" : "forest"; continue; }
    if (C.feature[i] === 2) { kind[i] = "marsh"; continue; }
    const t = T[C.terrain[i]];
    const base = t === "plains" ? "fields" : t === "grassland" ? "pasture" : t;
    kind[i] = C.relief[i] === 1 && base !== "snow" ? base + "+hills" : base;
  }
  const waterColor = (i) => (C.water[i] === 3 ? LAKE : OCEAN[Math.min(OCEAN.length - 1, dist[i])]);
  const barns = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (kind[i] && /^(fields|pasture)/.test(kind[i]) && !C.fog[i] && hash(i, 5) < 0.1) barns[i] = 1;

  // 把一格画到某个 2D 上下文:图块 + 阴影 + 迷雾
  function paintCell(g, i, x, y, u, lensCol) {
    if (!land(i)) { g.fillStyle = waterColor(i); hexFill(g, x, y, u * 1.02); return; }
    const sp = sprite(kind[i], (hash(i) * 4) | 0, u);
    const k = u / sp.u, w = sp.width * k, h = sp.height * k;
    g.drawImage(sp, x - w / 2, y - h / 2, w, h);
    const sh = shade[i];
    if (sh < 0.99) { g.fillStyle = `rgba(20,15,5,${((1 - sh) * 1.3).toFixed(3)})`; hexFill(g, x, y, u * 1.02); }
    else if (sh > 1.01) { g.fillStyle = `rgba(255,250,225,${((sh - 1) * 0.9).toFixed(3)})`; hexFill(g, x, y, u * 1.02); }
    if (lensCol) { g.fillStyle = lensCol; g.globalAlpha = 0.82; hexFill(g, x, y, u * 1.02); g.globalAlpha = 1; }
    if (C.fog[i]) { g.fillStyle = "rgba(28,32,38,.72)"; hexFill(g, x, y, u * 1.02); }
  }
  function hexFill(g, x, y, u) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; const px = x + Math.cos(a) * u, py = y + Math.sin(a) * u; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); }

  // ---------- 缩小视图:整图预渲染一次(每 km 0.6 像素),之后贴图 ----------
  const PRE = 0.6;
  const preCache = new Map();
  function prerender(lensColors, key) {
    if (preCache.has(key)) return preCache.get(key);
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(H.width * PRE); cv.height = Math.ceil(H.height * PRE);
    const g = cv.getContext("2d");
    g.fillStyle = OCEAN[OCEAN.length - 1]; g.fillRect(0, 0, cv.width, cv.height);
    const u = H.r * PRE;
    for (let i = 0; i < N; i++) { const [gx, gy] = H.center(i); paintCell(g, i, gx * PRE, gy * PRE, u, lensColors && land(i) && !C.fog[i] ? lensColors[i] || "#5c6168" : null); }
    if (preCache.size > 3) preCache.delete(preCache.keys().next().value);
    preCache.set(key, cv);
    return cv;
  }

  // 国名位置:每国最大连通块的格心平均
  const labelPos = world.countries.map((c, ci) => {
    if (!c.nuts) return null;
    const seen = new Uint8Array(N); let best = [];
    for (let i = 0; i < N; i++) {
      if (seen[i] || !land(i) || C.country[i] !== ci || C.fog[i]) continue;
      const comp = [i]; seen[i] = 1;
      for (let h = 0; h < comp.length; h++) for (let n = 0; n < 6; n++) { const j = H.nb[comp[h] * 6 + n]; if (j >= 0 && !seen[j] && land(j) && C.country[j] === ci) { seen[j] = 1; comp.push(j); } }
      if (comp.length > best.length) best = comp;
    }
    if (best.length < 3) return null;
    const pts = best.map((i) => H.center(i));
    return { name: c.name, n: best.length, x: pts.reduce((s, p) => s + p[0], 0) / pts.length, y: pts.reduce((s, p) => s + p[1], 0) / pts.length };
  }).filter(Boolean);
  // 线要素包围盒(视口裁剪用)
  const bboxed = (arr) => arr.map((l) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of l.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { ...l, bb: [x0, y0, x1, y1] }; });
  const rivers = bboxed(world.rivers), roads = bboxed(features.roads), rails = bboxed(features.rails);

  function draw(view, opts) {
    const { cx, cy, s } = view;
    const dpr = window.devicePixelRatio || 1;
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) { canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = OCEAN[OCEAN.length - 1]; ctx.fillRect(0, 0, vw, vh);
    const X = (gx) => (gx - cx) * s + vw / 2, Y = (gy) => (gy - cy) * s + vh / 2;
    const rpx = H.r * s;
    const gx0 = cx - vw / 2 / s - H.w, gx1 = cx + vw / 2 / s + H.w, gy0 = cy - vh / 2 / s - H.r * 2, gy1 = cy + vh / 2 / s + H.r * 2;
    const r0 = Math.max(0, Math.floor(gy0 / H.h)), r1 = Math.min(H.rows - 1, Math.ceil(gy1 / H.h));
    const c0 = Math.max(0, Math.floor(gx0 / H.w)), c1 = Math.min(H.cols - 1, Math.ceil(gx1 / H.w));
    const visible = [];
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) visible.push(row * H.cols + col);
    const onScreen = (bb) => bb[2] >= gx0 && bb[0] <= gx1 && bb[3] >= gy0 && bb[1] <= gy1;
    const K = H.corners.map(([x, y]) => [x * s, y * s]);
    const lens = opts.lensColors;

    // 1) 地面
    if (s * dpr <= PRE * 1.3) {
      const img = prerender(lens, lens ? "lens:" + opts.lensKey : "terrain");
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, X(0), Y(0), (img.width / PRE) * s, (img.height / PRE) * s);
    } else {
      for (const i of visible) { const [gx, gy] = H.center(i); paintCell(ctx, i, X(gx), Y(gy), rpx, lens && land(i) && !C.fog[i] ? lens[i] || "#5c6168" : null); }
      if (rpx >= 10) { // 极淡的格线
        const p = new Path2D();
        for (const i of visible) if (land(i)) { const [gx, gy] = H.center(i); const x = X(gx), y = Y(gy); p.moveTo(x + K[0][0], y + K[0][1]); for (let k = 1; k < 6; k++) p.lineTo(x + K[k][0], y + K[k][1]); p.closePath(); }
        ctx.strokeStyle = "rgba(40,30,10,.10)"; ctx.lineWidth = 1; ctx.stroke(p);
      }
      if (!lens && rpx >= 14) for (const i of visible) if (barns[i]) { const [gx, gy] = H.center(i); const sp = sprite("barn", 0, rpx); const k = rpx / sp.u; ctx.drawImage(sp, X(gx) - rpx * 0.35 - (sp.width * k) / 2, Y(gy) + rpx * 0.1 - (sp.height * k) / 2, sp.width * k, sp.height * k); }
    }
    const line = (l) => { ctx.beginPath(); l.pts.forEach(([gx, gy], k) => (k ? ctx.lineTo(X(gx), Y(gy)) : ctx.moveTo(X(gx), Y(gy)))); };
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // 2) 河流
    if (opts.rivers && !lens) for (const rv of rivers) {
      if (!onScreen(rv.bb) || (rpx < 5 && rv.rank > 5)) continue;
      const w = Math.max(0.8, Math.min(5, (9 - rv.rank) * 0.05 * rpx));
      line(rv); ctx.strokeStyle = "rgba(30,70,110,.35)"; ctx.lineWidth = w + 1.5; ctx.stroke(); ctx.strokeStyle = "#4f9fd0"; ctx.lineWidth = w; ctx.stroke();
    }
    // 3) 公路与铁路
    if (opts.transport && !lens && rpx >= 4) {
      for (const r of roads) {
        if (!onScreen(r.bb) || (r.t === 2 && rpx < 12)) continue;
        const w = (r.t === 1 ? 0.085 : 0.055) * rpx;
        line(r); ctx.strokeStyle = "rgba(90,70,40,.55)"; ctx.lineWidth = w + 1.6; ctx.stroke(); ctx.strokeStyle = r.t === 1 ? "#efe0b5" : "#e4d6b0"; ctx.lineWidth = w; ctx.stroke();
      }
      for (const r of rails) {
        if (!onScreen(r.bb) || (r.t === 2 && rpx < 14)) continue;
        const w = Math.max(0.9, 0.028 * rpx);
        line(r); ctx.strokeStyle = "rgba(70,60,50,.8)"; ctx.lineWidth = w; ctx.stroke();
        if (rpx >= 14) { ctx.setLineDash([1, Math.max(3, rpx * 0.14)]); ctx.lineWidth = w * 3; ctx.strokeStyle = "rgba(70,60,50,.55)"; ctx.stroke(); ctx.setLineDash([]); }
      }
    }
    // 4) 内部边界与国界(文明式:每国沿自己领土的格边内缩画一条国色线,两国相邻处为两条并行色线)
    const edgePath = (pred, inset = 1) => {
      const p = new Path2D();
      for (const i of visible) {
        if (!land(i)) continue;
        const [gx, gy] = H.center(i); const x = X(gx), y = Y(gy);
        for (let n = 0; n < 6; n++) { const j = H.nb[i * 6 + n]; if (!pred(i, j)) continue; const [a, b] = EDGE[n]; p.moveTo(x + K[a][0] * inset, y + K[a][1] * inset); p.lineTo(x + K[b][0] * inset, y + K[b][1] * inset); }
      }
      return p;
    };
    if (rpx >= 5) {
      const A = C[opts.lensLevel === "r3" && rpx >= 9 ? "r3" : "r2"];
      ctx.strokeStyle = lens ? "rgba(0,0,0,.35)" : "rgba(255,250,235,.35)"; ctx.lineWidth = 1; ctx.setLineDash(lens ? [] : [3, 3]);
      ctx.stroke(edgePath((i, j) => j > i && land(j) && A[i] !== A[j] && C.country[i] === C.country[j] && !C.fog[i]));
      ctx.setLineDash([]);
    }
    const byCountry = new Map();
    for (const i of visible) {
      const ci = C.country[i];
      if (!land(i) || ci < 0 || C.fog[i]) continue;
      const [gx, gy] = H.center(i); const x = X(gx), y = Y(gy);
      for (let n = 0; n < 6; n++) {
        const j = H.nb[i * 6 + n]; const cj = land(j) ? C.country[j] : -1;
        if (cj === ci) continue;
        let p = byCountry.get(ci); if (!p) { p = { line: new Path2D(), outer: new Path2D() }; byCountry.set(ci, p); }
        const [a, b] = EDGE[n];
        p.line.moveTo(x + K[a][0] * 0.86, y + K[a][1] * 0.86); p.line.lineTo(x + K[b][0] * 0.86, y + K[b][1] * 0.86);
        p.outer.moveTo(x + K[a][0], y + K[a][1]); p.outer.lineTo(x + K[b][0], y + K[b][1]);
      }
    }
    for (const [ci, p] of byCountry) {
      ctx.strokeStyle = "rgba(10,10,10,.5)"; ctx.lineWidth = Math.max(1.2, rpx * 0.12); ctx.stroke(p.outer);
      ctx.strokeStyle = countryColor[ci]; ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(1.6, rpx * 0.17); ctx.stroke(p.line); ctx.globalAlpha = 1;
    }
    if (opts.selRegion) {
      const { level, index } = opts.selRegion; const A = C[level];
      ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = Math.max(2, rpx * 0.18);
      ctx.stroke(edgePath((i, j) => A[i] === index && (j < 0 || A[j] !== index || !land(j))));
    }

    // 5) 物件:奇观 > 电厂 > 机场/港口 > 矿产 > 农业资源;同格一件,互相避让
    hits = [];
    const dots = [];
    const free = (x, y, r) => !dots.some(([a, b, rr]) => Math.hypot(a - x, b - y) < r + rr);
    const put = (type, gx, gy, sz, info, offset = [0.38, 0.3]) => {
      const [hx, hy] = H.center(H.locate(gx, gy));
      const x = X(hx) + rpx * offset[0], y = Y(hy) + rpx * offset[1];
      if (x < -40 || y < -40 || x > vw + 40 || y > vh + 40 || !free(x, y, sz * 0.5)) return;
      const sp = sprite(type, 0, sz); const k = sz / sp.u;
      ctx.drawImage(sp, x - (sp.width * k) / 2, y - (sp.height * k) / 2, sp.width * k, sp.height * k);
      dots.push([x, y, sz * 0.5]); hits.push({ x, y, r: sz * 0.6, info });
    };
    const medal = (emoji, gx, gy, info) => {
      const [hx, hy] = H.center(H.locate(gx, gy));
      const x = X(hx) - rpx * 0.32, y = Y(hy) + rpx * 0.36, r = Math.min(16, Math.max(8, rpx * 0.24));
      if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20 || !free(x, y, r)) return;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, "#fff7df"); g.addColorStop(1, "#c9a45c");
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(x + 1, y + 1.5, r, 0, 7); ctx.fill();
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = "#6b5326"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.font = `${r * 1.15}px ${EMOJI}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; ctx.fillText(emoji, x, y + 1);
      dots.push([x, y, r]); hits.push({ x, y, r, info });
    };
    if (!lens || rpx >= 10) {
      const wz = (w) => (w.tier === 1 && rpx >= 5) || (w.tier === 2 && rpx >= 10) || rpx >= 18;
      if (opts.wonders) for (const w of places.wonders) if (wz(w)) put(w.natural ? "wonderNatural" : "wonder", w.x, w.y, Math.min(34, Math.max(12, rpx * (w.tier === 1 ? 0.85 : 0.7))), { t: "wonder", d: w }, [0.35, -0.05]);
      if (opts.resources) {
        const pmin = rpx >= 16 ? 0 : rpx >= 10 ? 600 : rpx >= 6 ? 1500 : Infinity;
        for (const p of features.power) if (p.mw >= pmin) put(p.kind, p.x, p.y, Math.min(30, Math.max(11, rpx * 0.7)), { t: "power", d: p });
        if (rpx >= 9) for (const a of features.airports) if (a.rank <= (rpx >= 14 ? 9 : 5)) put("airport", a.x, a.y, Math.min(30, Math.max(11, rpx * 0.7)), { t: "airport", d: a }, [-0.3, -0.25]);
        if (rpx >= 13) for (const p of features.ports) put("port", p.x, p.y, Math.min(28, rpx * 0.6), { t: "port", d: p }, [-0.35, 0.3]);
        if (rpx >= 11) for (const m of features.mines) medal(RES_ICON[m.kind] || "⛏️", m.x, m.y, { t: "mine", d: m });
        if (rpx >= 11) for (const a of features.agri) medal(RES_ICON[a.kind], a.x, a.y, { t: "agri", d: a });
      }
    }

    // 6) 国名
    const labelAlpha = Math.max(0, Math.min(1, (13 - rpx) / 6));
    if (labelAlpha > 0.02) {
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      for (const L of labelPos) {
        const fs = Math.max(11, Math.min(40, Math.sqrt(L.n) * H.w * s * 0.2));
        const x = X(L.x), y = Y(L.y);
        if (x < -200 || y < -60 || x > vw + 200 || y > vh + 60) continue;
        ctx.font = `700 ${fs}px ${SERIF}`;
        const chars = [...L.name], gap = fs * 0.45, widths = chars.map((ch) => ctx.measureText(ch).width);
        let x0 = x - (widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1)) / 2;
        chars.forEach((ch, k) => {
          const xc = x0 + widths[k] / 2;
          ctx.strokeStyle = `rgba(40,30,12,${0.5 * labelAlpha})`; ctx.lineWidth = Math.max(2, fs * 0.13); ctx.strokeText(ch, xc, y);
          ctx.fillStyle = `rgba(252,244,222,${0.78 * labelAlpha})`; ctx.fillText(ch, xc, y);
          x0 += widths[k] + gap;
        });
      }
      ctx.restore();
    }
    // 7) 四周压暗
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(5,10,20,.4)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);

    // 8) 城市旗标:上方标签带(学院城/工业城…)+ 人口牌 + 名字 + 特色图标;放大后第二行显示五项产出
    const minPop = rpx >= 20 ? 0 : rpx >= 13 ? 180000 : rpx >= 8 ? 350000 : rpx >= 5 ? 800000 : 1500000;
    const taken = [];
    const showYields = rpx >= 11;
    const fmtK = (v, gold) => (v == null ? "—" : gold ? (v >= 1e5 ? (v / 1e4).toFixed(1) + "万亿" : Math.round(v / 100) + "亿") : v >= 10 ? (v / 10).toFixed(v >= 100 ? 0 : 1) + "万" : Math.round(v * 1000) + "");
    for (const c of cities) {
      if (!(c.capital || c.pop >= minPop)) continue;
      const tier = cityTier(c.pop);
      const fsz = [12, 12, 13, 14, 15][tier] + (rpx >= 14 ? 1 : 0);
      const x = X(c.x), y0 = Y(c.y) - Math.max(12, rpx * 1.0) - (showYields ? fsz * 0.7 : 0);
      if (x < -160 || y0 < -50 || x > vw + 160 || y0 > vh + 50) continue;
      const tag = rpx >= 8 ? cityTag(c) : null;
      const popTxt = Math.round(c.pop / 1e4) + "万";
      ctx.font = `700 ${fsz}px ${SERIF}`; const tw = ctx.measureText(c.name).width;
      ctx.font = `700 ${fsz - 1}px ${SERIF}`; const pw = ctx.measureText(popTxt).width + 14;
      const iw = fsz + 8;
      const r = regions.r3[c.r3];
      const yl = showYields && r ? [["🌾", fmtK(r.yields.food)], ["⚙️", fmtK(r.yields.production)], ["💰", fmtK(r.yields.gold, true)], ["🔬", fmtK(r.yields.science)], ["🎭", fmtK(r.yields.culture)]] : null;
      let yw = 0;
      if (yl) { ctx.font = `600 ${fsz - 3}px ${SERIF}`; yw = yl.reduce((s2, [, v]) => s2 + ctx.measureText(v).width + fsz + 6, 8); }
      const bw = Math.max(tw + pw + iw + 22, yw), bh = fsz + 11;
      const left = x - bw / 2, top = y0 - bh / 2;
      const full = [left, top - (tag ? fsz * 0.75 : 0), bw, bh + (tag ? fsz * 0.75 : 0) + (yl ? fsz + 6 : 0)];
      if (taken.some((t) => full[0] < t[0] + t[2] + 3 && full[0] + full[2] + 3 > t[0] && full[1] < t[1] + t[3] + 2 && full[1] + full[3] + 2 > t[1])) continue;
      taken.push(full);
      const ci = world.countries.findIndex((k) => k.code === c.cntr);
      const col = ci >= 0 ? countryColor[ci] : "#888";
      const sel = opts.selCity === c.id;
      // 标签带
      if (tag) {
        ctx.font = `700 ${Math.max(9, fsz - 4)}px ${SERIF}`;
        const label = DISTRICT_TAG[tag], lw = ctx.measureText(label).width + 16, lh = fsz * 0.85;
        ctx.fillStyle = tag === "gov" ? "#8a2f2f" : "#2d4d86"; roundRect(ctx, x - lw / 2, top - lh + 3, lw, lh, 3); ctx.fill();
        ctx.strokeStyle = "rgba(230,200,130,.8)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#f6e7bf"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, x, top - lh / 2 + 3);
      }
      // 主条
      const gr = ctx.createLinearGradient(0, top, 0, top + bh);
      gr.addColorStop(0, "#2b3446"); gr.addColorStop(1, "#121722");
      ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillStyle = gr; roundRect(ctx, left, top, bw, bh, 5); ctx.fill(); ctx.shadowColor = "transparent";
      ctx.strokeStyle = sel ? "#ffd76a" : "#b8934e"; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
      const pg = ctx.createLinearGradient(0, top, 0, top + bh);
      pg.addColorStop(0, mix(col, "#ffffff", 0.25)); pg.addColorStop(1, mix(col, "#000000", 0.2));
      ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(left + 3, top + 3); ctx.lineTo(left + pw, top + 3); ctx.lineTo(left + pw + 6, top + bh / 2); ctx.lineTo(left + pw, top + bh - 3); ctx.lineTo(left + 3, top + bh - 3); ctx.closePath(); ctx.fill();
      ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = `700 ${fsz - 1}px ${SERIF}`; ctx.fillText(popTxt, left + 3 + (pw - 3) / 2, top + bh / 2 + 0.5);
      ctx.fillStyle = "#f5e7c4"; ctx.font = `700 ${fsz}px ${SERIF}`; ctx.fillText((c.capital ? "★ " : "") + c.name, left + pw + 6 + (bw - pw - 6 - iw) / 2, top + bh / 2 + 0.5);
      // 右侧特色圆章
      const icx = left + bw - iw / 2 - 2, icy = top + bh / 2, ir = (bh - 6) / 2;
      ctx.fillStyle = "#e9dcb8"; ctx.beginPath(); ctx.arc(icx, icy, ir, 0, 7); ctx.fill(); ctx.strokeStyle = "#8a6a2e"; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = `${ir * 1.3}px ${EMOJI}`; ctx.fillStyle = "#000";
      ctx.fillText(tag ? { gov: "🏛️", campus: "🎓", commercial: "🏦", industrial: "🏭", theater: "🎭", entertainment: "🎡", harbor: "⚓", farm: "🌾" }[tag] : "🏘️", icx, icy + 1);
      // 产出行
      if (yl) {
        const ty = top + bh + 1, th = fsz + 4;
        ctx.fillStyle = "rgba(14,18,26,.9)"; roundRect(ctx, left + 4, ty, bw - 8, th, 4); ctx.fill();
        let px = x - yw / 2 + 4;
        for (const [ic, v] of yl) {
          ctx.font = `${fsz - 3}px ${EMOJI}`; ctx.textAlign = "left"; ctx.fillText(ic, px, ty + th / 2 + 1); px += fsz - 1;
          ctx.font = `600 ${fsz - 3}px ${SERIF}`; ctx.fillStyle = "#e9dfc6"; ctx.fillText(v, px, ty + th / 2 + 0.5); px += ctx.measureText(v).width + 7; ctx.fillStyle = "#000";
        }
      }
      hits.push({ rect: full, info: { t: "city", d: c } });
    }
  }
  return { draw, hits: () => hits };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
