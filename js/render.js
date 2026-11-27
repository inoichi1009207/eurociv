// 地图绘制:六边形地形、地貌、国界(沿格边,文明式双线)、河流、城市旗标、奇观与资源。
// 坐标:网格坐标 g(km,原点左上,y 向下);屏幕 = (g - cam) * s + 视口中心。

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
const grey = (a, t) => { const A = hexToRgb(a); const g = A[0] * 0.3 + A[1] * 0.59 + A[2] * 0.11; return rgbToHex(A.map((v) => v + (g - v) * t)); };

export function createRenderer(canvas, W, H) {
  const ctx = canvas.getContext("2d");
  const { world, cities, places } = W;
  const C = world.cells;
  const N = H.cols * H.rows;
  const tables = world.tables;
  const terrainColor = tables.terrain.map((t) => t.color);
  const waterColor = tables.water.map((t) => t.color);
  const countryColor = world.countries.map((c) => c.color);
  let bannerRects = [];

  // ---- 每格底色(地形模式)预计算:地形色 × 海拔色调 × 山体阴影 × 轻微抖动;水体按离岸距离做深浅 ----
  const land = (i) => i >= 0 && C.water[i] === 0;
  const dist = new Int16Array(N).fill(99), q = [];
  for (let i = 0; i < N; i++) if (land(i)) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) for (let n = 0; n < 6; n++) { const j = H.nb[q[h] * 6 + n]; if (j >= 0 && dist[j] > dist[q[h]] + 1) { dist[j] = dist[q[h]] + 1; q.push(j); } }
  const elevAt = (i) => (i < 0 ? 0 : C.water[i] !== 0 ? 0 : C.elev[i] === -9999 ? 0 : C.elev[i]);
  const hash = (i) => { let h = Math.imul(i ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const scale = (hex, f) => { const v = [1, 3, 5].map((k) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(k, k + 2), 16) * f)))); return "#" + v.map((x) => x.toString(16).padStart(2, "0")).join(""); };
  const OCEAN = ["#4a93b8", "#3c86ae", "#2f7099", "#255d85", "#1e4d73", "#1a4266", "#173a5e"];
  const baseFill = new Array(N);
  for (let i = 0; i < N; i++) {
    if (C.water[i] === 3) { baseFill[i] = waterColor[3]; continue; }
    if (C.water[i] !== 0) { baseFill[i] = OCEAN[Math.min(OCEAN.length - 1, dist[i])]; continue; }
    let col = terrainColor[C.terrain[i]];
    const e = elevAt(i);
    if (e > 300 && C.terrain[i] < 3) col = mix(col, "#a99a72", Math.min(0.4, (e - 300) / 3500)); // 高处偏褐
    if (C.relief[i] === 2) col = mix(col, "#8a8274", 0.55);
    if (C.feature[i] === 1) col = mix(col, "#3f5e34", 0.45);
    if (C.feature[i] === 2) col = mix(col, "#5d8572", 0.35);
    // 山体阴影:光从西北来,朝西北的坡亮、朝东南的坡暗
    const nb = (n) => H.nb[i * 6 + n];
    const dzdx = (elevAt(nb(0)) - elevAt(nb(3))) / (2 * H.w);
    const dzdy = (elevAt(nb(4)) + elevAt(nb(5)) - elevAt(nb(1)) - elevAt(nb(2))) / (4 * H.h);
    let shade = 1 + 0.009 * (dzdx + dzdy) / Math.SQRT2 * -1;
    shade = Math.max(0.62, Math.min(1.3, shade)) * (0.965 + hash(i) * 0.07);
    col = scale(col, shade);
    if (C.fog[i]) col = mix(grey(col, 0.85), "#262a30", 0.6);
    baseFill[i] = col;
  }
  const cityCells = new Set(cities.map((c) => c.cell));

  // ---- 缩小视图用的预渲染地形图(每 km 0.6 像素):一次画好,平移缩放时直接贴图 ----
  const PRE = 0.6;
  let preCanvas = null, preKey = null;
  function prerender(lensColors, key) {
    if (preKey === key && preCanvas) return preCanvas;
    const cv = preCanvas || document.createElement("canvas");
    cv.width = Math.ceil(H.width * PRE); cv.height = Math.ceil(H.height * PRE);
    const g = cv.getContext("2d");
    g.fillStyle = OCEAN[OCEAN.length - 1]; g.fillRect(0, 0, cv.width, cv.height);
    const K0 = H.corners.map(([x, y]) => [x * PRE * 1.02, y * PRE * 1.02]);
    const groups = new Map();
    for (let i = 0; i < N; i++) {
      const col = lensColors && C.water[i] === 0 ? (C.fog[i] ? "#3b3b3b" : lensColors[i] || "#555a60") : baseFill[i];
      let p = groups.get(col); if (!p) { p = new Path2D(); groups.set(col, p); }
      const [gx, gy] = H.center(i); const x = gx * PRE, y = gy * PRE;
      p.moveTo(x + K0[0][0], y + K0[0][1]); for (let k = 1; k < 6; k++) p.lineTo(x + K0[k][0], y + K0[k][1]); p.closePath();
    }
    for (const [col, p] of groups) { g.fillStyle = col; g.fill(p); }
    if (!lensColors) {
      // 缩小时也要有质感:森林点小树,山脉点小山
      const trees = new Path2D(), peaks = new Path2D(), snow = new Path2D();
      const u = H.r * PRE;
      for (let i = 0; i < N; i++) {
        if (C.water[i] !== 0 || C.fog[i]) continue;
        const [gx, gy] = H.center(i); const x = gx * PRE, y = gy * PRE;
        if (C.feature[i] === 1 && C.relief[i] < 2) for (const [ox, oy] of [[-0.3, 0.25], [0.3, 0.2], [0, -0.25]]) {
          const bx = x + ox * u, by = y + oy * u, hh = 0.3 * u;
          trees.moveTo(bx - hh * 0.5, by); trees.lineTo(bx, by - hh * 1.3); trees.lineTo(bx + hh * 0.5, by); trees.closePath();
        }
        if (C.relief[i] === 2) { const hh = 0.75 * u; peaks.moveTo(x - hh * 0.8, y + hh * 0.45); peaks.lineTo(x, y - hh * 0.85); peaks.lineTo(x + hh * 0.8, y + hh * 0.45); peaks.closePath(); snow.moveTo(x - hh * 0.27, y - hh * 0.4); snow.lineTo(x, y - hh * 0.85); snow.lineTo(x + hh * 0.27, y - hh * 0.4); snow.closePath(); }
      }
      g.fillStyle = "rgba(34,58,28,.75)"; g.fill(trees);
      g.fillStyle = "#77705f"; g.fill(peaks); g.fillStyle = "rgba(246,247,248,.95)"; g.fill(snow);
    }
    preCanvas = cv; preKey = key;
    return cv;
  }
  // 国名标注位置:每国最大连通块的格心平均
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
  const SERIF = '"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif';

  function draw(view, opts) {
    const { cx, cy, s } = view;
    const dpr = window.devicePixelRatio || 1;
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) { canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = OCEAN[OCEAN.length - 1];
    ctx.fillRect(0, 0, vw, vh);
    const X = (gx) => (gx - cx) * s + vw / 2, Y = (gy) => (gy - cy) * s + vh / 2;
    const rpx = H.r * s;
    // 可见范围
    const gx0 = cx - vw / 2 / s - H.w, gx1 = cx + vw / 2 / s + H.w, gy0 = cy - vh / 2 / s - H.r * 2, gy1 = cy + vh / 2 / s + H.r * 2;
    const r0 = Math.max(0, Math.floor(gy0 / H.h)), r1 = Math.min(H.rows - 1, Math.ceil(gy1 / H.h));
    const c0 = Math.max(0, Math.floor(gx0 / H.w)), c1 = Math.min(H.cols - 1, Math.ceil(gx1 / H.w));
    const visible = [];
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) visible.push(row * H.cols + col);
    const K = H.corners.map(([x, y]) => [x * s * 1.005, y * s * 1.005]);
    const hexPath = (p, i, scale = 1) => {
      const [gx, gy] = H.center(i); const x = X(gx), y = Y(gy);
      p.moveTo(x + K[0][0] * scale, y + K[0][1] * scale);
      for (let k = 1; k < 6; k++) p.lineTo(x + K[k][0] * scale, y + K[k][1] * scale);
      p.closePath();
    };
    // 1) 底色(地形或透镜)。缩小时贴预渲染图;放大时逐格矢量绘制,并描极淡的格线
    const lens = opts.lensColors;
    const usePre = s * (window.devicePixelRatio || 1) <= PRE * 1.25;
    if (usePre) {
      const img = prerender(lens, lens ? "lens:" + opts.lensKey : "terrain");
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, X(0), Y(0), img.width / PRE * s, img.height / PRE * s);
    } else {
      const groups = new Map();
      for (const i of visible) {
        const col = lens && C.water[i] === 0 ? (C.fog[i] ? "#3b3b3b" : lens[i] || "#555a60") : baseFill[i];
        let p = groups.get(col); if (!p) { p = new Path2D(); groups.set(col, p); }
        hexPath(p, i);
      }
      for (const [col, p] of groups) { ctx.fillStyle = col; ctx.fill(p); }
      const grid = new Path2D();
      for (const i of visible) if (C.water[i] === 0) hexPath(grid, i);
      ctx.strokeStyle = "rgba(20,15,5,.10)"; ctx.lineWidth = 1; ctx.stroke(grid);
    }

    // 2) 地貌细节(地形模式、放大时)
    if (!lens && !usePre && rpx >= 6) {
      const hills = new Path2D(), peaks = new Path2D(), snow = new Path2D(), trees = new Path2D(), marsh = new Path2D(), fogHatch = new Path2D();
      for (const i of visible) {
        if (C.water[i] !== 0 || cityCells.has(i)) continue;
        const [gx, gy] = H.center(i); const x = X(gx), y = Y(gy), u = rpx;
        if (C.relief[i] === 1) { for (const [ox, oy] of [[-0.35, 0.25], [0.3, -0.1]]) { hills.moveTo(x + (ox - 0.28) * u, y + oy * u); hills.quadraticCurveTo(x + ox * u, y + (oy - 0.36) * u, x + (ox + 0.28) * u, y + oy * u); } }
        if (C.relief[i] === 2) {
          for (const [ox, oy, sz] of [[-0.3, 0.3, 0.45], [0.22, 0.2, 0.55], [-0.02, -0.15, 0.5]]) {
            const bx = x + ox * u, by = y + oy * u, hh = sz * u;
            peaks.moveTo(bx - hh * 0.8, by); peaks.lineTo(bx, by - hh * 1.3); peaks.lineTo(bx + hh * 0.8, by); peaks.closePath();
            snow.moveTo(bx - hh * 0.28, by - hh * 0.85); snow.lineTo(bx, by - hh * 1.3); snow.lineTo(bx + hh * 0.28, by - hh * 0.85); snow.closePath();
          }
        }
        if (C.feature[i] === 1 && C.relief[i] < 2 && rpx >= 8) {
          for (const [ox, oy] of [[-0.35, 0.3], [0.1, 0.35], [0.4, 0.05], [-0.1, -0.2], [-0.45, -0.15]]) {
            const bx = x + ox * u, by = y + oy * u, hh = 0.26 * u;
            trees.moveTo(bx - hh * 0.55, by); trees.lineTo(bx, by - hh * 1.4); trees.lineTo(bx + hh * 0.55, by); trees.closePath();
          }
        }
        if (C.feature[i] === 2) for (const oy of [-0.2, 0.1, 0.4]) { marsh.moveTo(x - 0.4 * u, y + oy * u); marsh.lineTo(x + 0.4 * u, y + oy * u); }
        if (C.fog[i] && rpx >= 9) for (const t of [-0.5, 0, 0.5]) { fogHatch.moveTo(x + (t - 0.3) * u, y + 0.5 * u); fogHatch.lineTo(x + (t + 0.3) * u, y - 0.5 * u); }
      }
      ctx.lineWidth = Math.max(1, rpx * 0.07); ctx.strokeStyle = "rgba(60,45,20,.45)"; ctx.stroke(hills);
      ctx.fillStyle = "#6f675c"; ctx.fill(peaks); ctx.strokeStyle = "rgba(30,25,20,.55)"; ctx.lineWidth = Math.max(0.6, rpx * 0.04); ctx.stroke(peaks);
      ctx.fillStyle = "#f4f6f7"; ctx.fill(snow);
      ctx.fillStyle = "#24481f"; ctx.fill(trees);
      ctx.strokeStyle = "rgba(170,220,230,.6)"; ctx.lineWidth = Math.max(1, rpx * 0.06); ctx.stroke(marsh);
      ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.stroke(fogHatch);
    }
    // 3) 河流
    if (opts.rivers && !lens) {
      ctx.strokeStyle = "#3f8fc6"; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const rv of world.rivers) {
        const wpx = Math.max(0.7, Math.min(4, (9 - rv.rank) * 0.045 * rpx));
        if (rpx < 5 && rv.rank > 5) continue;
        ctx.lineWidth = wpx; ctx.beginPath();
        rv.pts.forEach(([gx, gy], k) => (k ? ctx.lineTo(X(gx), Y(gy)) : ctx.moveTo(X(gx), Y(gy))));
        ctx.stroke();
      }
    }
    // 4) 城市所在格(城区)
    if (rpx >= 3) {
      const urban = new Path2D();
      for (const c of cities) if (c.cell >= 0) { const [gx, gy] = H.center(c.cell); const x = X(gx), y = Y(gy); if (x < -50 || y < -50 || x > vw + 50 || y > vh + 50) continue; hexPath(urban, c.cell, 0.98); }
      ctx.fillStyle = lens ? "rgba(40,36,30,.55)" : "#8e8270"; ctx.fill(urban);
      if (rpx >= 10 && !lens) {
        ctx.fillStyle = "#c9b99a";
        for (const c of cities) {
          if (c.cell < 0) continue; const [gx, gy] = H.center(c.cell); const x = X(gx), y = Y(gy);
          if (x < -50 || y < -50 || x > vw + 50 || y > vh + 50) continue;
          for (const [ox, oy] of [[-0.3, -0.2], [0.1, -0.35], [0.25, 0.1], [-0.15, 0.25], [0.45, -0.1]]) ctx.fillRect(x + ox * rpx, y + oy * rpx, rpx * 0.2, rpx * 0.2);
        }
      }
    }
    // 5) 内部边界:NUTS2(放大时)、选中区域
    const edgePath = (pred, inset = 1) => {
      const p = new Path2D();
      for (const i of visible) {
        if (C.water[i] !== 0) continue;
        const [gx, gy] = H.center(i); const x = X(gx), y = Y(gy);
        for (let n = 0; n < 6; n++) {
          const j = H.nb[i * 6 + n];
          if (!pred(i, j)) continue;
          const [a, b] = EDGE[n];
          p.moveTo(x + K[a][0] * inset, y + K[a][1] * inset); p.lineTo(x + K[b][0] * inset, y + K[b][1] * inset);
        }
      }
      return p;
    };
    if (rpx >= 5) {
      const lvl = opts.lensLevel === "r3" && rpx >= 9 ? "r3" : "r2";
      const A = C[lvl];
      ctx.strokeStyle = lens ? "rgba(0,0,0,.35)" : "rgba(255,250,235,.28)"; ctx.lineWidth = 1; ctx.setLineDash(lens ? [] : [3, 3]);
      ctx.stroke(edgePath((i, j) => j >= 0 && j > i && C.water[j] === 0 && A[i] !== A[j] && C.country[i] === C.country[j] && !C.fog[i]));
      ctx.setLineDash([]);
    }
    // 6) 国界:每国沿自己领土的格边内缩画一条国色线 —— 两国相邻处呈现两条并行色线
    const inset = 0.86;
    const byCountry = new Map();
    for (const i of visible) {
      const ci = C.country[i];
      if (C.water[i] !== 0 || ci < 0 || C.fog[i]) continue;
      const [gx, gy] = H.center(i); const x = X(gx), y = Y(gy);
      for (let n = 0; n < 6; n++) {
        const j = H.nb[i * 6 + n];
        const cj = j >= 0 && C.water[j] === 0 ? C.country[j] : -1;
        if (cj === ci) continue;
        let p = byCountry.get(ci); if (!p) { p = { line: new Path2D(), outer: new Path2D() }; byCountry.set(ci, p); }
        const [a, b] = EDGE[n];
        p.line.moveTo(x + K[a][0] * inset, y + K[a][1] * inset); p.line.lineTo(x + K[b][0] * inset, y + K[b][1] * inset);
        p.outer.moveTo(x + K[a][0], y + K[a][1]); p.outer.lineTo(x + K[b][0], y + K[b][1]);
      }
    }
    ctx.lineCap = "round";
    for (const [ci, p] of byCountry) {
      ctx.strokeStyle = "rgba(10,10,10,.55)"; ctx.lineWidth = Math.max(1.2, rpx * 0.12); ctx.stroke(p.outer);
      ctx.strokeStyle = countryColor[ci]; ctx.lineWidth = Math.max(1.4, rpx * 0.16); ctx.stroke(p.line);
    }
    // 迷雾国界:细灰线
    ctx.strokeStyle = "rgba(200,200,200,.25)"; ctx.lineWidth = 1;
    ctx.stroke(edgePath((i, j) => C.fog[i] && j >= 0 && C.water[j] === 0 && C.country[j] !== C.country[i]));
    // 选中区域描金边
    if (opts.selRegion) {
      const { level, index } = opts.selRegion; const A = C[level];
      ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = Math.max(2, rpx * 0.18);
      ctx.stroke(edgePath((i, j) => A[i] === index && (j < 0 || A[j] !== index || C.water[j] !== 0)));
    }
    // 7) 奇观与资源
    // 图标按所在格吸附到格心偏下处,同格只画一个,与已画图标重叠则跳过;奇观要放得更大才出现
    if (rpx >= 9) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const fs = Math.min(20, Math.max(10, rpx * 0.55));
      ctx.font = `${fs}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
      const used = new Set(), dots = [];
      const pin = (cell, glyph, ring) => {
        if (cell < 0 || used.has(cell)) return;
        const [gx, gy] = H.center(cell); const x = X(gx) + rpx * 0.42, y = Y(gy) + rpx * 0.38;
        if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20) return;
        if (dots.some(([a, b]) => Math.hypot(a - x, b - y) < fs * 1.5)) return;
        used.add(cell); dots.push([x, y]);
        ctx.fillStyle = "rgba(15,20,30,.85)"; ctx.beginPath(); ctx.arc(x, y, fs * 0.68, 0, 7); ctx.fill();
        ctx.strokeStyle = ring; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillText(glyph, x, y + 1);
      };
      if (opts.resources) for (const r of places.resources) pin(r.cell, r.kind === "nuclear" ? "☢️" : "💧", r.kind === "nuclear" ? "#e8d44d" : "#3fa7d6");
      if (opts.wonders && rpx >= 14) for (const w of places.wonders) pin(w.cell, w.natural ? "🏞️" : "🏛️", "#d9b56a");
    }
    // 8) 国名:大字距衬线字,缩小时清晰、放大后渐隐
    const labelAlpha = Math.max(0, Math.min(1, (14 - rpx) / 7));
    if (labelAlpha > 0.02) {
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      for (const L of labelPos) {
        const fs = Math.max(11, Math.min(40, Math.sqrt(L.n) * H.w * s * 0.2));
        const x = X(L.x), y = Y(L.y);
        if (x < -200 || y < -60 || x > vw + 200 || y > vh + 60) continue;
        ctx.font = `700 ${fs}px ${SERIF}`;
        const chars = [...L.name], gap = fs * 0.45;
        const widths = chars.map((ch) => ctx.measureText(ch).width);
        let cx0 = x - (widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1)) / 2;
        chars.forEach((ch, k) => {
          const cxk = cx0 + widths[k] / 2;
          ctx.strokeStyle = `rgba(30,24,12,${0.45 * labelAlpha})`; ctx.lineWidth = Math.max(2, fs * 0.12); ctx.strokeText(ch, cxk, y);
          ctx.fillStyle = `rgba(250,242,220,${0.7 * labelAlpha})`; ctx.fillText(ch, cxk, y);
          cx0 += widths[k] + gap;
        });
      }
      ctx.restore();
    }
    // 9) 四周压暗(视觉焦点落在中间)
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(5,10,20,.42)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
    // 10) 城市旗标(按人口从大到小,避让重叠):衬线字、渐变底、人口牌 + 首个特色区域图标
    bannerRects = [];
    const minPop = rpx >= 20 ? 0 : rpx >= 13 ? 180000 : rpx >= 8 ? 350000 : rpx >= 5 ? 800000 : 1500000;
    ctx.textBaseline = "middle";
    const taken = [];
    const fsz = rpx >= 10 ? 13 : 12;
    const DICON = { campus: "🎓", industrial: "🏭", commercial: "🏦", theater: "🎭", entertainment: "🎡", harbor: "⚓", farm: "🌾" };
    const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    for (const c of cities) {
      if (!(c.capital || c.pop >= minPop)) continue;
      const x = X(c.x), y = Y(c.y) - Math.max(10, rpx * 0.9);
      if (x < -120 || y < -30 || x > vw + 120 || y > vh + 30) continue;
      const label = (c.capital ? "★ " : "") + c.name, popTxt = Math.round(c.pop / 1e4) + "万";
      const dkey = c.districts.find((d) => DICON[d.key])?.key;
      ctx.font = `700 ${fsz}px ${SERIF}`;
      const tw = ctx.measureText(label).width;
      ctx.font = `700 ${fsz - 1}px ${SERIF}`;
      const pw = ctx.measureText(popTxt).width + 10;
      const iw = dkey ? fsz + 6 : 0;
      const bw = tw + pw + 16 + iw, bh = fsz + 10;
      const rect = [x - bw / 2, y - bh / 2, bw, bh];
      if (taken.some((t) => rect[0] < t[0] + t[2] + 2 && rect[0] + bw + 2 > t[0] && rect[1] < t[1] + t[3] + 1 && rect[1] + bh + 1 > t[1])) continue;
      taken.push(rect);
      const ci = world.countries.findIndex((k) => k.code === c.cntr);
      const col = ci >= 0 ? countryColor[ci] : "#888";
      const sel = opts.selCity === c.id;
      const gr = ctx.createLinearGradient(0, rect[1], 0, rect[1] + bh);
      gr.addColorStop(0, "rgba(38,46,62,.96)"); gr.addColorStop(1, "rgba(14,18,28,.96)");
      ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
      ctx.fillStyle = gr; roundRect(ctx, rect[0], rect[1], bw, bh, bh / 2); ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = sel ? "#ffd76a" : "rgba(201,164,92,.75)"; ctx.lineWidth = sel ? 2 : 1; ctx.stroke();
      const pg = ctx.createLinearGradient(0, rect[1], 0, rect[1] + bh);
      pg.addColorStop(0, mix(col, "#ffffff", 0.18)); pg.addColorStop(1, mix(col, "#000000", 0.25));
      ctx.fillStyle = pg; roundRect(ctx, rect[0] + 2, rect[1] + 2, pw, bh - 4, (bh - 4) / 2); ctx.fill();
      ctx.font = `700 ${fsz - 1}px ${SERIF}`;
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(popTxt, rect[0] + 2 + pw / 2, y + 0.5);
      ctx.font = `700 ${fsz}px ${SERIF}`;
      ctx.textAlign = "left"; ctx.fillStyle = "#f3e6c4"; ctx.fillText(label, rect[0] + pw + 8, y + 0.5);
      if (dkey) { ctx.font = `${fsz - 1}px ${EMOJI}`; ctx.textAlign = "center"; ctx.fillText(DICON[dkey], rect[0] + bw - iw / 2 - 4, y + 1); }
      bannerRects.push({ rect, id: c.id });
    }
  }
  return { draw, banners: () => bannerRects };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
