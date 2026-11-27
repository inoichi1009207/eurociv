// 数据源登记表:每个源 = 中文名 + 发布方 + 主页 + 许可 + 用途 + 要下载的文件。
// 这张表同时被 build 写进 site/data/sources.json,供网页「百科」页逐条展示出处。
const ES = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";
const es = (ds, q) => ({ url: `${ES}${ds}?format=JSON&lang=EN&${q}`, file: `eurostat/${ds}.json` });

// 地图范围(经纬度):冰岛 → 土耳其东部,塞浦路斯 → 北角
export const BBOX = { west: -25, south: 34, east: 45, north: 72 };

const WDQS = "https://query.wikidata.org/sparql?format=json&query=";
// 先按类型筛出小集合,再按经纬度过滤(比 wikibase:box 快得多,不易超时)
const box = (v) => `${v} wdt:P625 ?coord . BIND(geof:longitude(?coord) AS ?lon) BIND(geof:latitude(?coord) AS ?lat)
   FILTER(?lon >= ${BBOX.west} && ?lon <= ${BBOX.east} && ?lat >= ${BBOX.south} && ?lat <= ${BBOX.north})`;
// 中文名:标签服务按 zh-cn → zh-hans → zh 回退(都没有时返回 Q 号);英文名另取
const labels = (v, name) =>
  `OPTIONAL { ${v} rdfs:label ?${name}_en FILTER(LANG(?${name}_en) = "en") }
   SERVICE wikibase:label { bd:serviceParam wikibase:language "zh-cn,zh-hans,zh" . ${v} rdfs:label ?${name}_zh . }`;
const wd = (file, q) => ({
  url: WDQS + encodeURIComponent(q),
  file: `wikidata/${file}.json`,
  headers: { Accept: "application/sparql-results+json" },
  timeoutMs: 120000,
});

