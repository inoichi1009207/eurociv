// 诊断:农业(作物、牲畜)与矿山数据的维度与样本。只读。
const ES = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";
for (const [ds, q] of [["apro_cpshr", "geo=FRI1&time=2023"], ["agr_r_animal", "geo=FRI1&time=2023"]]) {
  try {
    const j = await (await fetch(`${ES}${ds}?format=JSON&lang=EN&${q}`, { signal: AbortSignal.timeout(20000) })).json();
    console.log("==", ds, j.error ? JSON.stringify(j.error).slice(0, 200) : "");
    if (j.id) for (const d of j.id) { const cat = j.dimension[d].category; const ks = Object.keys(cat.index); console.log("  ", d, ks.length, ks.slice(0, 30).map((k) => `${k}=${(cat.label[k] || "").slice(0, 22)}`).join(" | ")); }
  } catch (e) { console.log(ds, "ERR", e.message); }
}
const q = `SELECT ?type ?typeLabel (COUNT(?item) AS ?n) WHERE {
  VALUES ?type { wd:Q820477 wd:Q959309 wd:Q2071298 wd:Q1032349 wd:Q12719 wd:Q211748 wd:Q1061151 }
  ?item wdt:P31 ?type ; wdt:P625 ?c . BIND(geof:longitude(?c) AS ?lon) BIND(geof:latitude(?c) AS ?lat)
  FILTER(?lon > -25 && ?lon < 45 && ?lat > 34 && ?lat < 72)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?type ?typeLabel`;
try {
  const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { headers: { Accept: "application/sparql-results+json", "User-Agent": "eurociv-builder/0.1" }, signal: AbortSignal.timeout(60000) });
  for (const b of (await r.json()).results.bindings) console.log("wd", b.type.value.split("/").pop(), b.typeLabel.value, b.n.value);
} catch (e) { console.log("wd ERR", e.message); }
