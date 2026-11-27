// 「游戏语言」规则表:产出、区域、地形、透镜的中文名、颜色与判定规则。
// 改这里就能改全图的映射;每条 rule 文本都会出现在网页「百科」里。

export const COUNTRY_ZH = {
  AL: "阿尔巴尼亚", AT: "奥地利", BA: "波黑", BE: "比利时", BG: "保加利亚", CH: "瑞士", CY: "塞浦路斯", CZ: "捷克",
  DE: "德国", DK: "丹麦", EE: "爱沙尼亚", EL: "希腊", ES: "西班牙", FI: "芬兰", FR: "法国", HR: "克罗地亚", HU: "匈牙利",
  IE: "爱尔兰", IS: "冰岛", IT: "意大利", LI: "列支敦士登", LT: "立陶宛", LU: "卢森堡", LV: "拉脱维亚", ME: "黑山",
  MK: "北马其顿", MT: "马耳他", NL: "荷兰", NO: "挪威", PL: "波兰", PT: "葡萄牙", RO: "罗马尼亚", RS: "塞尔维亚",
  SE: "瑞典", SI: "斯洛文尼亚", SK: "斯洛伐克", TR: "土耳其", XK: "科索沃", UK: "英国", UA: "乌克兰", BY: "白俄罗斯",
  MD: "摩尔多瓦", RU: "俄罗斯", GE: "格鲁吉亚", AM: "亚美尼亚", AZ: "阿塞拜疆", KZ: "哈萨克斯坦", GL: "格陵兰",
  MA: "摩洛哥", DZ: "阿尔及利亚", TN: "突尼斯", SY: "叙利亚", IQ: "伊拉克", IR: "伊朗", LB: "黎巴嫩", IL: "以色列",
  PS: "巴勒斯坦", JO: "约旦", SA: "沙特阿拉伯", FO: "法罗群岛", AD: "安道尔", MC: "摩纳哥", SM: "圣马力诺", VA: "梵蒂冈",
};

export const YIELDS = [
  { key: "food", label: "粮食", icon: "🌾", color: "#8bc34a", unit: "千人", desc: "农业、林业、渔业的就业人数(按工作地,Eurostat nama_10r_3empers 的 NACE A)。" },
  { key: "production", label: "生产力", icon: "⚙️", color: "#e08a3c", unit: "千人", desc: "工业(采矿、制造、能源、水务,NACE B–E)加建筑业(NACE F)的就业人数;两者任一缺报则留空。" },
  { key: "gold", label: "金币", icon: "💰", color: "#f2c94c", unit: "百万欧元", desc: "地区生产总值,当年价(Eurostat nama_10r_3gdp,MIO_EUR)。" },
  { key: "science", label: "科技", icon: "🔬", color: "#4fa3e0", unit: "千人", desc: "信息通信(NACE J)加专业、科学、技术及行政服务(NACE M–N)的就业人数。地区未单独报告时按「父类就业 × 本国同类比例」估算,面板会标「估」。" },
  { key: "culture", label: "文化", icon: "🎭", color: "#c27bd6", unit: "千人", desc: "艺术、娱乐、休闲及其他服务(NACE R–U)的就业人数;未单独报告时同样按比例估算。" },
];

// 区域(district):城市按其所在 NUTS3 地区的产业结构获得。区位商 = 本地该行业就业占比 ÷ 全图平均占比。
export const DISTRICTS = [
  { key: "gov", label: "政府广场", icon: "🏛️", rule: "国家首都(维基数据「首都所属」P1376 指向本国)。" },
  { key: "campus", label: "学院", icon: "🎓", min_rd: 3.0, min_lq: 1.6, rule: "所在 NUTS2 大区研发投入(GERD)≥ GDP 的 3%,或信息通信+专业科研就业区位商 ≥ 1.6(两者均为实报值时)。" },
  { key: "industrial", label: "工业区", icon: "🏭", min_lq: 1.4, rule: "工业+建筑就业区位商 ≥ 1.4。" },
  { key: "commercial", label: "商业中心", icon: "🏦", min_lq: 1.5, rule: "金融+地产+专业服务就业区位商 ≥ 1.5(金融为实报值时)。" },
  { key: "theater", label: "剧院广场", icon: "🎭", min_lq: 1.5, rule: "艺术娱乐及其他服务就业区位商 ≥ 1.5(实报值时)。" },
  { key: "entertainment", label: "娱乐中心", icon: "🎡", min_nights_pc: 12000, rule: "所在 NUTS2 大区每千居民游客过夜 ≥ 12000 晚(约为全图前 10%)。" },
  { key: "harbor", label: "港口", icon: "⚓", rule: "城市所在格或相邻格是浅海(海岸)。" },
  { key: "farm", label: "粮仓", icon: "🌾", min_lq: 3, rule: "农林渔就业区位商 ≥ 3(非文明原版区域,本图自设)。" },
];