export const SOURCES = [
  {
    id: "natural_earth_10m", group: "geo2",
    title: "Natural Earth 1:1000 万 公路、铁路、机场、港口",
    publisher: "Natural Earth", homepage: "https://www.naturalearthdata.com/",
    license: "公有领域",
    used_for: "地图上的公路、铁路线,机场与港口图标",
    files: ["ne_10m_roads", "ne_10m_railroads", "ne_10m_airports", "ne_10m_ports"].map((n) => ({
      url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${n}.geojson`,
      file: `ne/${n}.geojson`, timeoutMs: 600000,
    })),
  },
  {
    id: "powerplantmatching", group: "power",
    title: "欧洲电厂库 powerplantmatching(按燃料分类:核电、煤电、燃气、水电、风电、光伏等)",
    publisher: "PyPSA / powerplantmatching", homepage: "https://github.com/PyPSA/powerplantmatching",
    license: "由多个开放电厂库合并而成,使用时注明来源",
    used_for: "地图上的电厂图标(核电、火电、水电、风电、光伏)",
    files: [{ url: "https://raw.githubusercontent.com/PyPSA/powerplantmatching/master/powerplants.csv", file: "power/powerplants.csv", timeoutMs: 600000 }],
  },
  {
    id: "gisco_nuts", group: "geo",
    title: "NUTS 2024 行政统计区边界(1:2000 万)",
    publisher: "欧盟统计局 GISCO", homepage: "https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/territorial-units-statistics",
    license: "© EuroGeographics(行政边界);按 GISCO 页面所列条款使用并署名",
    used_for: "国家/大区(NUTS2)/地区(NUTS3)归属:每个六边形中心落在哪个 NUTS3 多边形里",
    files: [0, 2, 3].map((l) => ({
      url: `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2024_4326_LEVL_${l}.geojson`,
      file: `gisco/nuts2024_l${l}.geojson`,
    })),
  },
  {
    id: "natural_earth", group: "geo",
    title: "Natural Earth 1:5000 万 国家、湖泊、河流",
    publisher: "Natural Earth", homepage: "https://www.naturalearthdata.com/",
    license: "公有领域",
    used_for: "NUTS 覆盖之外的陆地(英国、乌克兰等,显示为「迷雾」)、国家中文名、湖泊、河流线、冰川(雪地)",
    files: ["ne_50m_admin_0_countries", "ne_50m_lakes", "ne_50m_rivers_lake_centerlines", "ne_50m_glaciated_areas"].map((n) => ({
      url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${n}.geojson`,
      file: `ne/${n}.geojson`,
    })),
  },
  {
    id: "etopo", group: "elev",
    title: "ETOPO1 全球地形与海深(经 OpenTopoData 公共 API 按格采样)",
    publisher: "美国国家海洋和大气管理局 NOAA NCEI;OpenTopoData 提供接口", homepage: "https://www.opentopodata.org/datasets/etopo1/",
    license: "ETOPO1 为美国政府作品,公有领域",
    used_for: "海拔、起伏(丘陵/山地)、浅海与深海。采样由 pipeline/elev.mjs 完成:陆地格 4 点、迷雾格 1 点、近岸水格 1 点",
    files: [],
  },
  {
    id: "eurostat", group: "stat",
    title: "欧盟统计局地区统计(NUTS2 / NUTS3)",
    publisher: "欧盟统计局 Eurostat", homepage: "https://ec.europa.eu/eurostat/web/regions",
    license: "CC BY 4.0(欧盟委员会再利用政策 2011/833/EU):须注明来源;本图对数据做了加工(选年份、估算细分行业、映射为游戏术语),Eurostat 对加工后的数据不承担责任",
    used_for: "人口、面积、GDP、分行业就业、研发、旅游、失业、高等教育、林地",
    files: [
      es("nama_10r_3gdp", "unit=MIO_EUR&unit=PPS_HAB_EU27_2020&sinceTimePeriod=2018"),
      es("nama_10r_2gdp", "unit=PPS_HAB_EU27_2020&unit=MIO_EUR&sinceTimePeriod=2018"),
      es("nama_10r_3empers", "wstatus=EMP&sinceTimePeriod=2018"),
      es("demo_r_pjanaggr3", "sex=T&age=TOTAL&sinceTimePeriod=2020"),
      es("demo_r_d3area", "landuse=TOTAL&sinceTimePeriod=2015"),
      es("rd_e_gerdreg", "sectperf=TOTAL&unit=MIO_EUR&unit=PC_GDP&sinceTimePeriod=2017"),
      es("tour_occ_nin2", "c_resid=TOTAL&nace_r2=I551-I553&unit=NR&unit=P_THAB&sinceTimePeriod=2019"),
      es("lfst_r_lfu3rt", "sex=T&age=Y15-74&isced11=TOTAL&sinceTimePeriod=2019"),
      es("edat_lfse_04", "sex=T&age=Y25-64&isced11=ED5-8&sinceTimePeriod=2019"),
      es("apro_cpshr", "strucpro=HPRD_HUMD_EU_THS_T&" + ["C1110", "C1500", "C1300", "W1000", "O1000", "R1000", "R2000", "I1110"].map((c) => "crops=" + c).join("&") + "&sinceTimePeriod=2019"),
      { ...es("apro_cpshr", "strucpro=AR_THS_HA&crops=W1000&crops=O1000&sinceTimePeriod=2019"), file: "eurostat/apro_cpshr_perm.json" }, // 葡萄、橄榄只报面积
      es("lan_lcv_ovw", "unit=PC&" + ["A00", "B00", "C00", "D00", "E00", "F00", "G00", "H00"].map((c) => "landcover=" + c).join("&") + "&time=2018&time=2022"),
    ],
  },
  {
    id: "wikidata", group: "wd",
    title: "维基数据:城市、世界遗产、核电站与大型水电站",
    publisher: "Wikidata(维基媒体基金会)", homepage: "https://www.wikidata.org/",
    license: "CC0(公有领域)",
    used_for: "城市位置与人口、中文名;世界遗产 → 奇观;核电站/水电站 → 战略资源",
    files: [
      // 类型:通用「城市」类 + 各国常见的城市级行政单位(马德里、里斯本、布达佩斯只挂了本国的市镇类型)
      wd("cities", `SELECT ?item ?coord ?pop ?rank ?date ?country ?capital ?sl ?n_zh ?n_en WHERE {
        VALUES ?type { wd:Q515 wd:Q1549591 wd:Q5119 wd:Q1637706 wd:Q200250 wd:Q22865 wd:Q174844 wd:Q2264924 wd:Q108178728
          wd:Q2074737 wd:Q15647906 wd:Q13218690 wd:Q747074 wd:Q2716259 wd:Q484170 wd:Q42744322 wd:Q2039348 wd:Q493522 wd:Q925381 }
        ?item wdt:P31 ?type .
        ?item p:P1082 ?st . ?st ps:P1082 ?pop ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank && ?pop >= 50000)
        OPTIONAL { ?st pq:P585 ?date . }
        ?item wikibase:sitelinks ?sl .
        ${box("?item")}
        OPTIONAL { ?item wdt:P17 ?country . }
        OPTIONAL { ?item wdt:P1376 ?capital . }
        ${labels("?item", "n")}
      }`),
      wd("whs", `SELECT ?item ?coord ?whsid ?crit ?sl ?n_zh ?n_en WHERE {
        ?item wdt:P1435 wd:Q9259 .
        ?item wikibase:sitelinks ?sl .
        ${box("?item")}
        OPTIONAL { ?item wdt:P757 ?whsid . }
        OPTIONAL { ?item wdt:P2614 ?crit . }
        ${labels("?item", "n")}
      }`),
      wd("mines", `SELECT ?item ?coord ?kind ?product ?productLabel ?sl ?end ?n_zh ?n_en WHERE {
        VALUES ?kind { wd:Q820477 wd:Q959309 wd:Q211748 }
        ?item wdt:P31 ?kind . ?item wikibase:sitelinks ?sl .
        ${box("?item")}
        OPTIONAL { ?item wdt:P1056 ?product . ?product rdfs:label ?productLabel FILTER(LANG(?productLabel) = "en") }
        OPTIONAL { ?item wdt:P576 ?end . }
        ${labels("?item", "n")}
      }`),
      wd("power", `SELECT ?item ?coord ?kind ?watts ?use ?end ?closed ?badType ?n_zh ?n_en WHERE {
        VALUES ?kind { wd:Q134447 wd:Q15911738 }
        ?item wdt:P31 ?kind .
        ${box("?item")}
        OPTIONAL { ?item p:P2109/psn:P2109/wikibase:quantityAmount ?watts . }
        OPTIONAL { ?item wdt:P576 ?end . }
        OPTIONAL { ?item wdt:P3999 ?closed . }
        OPTIONAL { ?item wdt:P31 ?badType . FILTER(?badType IN (wd:Q811683, wd:Q12377751, wd:Q11639308, wd:Q170584, wd:Q2112558, wd:Q30108381, wd:Q63065035, wd:Q104664889, wd:Q56651571)) } # 装机,归一化为瓦(避免 kW/MW 单位混用)
        OPTIONAL { ?item wdt:P5817 ?use . }
        ${labels("?item", "n")}
      }`),
    ],
  },
];
