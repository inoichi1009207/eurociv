# 数据源清单

「实测」= 欧洲版管线真正下载并用过;「候选」= 未在本项目中实测,用前先跑一次可达性探测与样本下载,并读一遍许可页。

## 欧洲(实测)

| 用途 | 数据 | 接口 |
|---|---|---|
| 统计区边界 | GISCO NUTS 2024,1:2000 万,GeoJSON | `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2024_4326_LEVL_{0,2,3}.geojson` |
| 人口 / 面积 | Eurostat `demo_r_pjanaggr3` / `demo_r_d3area` | `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<代码>?format=JSON&...` |
| GDP | `nama_10r_3gdp`(NUTS3)、`nama_10r_2gdp`(NUTS2) | 同上,`unit=MIO_EUR` / `PPS_HAB_EU27_2020` |
| 分行业就业 | `nama_10r_3empers`(`wstatus=EMP`) | 同上 |
| 研发 / 旅游 / 失业 / 高教 | `rd_e_gerdreg`、`tour_occ_nin2`、`lfst_r_lfu3rt`、`edat_lfse_04` | 同上(NUTS2) |
| 土地覆盖 | `lan_lcv_ovw`(LUCAS,NUTS2,%) | 同上 |

## 全球通用(实测)

| 用途 | 数据 | 接口 |
|---|---|---|
| 海拔 / 海深 | NOAA ETOPO1(经 OpenTopoData) | `https://api.opentopodata.org/v1/etopo1?locations=...` |
| 国家轮廓、湖、河、冰川 | Natural Earth 1:5000 万 | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_*.geojson` |
| 城市、世界遗产、电站、中文名 | 维基数据 SPARQL | `https://query.wikidata.org/sparql` |

## 其他地区(候选,未实测)

| 地区 | 统计单元 | 可能的数据源 |
|---|---|---|
| 美国 | 县 / 都市区 | Census ACS、BEA 地区 GDP、BLS QCEW(usaciv 用的就是这些) |
| 日本 | 都道府县 / 市区町村 | e-Stat(需免费注册 API key)、国土数値情報 |
| 英国 | ITL3 | ONS 地区 GDP 与就业;边界在 ONS Open Geography Portal |
| 全球粗粒度 | 国家 / 一级行政区 | World Bank 开放数据、geoBoundaries(边界) |

换地区时最难的通常是「带分行业就业的最细一级」:先确认它存在,再选格子大小。
