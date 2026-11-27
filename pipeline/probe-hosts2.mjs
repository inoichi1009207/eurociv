// 诊断:v0.2 候选数据源是否可达(HEAD/小范围 GET,8 秒超时)。只读。
const urls = [
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson",
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson",
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_airports.geojson",
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_ports.geojson",
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_urban_areas.geojson",
  "https://data.open-power-system-data.org/conventional_power_plants/latest/conventional_power_plants_EU.csv",
  "https://raw.githubusercontent.com/PyPSA/powerplantmatching/master/powerplants.csv",
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/avia_paoa?format=JSON&lang=EN&unit=PAS&tra_meas=PAS_CRD&time=2024&rep_airp=DE_EDDF",
];
await Promise.all(urls.map(async (u) => {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { method: "GET", headers: { Range: "bytes=0-300", "User-Agent": "eurociv-builder/0.1" }, signal: AbortSignal.timeout(8000) });
    const len = r.headers.get("content-range") || r.headers.get("content-length");
    const head = (await r.text()).slice(0, 160).replace(/\s+/g, " ");
    console.log(r.status, ((Date.now() - t0) / 1000).toFixed(1) + "s", len, u.split("/").slice(-1)[0].slice(0, 60), "|", head);
  } catch (e) { console.log("ERR", u.split("/").slice(-1)[0].slice(0, 60), e.cause?.code || e.message); }
}));
