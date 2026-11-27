// 主程序:加载数据、相机与交互、透镜、面板、搜索、百科、分享。
import { hexGeometry, createRenderer, mix } from "./render.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const load = (n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(`data/${n}.json: HTTP ${r.status}`); return r.json(); });

// ---------- 数字格式 ----------
const nf = new Intl.NumberFormat("zh-CN");
const fmtPeople = (k) => (k == null ? "—" : k * 1000 >= 1e4 ? `${(k / 10).toFixed(k < 100 ? 1 : 0)}万` : `${Math.round(k * 1000)}`); // 输入千人
const fmtEur = (m) => (m == null ? "—" : m >= 1e6 ? `${(m / 1e6).toFixed(2)}万亿€` : m >= 100 ? `${nf.format(Math.round(m / 100))}亿€` : `${nf.format(Math.round(m))}百万€`); // 输入百万欧元
const fmtPop = (p) => (p == null ? "—" : p >= 1e8 ? `${(p / 1e8).toFixed(2)}亿` : p >= 1e4 ? `${nf.format(Math.round(p / 1e4))}万` : nf.format(p));
const fmtYield = (key, v) => (key === "gold" ? fmtEur(v) : fmtPeople(v) + (v == null ? "" : "人"));

const [world, regions, cities, places, meta, sources] = await Promise.all(["world", "regions", "cities", "places", "meta", "sources"].map(load));
const H = hexGeometry(world);
const C = world.cells;
const canvas = $("#map");
const R = createRenderer(canvas, { world, cities, places }, H);
const cityById = new Map(cities.map((c) => [c.id, c]));
const YI = Object.fromEntries(meta.yields.map((y) => [y.key, y]));
const DI = Object.fromEntries(meta.districts.map((d) => [d.key, d]));
const countryName = (code) => world.countries.find((c) => c.code === code)?.name || code;

// ---------- 状态 ----------
const fit = () => { const vw = canvas.clientWidth, vh = canvas.clientHeight - 46; return Math.min(vw / H.width, vh / (H.height * 0.82)); };
const view = { cx: H.width * 0.45, cy: H.height * 0.53, s: fit() * 0.97 };
const state = { lens: null, selCity: null, selRegion: null, rivers: true, wonders: true, resources: true };
let lensColors = null, lensValues = null, lensDef = null, lensLegend = null;

