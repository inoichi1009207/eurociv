// 诊断:查几座大城市在维基数据里的 P31 类型与人口,找出被漏掉的原因。只读。
const q = `SELECT ?item ?itemLabel ?type ?typeLabel ?pop ?sl WHERE {
  VALUES ?item { wd:Q406 wd:Q220 wd:Q2807 wd:Q8717 wd:Q1489 wd:Q597 wd:Q1524 wd:Q1781 wd:Q84 }
  ?item wdt:P31 ?type . OPTIONAL { ?item wdt:P1082 ?pop . } ?item wikibase:sitelinks ?sl .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { headers: { Accept: "application/sparql-results+json", "User-Agent": "eurociv-builder/0.1" }, signal: AbortSignal.timeout(60000) });
const j = await r.json();
const by = new Map();
for (const b of j.results.bindings) {
  const k = b.itemLabel.value;
  const o = by.get(k) || { types: new Set(), pop: 0, sl: b.sl.value };
  o.types.add(b.type.value.split("/").pop() + ":" + b.typeLabel.value);
  if (b.pop) o.pop = Math.max(o.pop, +b.pop.value);
  by.set(k, o);
}
for (const [k, o] of by) console.log(k, o.pop, "sl=" + o.sl, [...o.types].join(", "));
