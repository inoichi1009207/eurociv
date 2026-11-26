// 解析 Eurostat JSON-stat 2.0:展开成 [{dim1:code, dim2:code, ..., value}]。
export function flatten(js) {
  const ids = js.id, sizes = js.size;
  const codesBy = ids.map((d) => {
    const idx = js.dimension[d].category.index;
    const arr = [];
    for (const [c, k] of Object.entries(idx)) arr[k] = c;
    return arr;
  });
  const out = [];
  for (const [kStr, value] of Object.entries(js.value)) {
    if (value === null) continue;
    let k = +kStr;
    const row = { value };
    for (let d = ids.length - 1; d >= 0; d--) {
      row[ids[d]] = codesBy[d][k % sizes[d]];
      k = Math.floor(k / sizes[d]);
    }
    out.push(row);
  }
  return out;
}

export function labelsOf(js, dim) {
  return js.dimension[dim]?.category?.label || {};
}

// 对满足 filter 的行,每个 geo 取最新一年的值 → Map(geo → {value, year})
export function latestByGeo(rows, filter = () => true) {
  const m = new Map();
  for (const r of rows) {
    if (!filter(r)) continue;
    const y = +r.time;
    const cur = m.get(r.geo);
    if (!cur || y > cur.year) m.set(r.geo, { value: r.value, year: y });
  }
  return m;
}

// 同一年份对齐:先求「覆盖最多 geo 的最新年份」,再取该年;缺该年的 geo 退回自身最新年并记下
export function commonYear(rows, filter = () => true) {
  const cnt = new Map();
  for (const r of rows) if (filter(r)) cnt.set(r.time, (cnt.get(r.time) || 0) + 1);
  const best = Math.max(...cnt.values());
  // 取覆盖率 ≥ 最佳覆盖 90% 的最新年份
  const years = [...cnt.entries()].filter(([, c]) => c >= best * 0.9).map(([y]) => +y);
  return Math.max(...years);
}