// ---------- 透镜 ----------
const RAMPS = {
  warm: ["#fff3c4", "#f6c35b", "#e07b39", "#b8402d", "#5e1a2a"],
  blue: ["#e8f1f8", "#a9cbe6", "#5f9fd1", "#2a6aa8", "#0f2f5c"],
  green: ["#f0f4d8", "#c5dd8e", "#86b85a", "#3e7f3a", "#173d1e"],
  orange: ["#fbecd6", "#f6c48d", "#ea8a43", "#c25a1d", "#5c2408"],
  purple: ["#f2e8f6", "#d7bde4", "#ad82c8", "#7b4aa0", "#3a1c54"],
  rdbu: ["#b2182b", "#ef8a62", "#f7f2ea", "#67a9cf", "#2166ac"],
  terrain: ["#3f7a45", "#9fb36a", "#d7c58a", "#a97f55", "#f2f2f2"],
};
const rampAt = (ramp, t) => { t = Math.max(0, Math.min(1, t)); const k = t * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(k)); return mix(ramp[i], ramp[i + 1], k - i); };
const getPath = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function lensValueAt(L, i) {
  if (C.water[i] !== 0 || C.fog[i]) return null;
  if (L.level === "cell") { const v = C[L.field][i]; return v === -9999 ? null : v; }
  const k = C[L.level][i]; if (k < 0) return null;
  const v = getPath(regions[L.level][k], L.field);
  return v == null || !isFinite(v) ? null : v;
}
function setLens(id) {
  state.lens = id;
  lensDef = meta.lenses.find((l) => l.id === id) || null;
  document.querySelectorAll(".lens-btn").forEach((b) => b.classList.toggle("on", b.dataset.id === (id || "")));
  if (!lensDef) { lensColors = lensValues = null; $("#legend").hidden = true; draw(); syncHash(); return; }
  const L = lensDef, n = C.water.length;
  lensValues = new Array(n).fill(null); lensColors = new Array(n).fill(null);
  const vals = [];
  for (let i = 0; i < n; i++) { const v = lensValueAt(L, i); lensValues[i] = v; if (v != null) vals.push(v); }
  vals.sort((a, b) => a - b);
  const q = (p) => vals[Math.floor(p * (vals.length - 1))];
  let toT, lo, hi;
  if (L.scale === "cat") toT = null;
  else if (L.scale === "log") { lo = Math.max(q(0.02), 1e-3); hi = q(0.98); toT = (v) => (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)); }
  else if (L.scale === "diverge") { lo = q(0.03); hi = q(0.97); const m = L.mid; toT = (v) => (v < m ? 0.5 - 0.5 * (m - v) / (m - lo) : 0.5 + 0.5 * (v - m) / (hi - m)); }
  else { lo = q(0.02); hi = q(0.98); toT = (v) => (v - lo) / (hi - lo); }
  const ramp = RAMPS[L.ramp] || RAMPS.blue;
  for (let i = 0; i < n; i++) {
    const v = lensValues[i]; if (v == null) continue;
    lensColors[i] = L.scale === "cat" ? L.cats[v]?.[1] : rampAt(ramp, toT(v));
  }
  const unit = L.unit ? ` ${L.unit}` : "";
  const f = (v) => (Math.abs(v) >= 100 ? nf.format(Math.round(v)) : (+v.toFixed(1)).toString());
  lensLegend = L.scale === "cat"
    ? L.cats.map(([name, col]) => `<div class="cat"><i style="background:${col}"></i>${esc(name)}</div>`).join("")
    : `<div class="ramp" style="background:linear-gradient(90deg,${ramp.join(",")})"></div><div class="ends"><span>${f(lo)}${unit}</span>${L.scale === "diverge" ? `<span>${L.mid}</span>` : ""}<span>${f(hi)}${unit}</span></div>`;
  $("#legend").innerHTML = `<b>${esc(L.name)}</b>${L.level === "r2" ? " <small>(NUTS2 大区)</small>" : L.level === "r3" ? " <small>(NUTS3 地区)</small>" : ""}${lensLegend}<p>${esc(L.desc)}</p><p>灰色 = 无数据</p>`;
  $("#legend").hidden = false;
  draw(); syncHash();
}
function buildLensDock() {
  let h = `<button class="lens-btn on" data-id="">🗺️ 地形与国界</button>`;
  for (const g of meta.lensGroups) {
    const ls = meta.lenses.filter((l) => l.group === g.id); if (!ls.length) continue;
    h += `<div class="lens-group">${esc(g.name)}</div>` + ls.map((l) => `<button class="lens-btn" data-id="${l.id}">${esc(l.name)}</button>`).join("");
  }
  $("#lens-list").innerHTML = h;
  $("#lens-list").addEventListener("click", (e) => { const b = e.target.closest(".lens-btn"); if (b) setLens(b.dataset.id || null); });
  const tg = [["rivers", "河流"], ["wonders", "奇观"], ["resources", "资源"]];
  $("#toggles").innerHTML = tg.map(([k, n]) => `<label><input type="checkbox" data-k="${k}" checked>${n}</label>`).join("");
  $("#toggles").addEventListener("change", (e) => { state[e.target.dataset.k] = e.target.checked; draw(); });
}

// ---------- 绘制 ----------
let raf = 0;
function draw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    R.draw(view, { lensColors, lensKey: state.lens, lensLevel: lensDef?.level, selCity: state.selCity, selRegion: state.selRegion, rivers: state.rivers, wonders: state.wonders, resources: state.resources });
  });
}
window.addEventListener("resize", draw);

// ---------- 相机交互 ----------
const toGrid = (sx, sy) => [(sx - canvas.clientWidth / 2) / view.s + view.cx, (sy - canvas.clientHeight / 2) / view.s + view.cy];
const clampView = () => {
  view.s = Math.max(fit() * 0.7, Math.min(6, view.s));
  view.cx = Math.max(0, Math.min(H.width, view.cx)); view.cy = Math.max(0, Math.min(H.height, view.cy));
};
function zoomAt(sx, sy, f) {
  const [gx, gy] = toGrid(sx, sy);
  view.s *= f; clampView();
  view.cx = gx - (sx - canvas.clientWidth / 2) / view.s; view.cy = gy - (sy - canvas.clientHeight / 2) / view.s;
  clampView(); draw(); syncHashSoon();
}
canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
const pointers = new Map();
let drag = null, moved = false, pinch = null;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; moved = false; }
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.s }; drag = null; }
});
canvas.addEventListener("pointermove", (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.s * (d / pinch.d)) / view.s); moved = true; return;
  }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; canvas.classList.add("dragging"); }
    if (moved) { view.cx = drag.cx - dx / view.s; view.cy = drag.cy - dy / view.s; clampView(); draw(); hideTip(); syncHashSoon(); return; }
  }
  if (e.pointerType === "mouse" && !drag) hover(e.clientX, e.clientY);
});
const endPointer = (e) => {
  pointers.delete(e.pointerId); canvas.classList.remove("dragging");
  if (pointers.size < 2) pinch = null;
  if (drag && !moved && e.type === "pointerup") click(e.clientX, e.clientY);
  if (pointers.size === 0) drag = null;
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", hideTip);
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") { if (e.key === "Escape") e.target.blur(); return; }
  const step = 120 / view.s;
  const k = e.key.toLowerCase();
  if (k === "/") { e.preventDefault(); $("#search").focus(); }
  else if (k === "escape") { closePanel(); $("#modal").hidden = true; }
  else if (k === "+" || k === "=") zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.3);
  else if (k === "-") zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / 1.3);
  else if (["arrowleft", "a"].includes(k)) { view.cx -= step; clampView(); draw(); }
  else if (["arrowright", "d"].includes(k)) { view.cx += step; clampView(); draw(); }
  else if (["arrowup", "w"].includes(k)) { view.cy -= step; clampView(); draw(); }
  else if (["arrowdown", "s"].includes(k)) { view.cy += step; clampView(); draw(); }
  else if (k === "?") openModal("help");
});

