# 历史依据与设计边界

本项目不是军史仿真器。每个棋盘把一场通常横跨数十公里、涉及多个军或师的战役，压缩成约 14×10 格的营级战术切片。时间、主要地标、代表性参战部队、指挥体系、气候和装备按公开资料校准；单位数量、格距、单回合时长和高大全直属部队均属游戏抽象。

## 角色边界

- 高大全及王铁山、赵长河、何满仓等直属部队角色全部为虚构人物，不影射具体历史人物。
- 高大全设定为“志愿军司令部直属加强营指挥员”，跨战区调动是为了维持连续战役的玩家动线，并非真实番号履历。
- 彭德怀、吴信泉、宋时轮、秦基伟、马修·李奇微、奥利弗·史密斯等真实将领只出现在简报的历史指挥体系中，不作为玩家直接操控的棋子。
- 生成肖像用于统一美术风格，不应代替档案照片或被当作历史影像。

## 关卡校准表

| 关卡 | 日期 | 战术切片 | 主要史料校准点 |
|---|---|---|---|
| 温井初战 | 1950-10-25 | 两水洞伏击带—温井节点 | 温玉成第40军第118师对金钟五准将所部韩第6师第2团第3营及一个炮兵中队；当夜攻占温井 |
| 云山合围 | 1950-11-01—03 | 云山城与城南公路桥 | 吴信泉第39军、美骑1师第8团、白善烨准将所部韩第1师换防；桥梁只用经战史支持的功能名，不采用未核实专名 |
| 清川江穿插 | 1950-11-25—12-02 | 德川—三所里—龙源里 | 第二次战役西线、38军穿插、清川江与南撤公路 |
| 长津湖断路 | 1950-11-27—12-03 | 柳潭里—德洞山口—下碣隅里公路切片 | 第9兵团第59师试图切断主补给路；美陆战第7团第2营 F 连坚守 Fox Hill/德洞山口高地。玩家只能建立临时路障，不以最终占领该山口结算 |
| 突破三八线 | 1950-12-31—1951-01-08 | 临津江—议政府方向 | 第三次战役、冬季渡河与联合国军后撤 |
| 横城反击 | 1951-02-11—13 | 横城北突出部—横城/原州南撤轴 | 阿尔蒙德少将指挥的美第10军正面，韩第8师等沿横城—原州轴东南撤；砥平里仅作西侧战役背景，不作为本关目标 |
| 砥平里外线 | 1951-02-13—15 | 环形阵地外围牵制与脱离 | 美23团战斗队、法军营、空中补给、克伦贝装甲救援；不允许虚构攻占砥平里 |
| 临津江渡河 | 1951-04-22—25 | 雪马里与235高地 | 63军、英29旅、格洛斯特营、分散山头阵地与河谷通道 |
| 铁原阻击 | 1951-05-29—06-10 | 铁原—涟川交通走廊的前沿/纵深阻击线 | 63军以弹性阻击掩护北撤；前沿点可主动放弃，最终胜利看迟滞时限、纵深线和撤出兵力，不要求两点同时死守 |
| 上甘岭坑道 | 1952-10-14—11-25 | 597.9与537.7高地 | 15军/12军、坑道体系、补给线、持续炮击与深秋初雪；无局部 T-34 证据，不配置装甲奖励 |
| 猪排山争夺 | 1953-07-06—11 | 石岘洞北山连续壕沟与支撑点 | 钟国楚第23军、第67师/第200团对美第7师；有独立坦克第4团第2连第2排 215 号 T-34-85 支援战例 |
| 金城反击 | 1953-07-13 21:00—07-14 10:00 | 中央集团第199师轿岩山第一夜切片 | 第67军第199师对韩第6师，开局为志愿军炮火准备；全战役装甲配属不能外推为本切片坦克，双方均不配置局部坦克 |

## 主要公开来源

### 综合战史

