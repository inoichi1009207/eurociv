// 诊断:哪些数据主机从本机可达(并发,每个 8 秒超时)。
const hosts = [
  "https://download.geonames.org/export/dump/readme.txt",
  "https://whc.unesco.org/en/list/xml/",
  "https://www.gebco.net/",
  "https://naciscdn.org/naturalearth/packages/",
  "https://cdn.jsdelivr.net/npm/world-atlas@2/package.json",
  "https://api.opentopodata.org/v1/etopo1?locations=46.5,8",
  "https://zenodo.org/",
  "https://www.ncei.noaa.gov/",
  "https://query.wikidata.org/",
  "https://ec.europa.eu/eurostat/",
  "https://gisco-services.ec.europa.eu/distribution/v2/",
  "https://dumps.wikimedia.org/",
  "https://unpkg.com/",
  "https://tiles.mapterhorn.com/",
  "https://copernicus-dem-90m.s3.amazonaws.com/readme.html",
  "https://prd-tnm.s3.amazonaws.com/",
  "https://raw.githubusercontent.com/",
  "https://github.com/",
  "https://objects.githubusercontent.com/",
];
await Promise.all(hosts.map(async (u) => {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "eurociv-builder/0.1" } });
    console.log(r.status, ((Date.now() - t0) / 1000).toFixed(1) + "s", u);
  } catch (e) {
    console.log("ERR", ((Date.now() - t0) / 1000).toFixed(1) + "s", u, e.cause?.code || e.message);
  }
}));