// ---------- 悬停与点击 ----------
const tip = $("#tooltip");
function hideTip() { tip.hidden = true; }
function cellAt(sx, sy) { const [gx, gy] = toGrid(sx, sy); return H.locate(gx, gy); }
function bannerAt(sx, sy) { return R.banners().find(({ rect: [x, y, w, h] }) => sx >= x && sx <= x + w && sy >= y && sy <= y + h); }
function terrainText(i) {
  const T = world.tables;
  if (C.water[i] !== 0) return T.water[C.water[i]].name;
  const parts = [T.terrain[C.terrain[i]].name];
  if (C.relief[i]) parts.push(T.relief[C.relief[i]].name);
  if (C.feature[i]) parts.push(T.feature[C.feature[i]].name);
  return parts.join(" · ") + (C.elev[i] !== -9999 ? ` · ${nf.format(C.elev[i])} 米` : "");
}
function hover(sx, sy) {
  const b = bannerAt(sx, sy);
  if (b) { const c = cityById.get(b.id); showTip(sx, sy, `<b>${esc(c.name)}</b> <span class="muted">${esc(c.name_en || "")}</span><br>${esc(countryName(c.cntr))} · 人口 ${fmtPop(c.pop)}<br><span class="muted">点击查看城市</span>`); return; }
  const i = cellAt(sx, sy);
  if (i < 0) return hideTip();
  let h = `<span class="muted">${esc(terrainText(i))}</span>`;
  if (C.water[i] === 0) {
    if (C.fog[i]) h = `<b>${esc(countryName(world.countries[C.country[i]]?.code))}</b> · 迷雾<br>${h}<br><span class="muted">不在 Eurostat NUTS 覆盖内,无数据</span>`;
    else {
      const r3 = C.r3[i] >= 0 ? regions.r3[C.r3[i]] : null, r2 = C.r2[i] >= 0 ? regions.r2[C.r2[i]] : null;
      h = `<b>${esc(r3?.name || r2?.name || "")}</b> <span class="muted">${esc(r3?.id || r2?.id || "")}</span><br>${esc(countryName(world.countries[C.country[i]]?.code))}${r2 && r3 ? " · " + esc(r2.name) : ""}<br>${h}`;
      if (lensDef) { const v = lensValues[i]; h += `<br>${esc(lensDef.name)}:<b>${v == null ? "无数据" : lensDef.scale === "cat" ? esc(lensDef.cats[v][0]) : (Math.abs(v) >= 100 ? nf.format(Math.round(v)) : (+v.toFixed(2))) + " " + esc(lensDef.unit)}</b>`; }
    }
  }
  const w = places.wonders.find((x) => x.cell === i), rs = places.resources.find((x) => x.cell === i);
  if (w && state.wonders) h += `<br>${w.natural ? "🏞️" : "🏛️"} ${esc(w.name)}`;
  if (rs && state.resources) h += `<br>${rs.kind === "nuclear" ? "☢️ 核电站" : "💧 水电站"} ${esc(rs.name)}${rs.mw ? ` · ${nf.format(Math.round(rs.mw))} MW` : ""} <span class="muted">· 状态${esc(rs.status || "未标注")}</span>`;
  showTip(sx, sy, h);
}
function showTip(sx, sy, html) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(sx + 14, innerWidth - w - 8) + "px"; tip.style.top = Math.min(sy + 14, innerHeight - h - 8) + "px";
}
function click(sx, sy) {
  hideTip();
  const b = bannerAt(sx, sy);
  if (b) return openCity(b.id);
  const i = cellAt(sx, sy);
  if (i < 0 || C.water[i] !== 0) return closePanel();
  const c = cities.find((x) => x.cell === i);
  if (c) return openCity(c.id);
  if (C.fog[i]) return openFog(i);
  if (C.r3[i] >= 0) openRegion("r3", C.r3[i]); else if (C.r2[i] >= 0) openRegion("r2", C.r2[i]);
}