export const WATER = [
  { id: 0, key: "land", name: "陆地", rule: "格心与 6 个采样点中至少 4 个落在 NUTS 区或 Natural Earth 国家轮廓内。" },
  { id: 1, key: "ocean", name: "深海", color: "#173a5e", rule: "不与陆地相邻,且海深超过 200 米(或离岸 4 格以外未采样)。" },
  { id: 2, key: "coast", name: "浅海", color: "#3c86ae", rule: "与陆地相邻,或海深不足 200 米(ETOPO1)。" },
  { id: 3, key: "lake", name: "湖泊", color: "#4f9fcc", rule: "7 个采样点中至少 4 个落在 Natural Earth 1:5000 万湖泊面内。" },
];
export const TERRAIN = [
  { id: 0, key: "grassland", name: "草原", color: "#7f9a52", rule: "默认底色;大区内非耕地的部分。" },
  { id: 1, key: "plains", name: "平原", color: "#bfae6c", rule: "大区内按「耕地 ÷(耕地+草地+灌丛)」的比例分配(LUCAS 土地覆盖),地势平处优先。" },
  { id: 2, key: "desert", name: "荒漠", color: "#d8c38e", rule: "北纬 44° 以南、裸地占比 ≥ 8% 的大区,按裸地比例分配。" },
  { id: 3, key: "tundra", name: "冻土", color: "#9b9d86", rule: "北纬 67° 以北;或北纬 62° 以北且海拔 ≥ 500 米;或冰岛;或海拔 ≥ 1900 米。" },
  { id: 4, key: "snow", name: "雪地", color: "#eef1f2", rule: "格心落在 Natural Earth 冰川面内。" },
];
export const RELIEF = [
  { id: 0, key: "flat", name: "平地", rule: "格内 4 点与相邻格心海拔的标准差 < 110 米。" },
  { id: 1, key: "hills", name: "丘陵", rule: "标准差 ≥ 110 米,或平均海拔 ≥ 600 米且标准差 ≥ 60 米。" },
  { id: 2, key: "mountains", name: "山脉", rule: "最高点 ≥ 1800 米且标准差 ≥ 280 米,或平均海拔 ≥ 2000 米。" },
];
export const FEATURES = [
  { id: 0, key: "none", name: "无" },
  { id: 1, key: "woods", name: "森林", color: "#2f5d2a", rule: "大区内按林地占比(LUCAS C00)分配,丘陵优先;迷雾区按纬度粗推。" },
  { id: 2, key: "marsh", name: "沼泽", color: "#4f7f6a", rule: "大区湿地占比 ≥ 0.5% 时,按其 2 倍比例放在平地上。" },
];

export const LENS_GROUPS = [
  { id: "people", name: "人口" }, { id: "prosperity", name: "繁荣" }, { id: "knowledge", name: "知识" },
  { id: "economy", name: "产业" }, { id: "land", name: "土地" },
];
// level: r3 = NUTS3 地区, r2 = NUTS2 大区, cell = 每格
export const LENSES = [
  { id: "density", group: "people", name: "人口密度", level: "r3", field: "density", unit: "人/km²", scale: "log", ramp: "warm", desc: "常住人口 ÷ 面积(Eurostat demo_r_pjanaggr3、demo_r_d3area;面积缺失时用边界多边形面积)。" },
  { id: "gdp_pc", group: "prosperity", name: "人均 GDP(购买力,欧盟=100)", level: "r3", field: "gdp_pc_pps", unit: "", scale: "diverge", mid: 100, ramp: "rdbu", desc: "按购买力标准(PPS)计的人均 GDP,欧盟 27 国平均 = 100(nama_10r_3gdp)。" },
  { id: "cohesion", group: "prosperity", name: "凝聚政策档位(测算)", level: "r2", field: "cohesion", unit: "", scale: "cat", cats: [["欠发达 <75", "#d0563a"], ["转型 75–100", "#e8b04a"], ["较发达 ≥100", "#4c8fc7"]], desc: "按最新年份的 NUTS2 人均 GDP(PPS)测算:<75 欠发达、75–100 转型、≥100 较发达。欧盟官方 2021–27 档位用的是 2015–17 年平均,本图仅作近似。" },
  { id: "unemp", group: "prosperity", name: "失业率", level: "r2", field: "unemp", unit: "%", scale: "linear", ramp: "warm", desc: "15–74 岁失业率(lfst_r_lfu3rt)。" },
  { id: "rd", group: "knowledge", name: "研发强度", level: "r2", field: "rd_pct", unit: "% GDP", scale: "linear", ramp: "blue", desc: "研发总支出占 GDP 比例(rd_e_gerdreg)。" },
  { id: "tertiary", group: "knowledge", name: "高等教育", level: "r2", field: "tertiary", unit: "%", scale: "linear", ramp: "blue", desc: "25–64 岁人口中受过高等教育(ISCED 5–8)的比例(edat_lfse_04)。" },
  { id: "tourism", group: "economy", name: "旅游强度", level: "r2", field: "nights_pc", unit: "晚/千人", scale: "log", ramp: "purple", desc: "旅馆等住宿设施的游客过夜数 ÷ 千名居民(tour_occ_nin2)。" },
  { id: "industry", group: "economy", name: "工业就业占比", level: "r3", field: "share_industry", unit: "%", scale: "linear", ramp: "orange", desc: "工业+建筑就业 ÷ 总就业。" },
  { id: "agri", group: "economy", name: "农业就业占比", level: "r3", field: "share_agri", unit: "%", scale: "log", ramp: "green", desc: "农林渔就业 ÷ 总就业。" },
  { id: "forest", group: "land", name: "林地", level: "r2", field: "lc.wood", unit: "%", scale: "linear", ramp: "green", desc: "林地占土地面积比例(LUCAS 土地覆盖调查,lan_lcv_ovw C00)。" },
  { id: "crop", group: "land", name: "耕地", level: "r2", field: "lc.crop", unit: "%", scale: "linear", ramp: "orange", desc: "耕地占比(lan_lcv_ovw B00)。" },
  { id: "elev", group: "land", name: "海拔", level: "cell", field: "elev", unit: "米", scale: "linear", ramp: "terrain", desc: "每格采样点平均海拔(NOAA ETOPO1)。" },
];
