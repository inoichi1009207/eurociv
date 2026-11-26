// 投影、六边形网格、点在多边形内 —— 与具体国家无关的通用几何。
// 投影:兰伯特等积方位投影(球面近似)。欧洲默认取 EPSG:3035 的中心 (10°E, 52°N)。
const R = 6371.0072; // km,等积球半径
const D2R = Math.PI / 180;

export function makeLAEA(lon0 = 10, lat0 = 52) {
  const l0 = lon0 * D2R, p0 = lat0 * D2R;
  const sp0 = Math.sin(p0), cp0 = Math.cos(p0);
  return {
    forward(lon, lat) {
      const l = lon * D2R - l0, p = lat * D2R;
      const sp = Math.sin(p), cp = Math.cos(p), cl = Math.cos(l);
      const k = Math.sqrt(2 / (1 + sp0 * sp + cp0 * cp * cl));
      return [R * k * cp * Math.sin(l), R * k * (cp0 * sp - sp0 * cp * cl)];
    },
    inverse(x, y) {
      const rho = Math.hypot(x, y);
      if (rho < 1e-9) return [lon0, lat0];
      const c = 2 * Math.asin(Math.min(1, rho / (2 * R)));
      const sc = Math.sin(c), cc = Math.cos(c);
      const lat = Math.asin(cc * sp0 + (y * sc * cp0) / rho);
      const lon = l0 + Math.atan2(x * sc, rho * cp0 * cc - y * sp0 * sc);
      return [lon / D2R, lat / D2R];
    },
  };
}

// 尖顶六边形,"odd-r" 偏移坐标(奇数行右移半格)。r = 外接圆半径(km)。
// 网格坐标系:原点在左上,y 向下(= 投影 y 取反)。
export function makeHexGrid({ r, cols, rows }) {
  const w = Math.sqrt(3) * r, h = 1.5 * r;
  const center = (col, row) => [w * (col + 0.5 * (row & 1)) + w / 2, h * row + r];
  const idx = (col, row) => (col < 0 || row < 0 || col >= cols || row >= rows ? -1 : row * cols + col);
  function locate(x, y) {
    // 像素 → 轴向分数坐标 → 立方取整 → 偏移坐标
    const px = x - w / 2, py = y - r;
    const q = (Math.sqrt(3) / 3 * px - py / 3) / r;
    const rr = (2 / 3 * py) / r;
    let cx = q, cz = rr, cy = -cx - cz;
    let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
    const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    const row = rz, col = rx + (rz - (rz & 1)) / 2;
    return idx(col, row);
  }
  function neighbors(i) {
    const col = i % cols, row = (i / cols) | 0;
    const odd = row & 1;
    const d = odd
      ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
      : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
    return d.map(([dc, dr]) => idx(col + dc, row + dr));
  }
  return { r, w, h, cols, rows, center, idx, locate, neighbors, count: cols * rows };
}

// ---- 多边形:把 GeoJSON (Multi)Polygon 投影成环数组,并建包围盒 ----
export function projectGeometry(geom, project) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  return polys.map((rings) => {
    const pr = rings.map((ring) => ring.map(([lon, lat]) => project(lon, lat)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pr[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { rings: pr, bbox: [x0, y0, x1, y1] };
  });
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inPolys(x, y, polys) {
  for (const p of polys) {
    const b = p.bbox;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    if (!inRing(x, y, p.rings[0])) continue;
    let hole = false;
    for (let k = 1; k < p.rings.length; k++) if (inRing(x, y, p.rings[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}
export function polysArea(polys) {
  let a = 0;
  for (const p of polys) p.rings.forEach((ring, k) => {
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    a += (k === 0 ? 1 : -1) * Math.abs(s / 2);
  });
  return a;
}

// 简单网格索引:把要素按包围盒放进粗格子,加速点查询
export function makeIndex(features, cell = 100) {
  const map = new Map();
  features.forEach((f, fi) => {
    for (const p of f.polys) {
      const [x0, y0, x1, y1] = p.bbox;
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
        for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
          const k = gx + "," + gy;
          if (!map.has(k)) map.set(k, new Set());
          map.get(k).add(fi);
        }
    }
  });
  return {
    find(x, y) {
      const s = map.get(Math.floor(x / cell) + "," + Math.floor(y / cell));
      if (!s) return -1;
      for (const fi of s) if (inPolys(x, y, features[fi].polys)) return fi;
      return -1;
    },
  };
}

// 确定性伪随机/平滑噪声(用于在区域内「按比例」摆放森林等地貌,保证可复现)
export function hash01(i, seed = 0) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function smoothNoise(x, y, scale, seed) {
  const gx = x / scale, gy = y / scale;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const v = (a, b) => hash01((a * 73856093) ^ (b * 19349663), seed);
  const s = (t) => t * t * (3 - 2 * t);
  const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * s(fx);
  const bot = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * s(fx);
  return top + (bot - top) * s(fy);
}