// ---------- 面板 ----------
const panel = $("#panel");
function closePanel() { panel.hidden = true; state.selCity = null; state.selRegion = null; draw(); syncHash(); }
panel.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closePanel();
  const j = e.target.closest("[data-city]"); if (j) { openCity(j.dataset.city); flyToCity(cityById.get(j.dataset.city)); }
  const r = e.target.closest("[data-r3]"); if (r) openRegion("r3", +r.dataset.r3);
});
const SECTORS = [["agri", "农林渔", "#8bc34a"], ["industry", "工业", "#e08a3c"], ["construction", "建筑", "#b8733a"], ["trade", "商贸运输餐旅", "#d9b56a"], ["info", "信息通信", "#4fa3e0"], ["finance", "金融", "#5a6fd0"], ["realestate", "地产", "#8a7bd0"], ["professional", "专业科研与行政", "#2fa3a3"], ["public", "公共管理教育卫生", "#9aa6b8"], ["arts", "艺术娱乐等", "#c27bd6"]];
function yieldsBlock(r) {
  const est = new Set(r.jobs_estimated || []);
  const estOf = { science: est.has("J") || est.has("M_N"), culture: est.has("R-U") };
  return `<div class="ygrid">${meta.yields.map((y) => `<div title="${esc(y.desc)}">${y.icon}<b>${y.key === "gold" ? fmtEur(r.yields[y.key]) : fmtPeople(r.yields[y.key])}${estOf[y.key] ? '<span class="est">估</span>' : ""}</b>${esc(y.label)}</div>`).join("")}</div>
  <div class="note">粮食/生产力/科技/文化 = 相应行业就业人数(${r.jobs_year ?? "—"} 年);金币 = GDP(${r.gdp_year ?? "—"} 年)。</div>`;
}
function jobsBlock(r) {
  if (!r.jobs) return `<div class="note">本地区无分行业就业数据。</div>`;
  const tot = r.jobs.total;
  const segs = SECTORS.map(([k, n, col]) => [k, n, col, r.jobs[k] ?? 0]).filter((s) => s[3] > 0);
  return `<div class="bars">${segs.map(([, n, col, v]) => `<span title="${n} ${fmtPeople(v)}人" style="width:${(v / tot) * 100}%;background:${col}"></span>`).join("")}</div>
  <div class="barlegend">${segs.map(([k, n, col, v]) => `<span><i style="background:${col}"></i>${n} ${((v / tot) * 100).toFixed(1)}%${(r.jobs_estimated || []).some((e) => ({ info: "J", finance: "K", professional: "M_N", arts: "R-U" })[k] === e) ? "(估)" : ""}</span>`).join("")}</div>
  <div class="note">总就业 ${fmtPeople(tot)}人。</div>`;
}
function r2Block(r2) {
  if (!r2) return "";
  const row = (k, v, y) => `<dt>${k}</dt><dd>${v}${y ? ` <small style="color:var(--muted)">${y}</small>` : ""}</dd>`;
  return `<h3>所在大区 · ${esc(r2.name)} <small>${r2.id}</small></h3><dl class="kv">
    ${row("人均 GDP(PPS,欧盟=100)", r2.gdp_pc_pps ?? "—", r2.gdp_pc_pps_year)}
    ${row("凝聚政策档位(测算)", r2.cohesion == null ? "—" : ["欠发达", "转型", "较发达"][r2.cohesion], "")}
    ${row("失业率", r2.unemp == null ? "—" : r2.unemp + "%", r2.unemp_year)}
    ${row("研发投入 / GDP", r2.rd_pct == null ? "—" : r2.rd_pct + "%", r2.rd_year)}
    ${row("高等教育(25–64 岁)", r2.tertiary == null ? "—" : r2.tertiary + "%", r2.tertiary_year)}
    ${row("游客过夜 / 千人", r2.nights_pc == null ? "—" : nf.format(r2.nights_pc), r2.nights_year)}
    ${row("林地 / 耕地", `${r2.lc.wood ?? "—"}% / ${r2.lc.crop ?? "—"}%`, r2.lc_year)}
  </dl>`;
}
function wondersIn(r3index) {
  const ws = places.wonders.filter((w) => w.r3 === r3index);
  return ws.length ? `<h3>奇观(世界遗产)</h3>${ws.map((w) => `<div class="district"><span class="ic">${w.natural ? "🏞️" : "🏛️"}</span><div>${esc(w.name)}${w.name_en && w.name_en !== w.name ? `<small>${esc(w.name_en)}</small>` : ""}</div></div>`).join("")}` : "";
}
function openCity(id) {
  const c = cityById.get(id); if (!c) return;
  const r = regions.r3[c.r3], r2 = r.r2 >= 0 ? regions.r2[r.r2] : null;
  state.selCity = id; state.selRegion = { level: "r3", index: c.r3 };
  const shared = cities.filter((x) => x.r3 === c.r3 && x.id !== c.id);
  panel.innerHTML = `<button class="close" data-close>✕</button>
    <h2>${c.capital ? "★ " : ""}${esc(c.name)}</h2>
    <div class="sub">${esc(c.name_en || "")} · ${esc(countryName(c.cntr))} · 人口 ${fmtPop(c.pop)}(维基数据)</div>
    <h3>辖区产出 · ${esc(r.name)} <small>${r.id}</small></h3>${yieldsBlock(r)}
    ${shared.length ? `<div class="note">同一 NUTS3 辖区内还有:${shared.map((x) => `<span class="chip" data-city="${x.id}">${esc(x.name)}</span>`).join(" ")}(产出为整个辖区合计)</div>` : ""}
    <h3>区域</h3>${c.districts.length ? c.districts.map((d) => `<div class="district"><span class="ic">${DI[d.key].icon}</span><div>${esc(DI[d.key].label)}<small>${esc(d.why)}</small></div></div>`).join("") : `<div class="note">未达到任何区域的判定阈值。</div>`}
    <h3>人口与经济</h3><dl class="kv">
      <dt>辖区人口</dt><dd>${fmtPop(r.pop)} <small style="color:var(--muted)">${r.pop_year ?? ""}</small></dd>
      <dt>人口密度</dt><dd>${r.density == null ? "—" : nf.format(Math.round(r.density)) + " 人/km²"}</dd>
      <dt>人均 GDP(PPS,欧盟=100)</dt><dd>${r.gdp_pc_pps ?? "—"} <small style="color:var(--muted)">${r.gdp_pc_pps_year ?? ""}</small></dd>
    </dl>
    <h3>就业结构</h3>${jobsBlock(r)}
    ${r2Block(r2)}${wondersIn(c.r3)}
    <div class="note">数据:Eurostat、维基数据。每个数字的来源与规则见「百科」。</div>`;
  panel.hidden = false; draw(); syncHash();
}
function openRegion(level, index) {
  const r = regions[level][index];
  state.selCity = null; state.selRegion = { level, index };
  const r2 = level === "r3" ? (r.r2 >= 0 ? regions.r2[r.r2] : null) : r;
  const cs = level === "r3" ? cities.filter((c) => c.r3 === index) : [];
  panel.innerHTML = `<button class="close" data-close>✕</button>
    <h2>${esc(r.name)}</h2><div class="sub">${r.id} · ${level === "r3" ? "NUTS3 地区" : "NUTS2 大区"} · ${esc(countryName(r.cntr))}</div>
    ${level === "r3" ? `<h3>产出</h3>${yieldsBlock(r)}
      <h3>人口与经济</h3><dl class="kv"><dt>人口</dt><dd>${fmtPop(r.pop)} <small style="color:var(--muted)">${r.pop_year ?? ""}</small></dd>
      <dt>面积</dt><dd>${r.area == null ? "—" : nf.format(r.area) + " km²"}${r.area_src === "geometry" ? " <small>(按边界估)</small>" : ""}</dd>
      <dt>人口密度</dt><dd>${r.density == null ? "—" : nf.format(Math.round(r.density)) + " 人/km²"}</dd>
      <dt>人均 GDP(PPS,欧盟=100)</dt><dd>${r.gdp_pc_pps ?? "—"}</dd></dl>
      ${cs.length ? `<h3>城市</h3><div class="chips">${cs.map((c) => `<span class="chip" data-city="${c.id}">${esc(c.name)} ${fmtPop(c.pop)}</span>`).join("")}</div>` : ""}
      <h3>就业结构</h3>${jobsBlock(r)}` : `<div class="note">该国在 NUTS 中只划到 NUTS2 级,没有 NUTS3 地区数据。</div>`}
    ${r2Block(r2)}${level === "r3" ? wondersIn(index) : ""}`;
  panel.hidden = false; draw(); syncHash();
}
function openFog(i) {
  const c = world.countries[C.country[i]];
  state.selCity = null; state.selRegion = null;
  panel.innerHTML = `<button class="close" data-close>✕</button><h2>${esc(c?.name || "")}</h2><div class="sub">迷雾 · 尚未探索</div>
    <p>这里不在 Eurostat 的 NUTS 统计区划内(英国脱欧后不再列入,乌克兰、白俄罗斯等不属于 NUTS 体系),所以本图没有它的产出与透镜数据,只按海拔和纬度粗画了地形。</p>
    <p class="note">${esc(terrainText(i))}</p>`;
  panel.hidden = false; draw();
}
function flyToCity(c) { if (!c) return; view.cx = c.x; view.cy = c.y; view.s = Math.max(view.s, 0.9); clampView(); draw(); }

