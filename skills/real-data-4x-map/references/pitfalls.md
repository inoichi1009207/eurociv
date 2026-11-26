# 踩过的坑与绕法(欧洲版实测)

## 网络

- **NOAA ERDDAP(coastwatch / upwell)、AWS 上的地形瓦片、Open-Meteo**:在部分网络环境下直连超时。
  绕法:OpenTopoData 公共 API `https://api.opentopodata.org/v1/etopo1?locations=lat,lon|...`,
  每次 ≤100 点、每秒 1 次、每天 1000 次。采样点要省:陆地格 4 点、迷雾格 1 点、近岸 4 格内水格 1 点,欧洲全图约 500 次调用。
  脚本必须**逐批写缓存、可续跑**,超额就分天跑。
- **探测要并发、短超时**:先用一个小脚本同时请求所有候选主机(8 秒超时),一次看清哪些可达,别一个个试。
- curl 与 Node `fetch` 的可达性可能不同(代理、沙箱);以实际要用的那个客户端为准。

## 维基数据(query.wikidata.org)

- 并发 3 个查询就会 429;改串行、间隔 3 秒。
- `SERVICE wikibase:box` 框一大片地理范围会先枚举范围内所有带坐标条目,极易超时。
  改为「先按类型(P31)和人口(P1082)筛出小集合,再用 `geof:longitude/latitude` 过滤」。
- 多语言标签用 `SERVICE wikibase:label { bd:serviceParam wikibase:language "zh-cn,zh-hans,zh" }`;
  没有中文标签时返回 Q 号,要判掉。
- 城市类型很杂:马德里只挂「西班牙市镇」、里斯本只挂「葡萄牙城市」、布达佩斯只挂「匈牙利市镇」;只用通用的 city 类会漏首都。
- 同一城市多个条目(「Madrid city」「Metropolis of Lyon」「Katowice urban area」):按距离去重时保留**维基链接数**最多的那个。
- 首都:用 P1376(首都所属)指向的条目等于该城市的 P17(国家)来判;荷兰等「王国 vs 国家」双条目会判不出,需人工补。

## 边界与统计

- **NUTS 版本**:2024 版与 2021 版代码不同。下载边界前先看统计数据用的是哪一版的代码(打印匹配率)。
- **区外项**:Eurostat 的 GDP 国家合计包含 `XXZZZ`(区外,如北海大陆架),对账时要加进去,否则丹麦、挪威会差 1% 以上。
- **简化边界的缝**:1:2000 万边界里梵蒂冈是个洞、博斯普鲁斯海峡把伊斯坦布尔坐标甩到水里;罗马、伊斯坦布尔会因此「不在任何地区」而被丢掉。
  点查落空时按 3/6/10/15 km 环状向外搜。
- **NUTS3 分行业就业**:许多国家只报到 G–J、K–N、O–U 大类,J、K、M_N、R–U 缺失。先打印各行业的缺失率再决定怎么估。
- **年份**:同一数据集里不同地区最新年份不同;取各自最新并逐项标注,比「强行对齐到某一年」丢的数据少。

## 许可

- GISCO 的 NUTS 边界:非商业用途免费,须署名「© EuroGeographics for the administrative boundaries」;商用需另与 EuroGeographics 谈。
- Eurostat 统计:CC BY 4.0,注明来源与改动即可(EU/EFTA/候选国以外的数据另有限制)。
- Natural Earth:公有领域。维基数据:CC0。ETOPO1:美国政府作品。
- 游戏名称是注册商标:标题与介绍里写「4X 策略游戏风格」,不要写游戏名;不用游戏美术。
