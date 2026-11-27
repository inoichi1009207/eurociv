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
  const cityByCell = new Map(); // 同一格有多座城市时取人口最大的(巴黎格里还有布洛涅等)
  for (const c of cities) if (!cityByCell.has(c.cell) || cityByCell.get(c.cell).pop < c.pop) cityByCell.set(c.cell, c);
  const suburb = new Uint8Array(N);
  for (const c of cities) if (c.cell >= 0 && cityTier(c.pop) >= 3) for (let n = 0; n < 6; n++) { const j = H.nb[c.cell * 6 + n]; if (land(j) && !cityByCell.has(j)) suburb[j] = 1; }
  const T = world.tables.terrain.map((t) => t.key);
  const kind = new Array(N).fill(null), over = new Array(N).fill(null); // 底层地形 / 叠加物(城市楼群、郊区)
  for (let i = 0; i < N; i++) {
    if (!land(i)) continue;
    const c = cityByCell.get(i);
    if (c) over[i] = "city" + cityTier(c.pop); else if (suburb[i]) over[i] = "suburb";
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
    const v = (hash(i) * 4) | 0;
    const draw1 = (t) => { const sp = sprite(t, v, u); const k = u / sp.u, w = sp.width * k, h = sp.height * k; g.drawImage(sp, x - w / 2, y - h / 2, w, h); };
    draw1(kind[i]);
    const sh = shade[i];
    if (sh < 0.99) { g.fillStyle = `rgba(20,15,5,${((1 - sh) * 1.3).toFixed(3)})`; hexFill(g, x, y, u * 1.02); }
    else if (sh > 1.01) { g.fillStyle = `rgba(255,250,225,${((sh - 1) * 0.9).toFixed(3)})`; hexFill(g, x, y, u * 1.02); }
    if (lensCol) { g.fillStyle = lensCol; g.globalAlpha = 0.82; hexFill(g, x, y, u * 1.02); g.globalAlpha = 1; }
    if (over[i]) draw1(over[i]); // 楼群、郊区直接叠在原地形上(不加光晕、不压暗)
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
    // 3b) 楼群压在交通线与河流之上:路一直通到城里,只是被楼挡住
    if (rpx >= 4) for (const c of cityByCell.values()) {
      if (c.cell < 0) continue;
      const [gx, gy] = H.center(c.cell); const x = X(gx), y = Y(gy);
      if (x < -rpx * 2 || y < -rpx * 2 || x > vw + rpx * 2 || y > vh + rpx * 2) continue;
      // 只重画楼群(透明底的叠加物),底下的地形与公路铁路保留:路通进城里,被楼挡住
      const sp = sprite(over[c.cell], (hash(c.cell) * 4) | 0, rpx), k = rpx / sp.u;
      ctx.drawImage(sp, x - (sp.width * k) / 2, y - (sp.height * k) / 2, sp.width * k, sp.height * k);
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

    // 5) 物件:先把每座可见城市的楼群登记成「占位框」,物件与旗标都不许压上去
    hits = [];
    const TOP = [0.6, 0.72, 0.95, 1.2, 1.55]; // 楼群顶部离格心的高度(×格半径),与 sprites.js 的楼高一致
    const clusters = [];
    if (rpx >= 4) for (const c of cityByCell.values()) {
      if (c.cell < 0) continue;
      const [gx, gy] = H.center(c.cell); const x = X(gx), y = Y(gy);
      if (x < -rpx * 3 || y < -rpx * 3 || x > vw + rpx * 3 || y > vh + rpx * 3) continue;
      const t = cityTier(c.pop);
      clusters.push({ id: c.id, pop: c.pop, tier: t, x, y, rect: [x - rpx * 0.82, y - rpx * TOP[t], rpx * 1.64, rpx * (TOP[t] + 0.62)] });
    }
    const hit = (a, b, pad = 2) => a[0] < b[0] + b[2] + pad && a[0] + a[2] + pad > b[0] && a[1] < b[1] + b[3] + pad && a[1] + a[3] + pad > b[1];
    const dots = [];
    const free = (x, y, r) => !dots.some(([a, b, rr]) => Math.hypot(a - x, b - y) < r + rr) && !clusters.some((c) => hit([x - r, y - r, r * 2, r * 2], c.rect, -2));
    const plates = []; // 奇观名牌
    const put = (type, gx, gy, sz, info, offset = [0.38, 0.3]) => {
      const cl = H.locate(gx, gy);
      if (cityByCell.has(cl)) { // 城市格:机场/港口/奇观挪到格子角上,其余设施不画
        if (type === "airport") offset = [0.7, 0.62]; else if (type === "port") offset = [-0.72, 0.1]; else if (type.startsWith("wonder")) offset = [-0.66, 0.66]; else return false;
      }
      const [hx, hy] = H.center(cl);
      const x = X(hx) + rpx * offset[0], y = Y(hy) + rpx * offset[1];
      if (x < -40 || y < -40 || x > vw + 40 || y > vh + 40) return false;
      if (!dots.every(([a, b, rr]) => Math.hypot(a - x, b - y) >= sz * 0.45 + rr)) return false;
      if (!cityByCell.has(cl) && clusters.some((c) => hit([x - sz * 0.4, y - sz * 0.4, sz * 0.8, sz * 0.8], c.rect, -2))) return false;
      const sp = sprite(type, 0, sz); const k = sz / sp.u;
      ctx.drawImage(sp, x - (sp.width * k) / 2, y - (sp.height * k) / 2, sp.width * k, sp.height * k);
      dots.push([x, y, sz * 0.45]); hits.push({ x, y, r: sz * 0.6, info });
      return [x, y];
    };
    const medal = (emoji, gx, gy, info) => {
      const [hx, hy] = H.center(H.locate(gx, gy));
      const r = Math.min(14, Math.max(8, rpx * 0.2)), x = X(hx) - rpx * 0.34, y = Y(hy) + rpx * 0.4;
      if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20 || !free(x, y, r * 1.6)) return;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, "#fff7df"); g.addColorStop(1, "#c9a45c");
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(x + 1, y + 1.5, r, 0, 7); ctx.fill();
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = "#6b5326"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.font = `${r * 1.15}px ${EMOJI}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; ctx.fillText(emoji, x, y + 1);
      dots.push([x, y, r * 1.6]); hits.push({ x, y, r, info });
    };
    if (!lens || rpx >= 10) {
      // 奇观:大奇观远看就有,放大后配名牌;二三档要更近才出现
      const wz = (w) => (w.tier === 1 && rpx >= 5) || (w.tier === 2 && rpx >= 14) || rpx >= 24;
      if (opts.wonders) for (const w of places.wonders) {
        if (!wz(w)) continue;
        const p = put(w.natural ? "wonderNatural" : "wonder", w.x, w.y, Math.min(40, Math.max(13, rpx * (w.tier === 1 ? 0.95 : 0.75))), { t: "wonder", d: w }, [0.36, -0.05]);
        if (p && ((w.tier === 1 && rpx >= 14) || rpx >= 40)) plates.push({ x: p[0], y: p[1] + Math.min(40, Math.max(13, rpx * 0.95)) * 0.62, name: w.name, w });
      }
      if (opts.resources) {
        const pmin = (kind) => (kind === "wind" || kind === "solar" ? (rpx >= 28 ? 0 : rpx >= 16 ? 300 : Infinity) : rpx >= 22 ? 0 : rpx >= 14 ? 400 : rpx >= 9 ? 1000 : rpx >= 6 ? 2000 : Infinity);
        for (const p of features.power) if (p.mw >= pmin(p.kind)) put(p.kind, p.x, p.y, Math.min(32, Math.max(12, rpx * 0.7)), { t: "power", d: p });
        if (rpx >= 7) for (const a of features.airports) if (a.rank <= (rpx >= 12 ? 9 : 5)) put("airport", a.x, a.y, Math.min(32, Math.max(12, rpx * 0.72)), { t: "airport", d: a }, [-0.3, -0.25]);
        if (rpx >= 13) for (const p of features.ports) put("port", p.x, p.y, Math.min(30, rpx * 0.6), { t: "port", d: p }, [-0.35, 0.3]);
        if (rpx >= 16) for (const m of features.mines) medal(RES_ICON[m.kind] || "⛏️", m.x, m.y, { t: "mine", d: m });
        if (rpx >= 20) for (const a of features.agri) medal(RES_ICON[a.kind], a.x, a.y, { t: "agri", d: a });
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

    // 8) 奇观名牌(在旗标之前画,旗标可以盖住它们)
    const taken = [];
    for (const P of plates) {
      const fs = Math.max(10, Math.min(14, rpx * 0.2));
      ctx.font = `700 ${fs}px ${SERIF}`;
      const name = P.name.length > 10 ? P.name.slice(0, 9) + "…" : P.name;
      const w = ctx.measureText(name).width + 14, h = fs + 8, rect = [P.x - w / 2, P.y, w, h];
      if (taken.some((t) => hit(rect, t)) || clusters.some((c) => hit(rect, c.rect, -4))) continue;
      taken.push(rect);
      ctx.fillStyle = "rgba(20,24,32,.92)"; roundRect(ctx, rect[0], rect[1], w, h, 4); ctx.fill();
      ctx.strokeStyle = "#b8934e"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#f3e6c4"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(name, P.x, P.y + h / 2 + 0.5);
      hits.push({ rect, info: { t: "wonder", d: P.w } });
    }

    // 9) 城市旗标:按人口从大到小;旗标锚在自家楼群上方,不许盖住别的城市楼群或已有旗标;
    //    放不下就退成楼群下方的小地名,再放不下就不标
    const minPop = rpx >= 40 ? 0 : rpx >= 24 ? 180000 : rpx >= 14 ? 300000 : rpx >= 8 ? 600000 : rpx >= 5 ? 1200000 : 2000000;
    const fmtK = (v, gold) => (v == null ? "—" : gold ? (v >= 1e5 ? (v / 1e4).toFixed(1) + "万亿" : Math.round(v / 100) + "亿") : v >= 10 ? (v / 10).toFixed(v >= 100 ? 0 : 1) + "万" : Math.round(v * 1000) + "");
    const clusterOf = new Map(clusters.map((c) => [c.id, c]));
    const smallLabels = [];
    for (const c of cities) {
      const tier = cityTier(c.pop);
      const own = clusterOf.get(c.id);
      const [cxp, cyp] = [X(c.x), Y(c.y)];
      if (cxp < -200 || cyp < -120 || cxp > vw + 200 || cyp > vh + 160) continue;
      if (!(c.capital || c.pop >= minPop)) { if (own && rpx >= 30) smallLabels.push(c); continue; }
      const fsz = [12, 12, 13, 14, 16][tier] + (rpx >= 30 ? 1 : 0);
      const showYields = (rpx >= 16 && tier >= 1) || rpx >= 30;
      const tag = rpx >= 10 ? cityTag(c) : null;
      const popTxt = Math.round(c.pop / 1e4) + "万";
      ctx.font = `700 ${fsz}px ${SERIF}`; const tw = ctx.measureText((c.capital ? "★ " : "") + c.name).width;
      ctx.font = `700 ${fsz - 1}px ${SERIF}`; const pw = ctx.measureText(popTxt).width + 14;
      const iw = fsz + 8;
      const r = regions.r3[c.r3];
      const yl = showYields && r ? [["🌾", r.yields.food], ["⚙️", r.yields.production], ["💰", r.yields.gold, true], ["🔬", r.yields.science], ["🎭", r.yields.culture]].filter((y) => y[1] != null).map(([ic, v, gold]) => [ic, fmtK(v, gold)]) : null;
      let yw = 0;
      if (yl) { ctx.font = `600 ${fsz - 3}px ${SERIF}`; yw = yl.reduce((s2, [, v]) => s2 + ctx.measureText(v).width + fsz + 6, 8); }
      const bw = Math.max(tw + pw + iw + 24, yw), bh = fsz + 11, yh = yl ? fsz + 5 : 0, th = tag ? fsz * 0.8 : 0;
      // 锚点:整块旗标(标签带 + 主条 + 产出行)的底边贴在自家楼群顶上方
      const bottom = own ? own.rect[1] - 2 : cyp - Math.max(12, rpx * 0.9);
      const top = bottom - yh - bh, left = cxp - bw / 2;
      const full = [left, top - th, bw, th + bh + yh];
      // 只避让「比自己大」的城市楼群与已挂旗标;小城镇的楼可以被大城市旗标盖住
      const blocked = taken.some((t) => hit(full, t)) || clusters.some((k) => k.id !== c.id && k.pop > c.pop && hit(full, k.rect, -3));
      if (blocked) { if (own && rpx >= 30) smallLabels.push(c); continue; }
      taken.push(full);
      const ci = world.countries.findIndex((k) => k.code === c.cntr);
      const col = ci >= 0 ? countryColor[ci] : "#888";
      const sel = opts.selCity === c.id;
      if (tag) { // 标签带
        ctx.font = `700 ${Math.max(9, fsz - 4)}px ${SERIF}`;
        const label = DISTRICT_TAG[tag], lw = ctx.measureText(label).width + 16;
        ctx.fillStyle = tag === "gov" ? "#8a2f2f" : "#2d4d86"; roundRect(ctx, cxp - lw / 2, top - th + 2, lw, th, 3); ctx.fill();
        ctx.strokeStyle = "rgba(230,200,130,.8)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#f6e7bf"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, cxp, top - th / 2 + 2);
      }
      const gr = ctx.createLinearGradient(0, top, 0, top + bh); // 主条
      gr.addColorStop(0, "#2b3446"); gr.addColorStop(1, "#121722");
      ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillStyle = gr; roundRect(ctx, left, top, bw, bh, 5); ctx.fill(); ctx.shadowColor = "transparent";
      ctx.strokeStyle = sel ? "#ffd76a" : "#b8934e"; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
      const pg = ctx.createLinearGradient(0, top, 0, top + bh);
      pg.addColorStop(0, mix(col, "#ffffff", 0.25)); pg.addColorStop(1, mix(col, "#000000", 0.2));
      ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(left + 3, top + 3); ctx.lineTo(left + pw, top + 3); ctx.lineTo(left + pw + 6, top + bh / 2); ctx.lineTo(left + pw, top + bh - 3); ctx.lineTo(left + 3, top + bh - 3); ctx.closePath(); ctx.fill();
      ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = `700 ${fsz - 1}px ${SERIF}`; ctx.fillText(popTxt, left + 3 + (pw - 3) / 2, top + bh / 2 + 0.5);
      ctx.fillStyle = "#f5e7c4"; ctx.font = `700 ${fsz}px ${SERIF}`; ctx.fillText((c.capital ? "★ " : "") + c.name, left + pw + 6 + (bw - pw - 6 - iw) / 2, top + bh / 2 + 0.5);
      const icx = left + bw - iw / 2 - 2, icy = top + bh / 2, ir = (bh - 6) / 2; // 右侧特色圆章
      ctx.fillStyle = "#e9dcb8"; ctx.beginPath(); ctx.arc(icx, icy, ir, 0, 7); ctx.fill(); ctx.strokeStyle = "#8a6a2e"; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = `${ir * 1.3}px ${EMOJI}`; ctx.fillStyle = "#000";
      ctx.fillText(cityTag(c) ? { gov: "🏛️", campus: "🎓", commercial: "🏦", industrial: "🏭", theater: "🎭", entertainment: "🎡", harbor: "⚓", farm: "🌾" }[cityTag(c)] : "🏘️", icx, icy + 1);
      if (yl) { // 产出行
        const ty = top + bh + 1;
        ctx.fillStyle = "rgba(14,18,26,.9)"; roundRect(ctx, left + 4, ty, bw - 8, yh - 1, 4); ctx.fill();
        let px = cxp - yw / 2 + 4;
        for (const [ic, v] of yl) {
          ctx.font = `${fsz - 3}px ${EMOJI}`; ctx.textAlign = "left"; ctx.fillStyle = "#000"; ctx.fillText(ic, px, ty + yh / 2 + 0.5); px += fsz - 1;
          ctx.font = `600 ${fsz - 3}px ${SERIF}`; ctx.fillStyle = "#e9dfc6"; ctx.fillText(v, px, ty + yh / 2); px += ctx.measureText(v).width + 7;
        }
      }
      hits.push({ rect: full, info: { t: "city", d: c } });
    }
    // 10) 没挂上旗标的城市:楼群下方一个小地名(不压任何旗标)
    for (const c of smallLabels) {
      const own = clusterOf.get(c.id); if (!own) continue;
      const fs = Math.max(10, Math.min(13, rpx * 0.16));
      ctx.font = `700 ${fs}px ${SERIF}`;
      const w = ctx.measureText(c.name).width + 8, y = own.y + rpx * 0.62, rect = [own.x - w / 2, y - fs / 2 - 2, w, fs + 4];
      if (taken.some((t) => hit(rect, t))) continue;
      taken.push(rect);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(25,22,15,.85)"; ctx.lineWidth = 3; ctx.strokeText(c.name, own.x, y);
      ctx.fillStyle = "#fbf1d6"; ctx.fillText(c.name, own.x, y);
      hits.push({ rect, info: { t: "city", d: c } });
    }
  }
  return { draw, hits: () => hits };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