// ---------- 顶栏 ----------
function renderTopbar() {
  const n = meta.nation;
  $("#yields").innerHTML = `<span class="yield" title="NUTS 覆盖范围内的常住人口合计">👥 <b>${fmtPop(n.pop)}</b></span>` +
    meta.yields.map((y) => `<span class="yield" title="${esc(y.label)}:${esc(y.desc)}">${y.icon} <b>${y.key === "gold" ? fmtEur(n.yields[y.key]) : fmtPeople(n.yields[y.key]) + "人"}</b></span>`).join("");
}

// ---------- 搜索 ----------
const index = [
  ...cities.map((c) => ({ t: "city", id: c.id, name: c.name, en: c.name_en || "", sub: countryName(c.cntr) + " · 城市", pop: c.pop })),
  ...regions.r3.map((r, k) => ({ t: "r3", k, name: r.name, en: r.id, sub: countryName(r.cntr) + " · NUTS3", pop: (r.pop || 0) / 10 })),
  ...regions.r2.map((r, k) => ({ t: "r2", k, name: r.name, en: r.id, sub: countryName(r.cntr) + " · NUTS2", pop: 0 })),
];
const sr = $("#search-results"), si = $("#search");
let hits = [], hi = 0;
si.addEventListener("input", () => {
  const q = si.value.trim().toLowerCase();
  if (!q) { sr.hidden = true; return; }
  hits = index.filter((x) => x.name.toLowerCase().includes(q) || x.en.toLowerCase().includes(q)).sort((a, b) => b.pop - a.pop).slice(0, 12);
  hi = 0; renderHits();
});
function renderHits() {
  sr.innerHTML = hits.length ? hits.map((x, k) => `<div class="${k === hi ? "on" : ""}" data-k="${k}"><span>${esc(x.name)}</span><small>${esc(x.sub)}</small></div>`).join("") : `<div><small>没有匹配</small></div>`;
  sr.hidden = false;
}
function pick(x) {
  sr.hidden = true; si.value = ""; si.blur();
  if (!x) return;
  if (x.t === "city") { const c = cityById.get(x.id); flyToCity(c); openCity(c.id); return; }
  const lvl = x.t; const cells = []; for (let i = 0; i < C.water.length; i++) if (C[lvl][i] === x.k) cells.push(i);
  if (cells.length) { const pts = cells.map((i) => H.center(i)); view.cx = pts.reduce((s, p) => s + p[0], 0) / pts.length; view.cy = pts.reduce((s, p) => s + p[1], 0) / pts.length; view.s = Math.max(view.s, lvl === "r3" ? 1.2 : 0.7); clampView(); }
  openRegion(lvl, x.k);
}
si.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { hi = Math.min(hits.length - 1, hi + 1); renderHits(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { hi = Math.max(0, hi - 1); renderHits(); e.preventDefault(); }
  else if (e.key === "Enter") pick(hits[hi]);
});
sr.addEventListener("click", (e) => { const d = e.target.closest("[data-k]"); if (d) pick(hits[+d.dataset.k]); });
si.addEventListener("blur", () => setTimeout(() => (sr.hidden = true), 150));