- U.S. Army Center of Military History, [Korean War Campaigns](https://history.army.mil/Research/Reference-Topics/Army-Campaigns/Brief-Summaries/Korean-War/)
- U.S. Army Center of Military History, [South to the Naktong, North to the Yalu](https://history.army.mil/portals/143/Images/Publications/catalog/20-2.pdf)
- U.S. Army Center of Military History, [Ebb and Flow: November 1950–July 1951](https://history.army.mil/portals/143/Images/Publications/catalog/20-4.pdf)
- U.S. Army Center of Military History, [Truce Tent and Fighting Front](https://history.army.mil/portals/143/Images/Publications/catalog/20-3.pdf)
- U.S. Army Center of Military History, [The Korean War: Restoring the Balance](https://history.army.mil/portals/143/Images/Publications/catalog/19-9.pdf)
- U.S. Army Center of Military History, [The UN Offensive](https://history.army.mil/portals/143/Images/Publications/catalog/19-7.pdf)（第 25 页：温井方向与韩第6师先头部队）
- U.S. Army Center of Military History, [The Chinese Intervention](https://history.army.mil/portals/143/Images/Publications/catalog/19-8.pdf)（第2–3页：云山；第16–20页：长津湖西岸道路）

### 战役与参战方资料

- 中国军网，[云山之战：中美王牌军首次对决](https://www.81.cn/2022zt/2020-10/10/content_10205017.htm)
- 退役军人事务部，[战役故事：第一次战役与云山](https://www.mva.gov.cn/sy/zt/kmyc70zn/zygs/202009/t20200929_42468.html)
- 韩国学中央研究院，[金钟五](https://encykorea.aks.ac.kr/Article/E0010502)（1950年第6师师长、7月晋准将段）
- 白善烨纪念财团，[白善烨年谱](https://www.paiksunyup.or.kr/sub3_1_a.html)（1950年7月晋准将、1951年4月晋少将条）
- U.S. Marine Corps Forces Korea, [History: Chosin (Changjin) Reservoir](https://www.marfork.marines.mil/About/History/)
- U.S. Marine Corps, [Frozen Chosin](https://www.marines.mil/Portals/1/Publications/Frozen%20Chosin%20US%20Marines%20at%20the%20Changjin%20Reservoir%20%20PCN%2019000410000_4.pdf)（本分册 PDF 第6–14、19页：道路路障、F/2/7与Fox Hill）
- U.S. Army University Press, [The 2d Infantry Division at the Battles of Wonju and Chipyong-ni: Readings](https://www.armyupress.army.mil/Portals/7/educational-services/staff-rides/2_The_2d_Infantry_Division_at_the_Battles_of_Wonju_and_Chipyong-ni_Readings_Exportable.pdf)（第 1–3 页：阿尔蒙德少将与原州轴战役背景）
- National Army Museum, [Battle of the Imjin River](https://www.nam.ac.uk/explore/battle-imjin)
- 退役军人事务部，[一面布满381个弹孔的战旗](https://www.mva.gov.cn/sy/zt/jdbn/qhxzc/202102/t20210224_45235.html)
- 中国国防部，[抗美援朝战争收局之战：金城战役](https://www.mod.gov.cn/gfbw/gfjy_index/16235847.html)
- 中国军网，[石岘洞北山反击战：“零敲牛皮糖”的光辉战例](https://www.81.cn/js_208592/jdt_208593/16288197.html)（第23军、第67师/第200团及独立坦克第4团段）
- 中国军网，[“喀秋莎”给侵略者带来灭顶之灾！盘点抗美援朝志愿军经典武器](https://www.81.cn/js_208592/jdt_208593/9934898.html)（“T-34坦克/215号”段，用于核型号）
- 兴国县人民政府，[抗美援朝战场上的兴国将军](https://www.xingguo.gov.cn/xgzf/c114397/202205/1cf61ebfcc6f47d4ab1d0a559b8ce334.shtml)（正文第54–55行：钟国楚与第23军）
- 人民网·中国共产党新闻网，[猛攻金城](http://cpc.people.com.cn/n1/2024/0226/c443712-40183243.html)（第199师轿岩山、第一夜炮火与全战役装甲配属段）
- 央视网，[金城战役](https://big5.cctv.com/gate/big5/www.cctv.cn/zhuanti/chaoxian/k_zz4.html)（“第199师经一夜激战，于14日10时占领轿岩山”段；B级结束时点）
- U.S. Army Center of Military History, [The Korean War](https://history.army.mil/portals/143/Images/Publications/catalog/19-5.pdf)

### 照片与装备外形参考

- Library of Congress, [Korean War campaigns and battles photograph](https://www.loc.gov/pictures/item/2002695469/)
- U.S. Army Center of Military History, [Korea 1951–1953 (text and photographs)](https://history.army.mil/Portals/143/Images/Publications/Publication%20By%20Title%20Images/K%20Pdf/CMH_Pub_21-2.pdf)
- National Army Museum 的临津江专题中收录了25磅炮、百夫长坦克乘员、无后坐力炮和战场遗物照片。

## 仍需谨慎的部分

不同参战方对伤亡、战果和部分战术细节的统计经常不一致。本游戏避免在关卡界面给出有争议的精确伤亡数字；历史结局采用双方均能确认的阵地变化、撤退、停止进攻或停战节点。后续若加入百科模式，应并列呈现不同来源口径。