// ---------- 百科 ----------
const PAGES = {
  about: ["关于本图", () => `<h2>欧罗巴:把真实欧洲画成策略游戏地图</h2>
    <p>这张图把欧洲 ${regions.r3.length} 个 NUTS3 统计地区的公开数据,画到一张约 ${nf.format(C.water.filter((w) => w === 0).length)} 格陆地的六边形地图上(格心距约 ${Math.round(H.w)} 公里),用 4X 策略游戏的语言重新讲一遍:GDP 是金币,行业就业是粮食、生产力、科技与文化,城市按真实产业结构获得区域,世界遗产是奇观。</p>
    <p>灵感来自 Andrej Karpathy 2026 年 11 月让 Claude 用美国公开数据做的 <a href="https://karpathy.ai/usaciv/" target="_blank" rel="noopener">usaciv</a>。本图是独立重写的欧洲版,数据管线与网页都由 Claude Code 生成,未复用其代码。</p>
    <p><b>做法</b>:① 下载 Eurostat、GISCO、NOAA、Natural Earth、维基数据;② 用兰伯特等积投影建六边形网格,每格按采样点归属到国家/大区/地区;③ 每一条「游戏化」判定都是写死的规则(见各页),比例类地貌按地区真实比例分配;④ 静态网页直接读 JSON 绘制。</p>
    <p><b>不是</b>官方统计产品,也与任何游戏公司无关。数字已尽量注明年份与出处;估算值标「估」。</p>`],
  yields: ["产出", () => `<h2>产出</h2><table><tr><th>产出</th><th>含义与来源</th></tr>${meta.yields.map((y) => `<tr><td>${y.icon} ${esc(y.label)}<br><small>${esc(y.unit)}</small></td><td>${esc(y.desc)}</td></tr>`).join("")}</table>
    <p class="note">城市的产出是它所在 NUTS3 地区的合计。像巴黎(FR101)这样地区 = 城市的,两者一致;像马德里(ES300 = 整个马德里自治区)这样地区更大的,产出也更大。</p>`],
  districts: ["区域", () => `<h2>区域</h2><p>区位商 = 本地该行业就业占比 ÷ 全图平均占比;1 表示与欧洲平均相同。</p><table><tr><th>区域</th><th>判定规则</th><th>城市数</th></tr>${meta.districts.map((d) => `<tr><td>${d.icon} ${esc(d.label)}</td><td>${esc(d.rule)}</td><td>${cities.filter((c) => c.districts.some((x) => x.key === d.key)).length}</td></tr>`).join("")}</table>`],
  terrain: ["地形", () => { const T = world.tables; const tb = (arr) => arr.filter((t) => t.rule).map((t) => `<tr><td>${t.color ? `<span class="sw" style="background:${t.color}"></span>` : ""}${esc(t.name)}</td><td>${esc(t.rule)}</td></tr>`).join(""); return `<h2>地形</h2><table><tr><th>水陆</th><th>规则</th></tr>${tb(T.water)}</table><br><table><tr><th>底色</th><th>规则</th></tr>${tb(T.terrain)}</table><br><table><tr><th>起伏</th><th>规则</th></tr>${tb(T.relief)}</table><br><table><tr><th>地貌</th><th>规则</th></tr>${tb(T.feature)}</table>
    <p class="note">「按比例分配」:在每个 NUTS2 大区内,用确定性的平滑噪声给格子排序,取前 k 格,k = 该大区该类土地占比 × 格数。所以大区整体比例与 LUCAS 调查一致,但具体哪一格是森林是示意,不是卫星判读。</p>`; }],
  wonders: ["奇观与资源", () => `<h2>奇观与资源</h2>
    <p>🏛️/🏞️ <b>奇观</b> = 联合国教科文组织世界遗产(维基数据「遗产级别 P1435 = 世界遗产」),共 ${places.wonders.length} 处;多地点的系列遗产取第一个组成部分的位置。自然/文化之分按名称关键词(公园、森林、山、湖、海岸、洞穴等)粗分,可能有误。</p>
    <p>☢️ <b>核电站</b>、💧 <b>水电站(≥ 300 MW)</b> 来自维基数据。排除了运行状态标为退役、关闭、停运、在建、规划的条目,以及带关闭日期或解散日期的条目;多数电站在维基数据里没有运行状态字段,所以本图只能保证它们「未被标为关闭」,不能保证都在运行。共 ${places.resources.length} 处。维基数据的装机与状态并不完整,仅作示意。</p>`],
  lenses: ["透镜", () => `<h2>透镜</h2><table><tr><th>透镜</th><th>层级</th><th>含义与来源</th></tr>${meta.lenses.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.level === "r3" ? "NUTS3" : l.level === "r2" ? "NUTS2" : "每格"}</td><td>${esc(l.desc)}</td></tr>`).join("")}</table><p class="note">配色区间取有数据格子的 2%–98% 分位,极端值被压到两端。</p>`],
  sources: ["数据源", () => `<h2>数据源</h2><table><tr><th>数据</th><th>用途</th><th>许可</th></tr>${sources.map((s) => `<tr><td><a href="${esc(s.homepage)}" target="_blank" rel="noopener">${esc(s.title)}</a><br><small>${esc(s.publisher)}</small></td><td>${esc(s.used_for)}</td><td>${esc(s.license)}</td></tr>`).join("")}</table>
    <p class="note">行政边界 © EuroGeographics for the administrative boundaries。统计数据来源:Eurostat,经本项目加工(选年份、估算细分行业、映射为游戏术语);加工后的数据与 Eurostat 无关,Eurostat 不对其承担责任。</p>`],
  coverage: ["覆盖与缺口", () => { const fogC = world.countries.filter((c) => !c.nuts).map((c) => c.name); return `<h2>覆盖与缺口</h2>
    <p><b>有数据</b>:${world.countries.filter((c) => c.nuts).map((c) => esc(c.name)).join("、")}。</p>
    <p><b>迷雾(无数据,只画地形)</b>:${fogC.map(esc).join("、")}。英国脱欧后不在 NUTS 2024 中;乌克兰、白俄罗斯、俄罗斯等不属于 NUTS 体系。</p>
    <p><b>未画入</b>(远离欧洲大陆的地区):${world.skipped.map((s) => esc(s.name) + `(${s.id})`).join("、")}。</p>
    <p><b>小岛补救</b>:${world.rescued.length} 个面积不小却没分到格子的岛屿地区,各补了一格:${world.rescued.join("、")}。</p>
    <p><b>细分行业估算</b>:不少国家的 NUTS3 只报到「批发零售运输餐旅信息(G–J)」「金融地产专业服务(K–N)」「公共及其他服务(O–U)」等大类。信息通信、金融、专业服务、艺术娱乐缺报时,按「本地区父类就业 × 本国已报告地区的子类占比」估算,面板上标「估」。区位商的全图基准只用实报值;依赖细分行业的区域(学院的就业条件、商业中心、剧院广场)遇到估算值不判定。</p>
    <p><b>年份不一</b>:每个地区取各数据集里自己最新的年份,面板上逐项注明。</p>`; }],
  help: ["操作", () => `<h2>操作</h2><table>
    <tr><td>拖动 / <span class="kbd">WASD</span> / 方向键</td><td>平移</td></tr><tr><td>滚轮 / 双指 / <span class="kbd">+</span> <span class="kbd">-</span></td><td>缩放</td></tr>
    <tr><td>点击城市旗标</td><td>城市面板:辖区产出、区域与理由、就业结构</td></tr><tr><td>点击格子</td><td>所在 NUTS3 地区面板</td></tr>
    <tr><td><span class="kbd">/</span></td><td>搜索城市或地区</td></tr><tr><td>左下「透镜」</td><td>换成专题着色</td></tr><tr><td><span class="kbd">Esc</span></td><td>关闭面板</td></tr></table>`],
};
function openModal(page = "about") {
  $("#modal-nav").innerHTML = Object.entries(PAGES).map(([k, [n]]) => `<button data-p="${k}" class="${k === page ? "on" : ""}">${n}</button>`).join("");
  $("#modal-body").innerHTML = PAGES[page][1]();
  $("#modal").hidden = false;
}
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal") || e.target.closest("[data-close]")) $("#modal").hidden = true;
  const b = e.target.closest("[data-p]"); if (b) openModal(b.dataset.p);
});
$("#btn-pedia").onclick = () => openModal("about");
$("#btn-help").onclick = () => openModal("help");

// ---------- 分享与地址栏 ----------
let hashTimer = 0;
function syncHashSoon() { clearTimeout(hashTimer); hashTimer = setTimeout(syncHash, 300); }
function syncHash() {
  const p = new URLSearchParams();
  p.set("v", `${Math.round(view.cx)},${Math.round(view.cy)},${view.s.toFixed(3)}`);
  if (state.lens) p.set("lens", state.lens);
  if (state.selCity) p.set("city", state.selCity);
  else if (state.selRegion) p.set("region", (state.selRegion.level === "r3" ? regions.r3 : regions.r2)[state.selRegion.index].id);
  history.replaceState(null, "", "#" + p.toString());
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const v = p.get("v")?.split(",").map(Number);
  if (v?.length === 3 && v.every(isFinite)) { view.cx = v[0]; view.cy = v[1]; view.s = v[2]; clampView(); }
  if (p.get("lens")) setLens(p.get("lens"));
  if (p.get("pedia") && PAGES[p.get("pedia")]) openModal(p.get("pedia")); // 可直接分享百科某页
  if (p.get("city") && cityById.has(p.get("city"))) openCity(p.get("city"));
  else if (p.get("region")) { const id = p.get("region"); const k3 = regions.r3.findIndex((r) => r.id === id); if (k3 >= 0) openRegion("r3", k3); else { const k2 = regions.r2.findIndex((r) => r.id === id); if (k2 >= 0) openRegion("r2", k2); } }
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2200); }
$("#btn-share").onclick = async () => {
  syncHash();
  try { await navigator.clipboard.writeText(location.href); toast("链接已复制"); } catch { toast("复制失败,请手动复制地址栏"); }
  canvas.toBlob((b) => { if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "欧罗巴策略地图.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
};

// ---------- 启动 ----------
buildLensDock();
// 手机:透镜栏默认收起,点标题展开;城市/地区面板打开时隐藏透镜栏(由 CSS 的 body.panel-open 控制)
if (matchMedia("(max-width: 720px)").matches) $("#lens-dock").classList.add("collapsed");
$("#lens-dock .dock-title").addEventListener("click", () => $("#lens-dock").classList.toggle("collapsed"));
new MutationObserver(() => document.body.classList.toggle("panel-open", !panel.hidden)).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
renderTopbar();
readHash();
draw();
$("#loading").remove();
window.__eurociv = { view, state, draw, setLens, openCity }; // 调试用
