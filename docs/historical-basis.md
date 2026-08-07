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
| 温井初战 | 1950-10-25 | 温井—北镇公路伏击与穿插 | 第一次战役初战、40军方向、韩军第6师先头部队 |
| 云山合围 | 1950-11-01—03 | 云山城与诸仁桥 | 39军、美骑1师第8团、韩军换防、夜战与断路 |
| 清川江穿插 | 1950-11-25—12-02 | 德川—三所里—龙源里 | 第二次战役西线、38军穿插、清川江与南撤公路 |
| 长津湖断路 | 1950-11-27—12-13 | 柳潭里—下碣隅里公路 | 9兵团、美陆战1师、极寒、道路阻断；不虚构“全歼”结局 |
| 突破三八线 | 1950-12-31—1951-01-08 | 临津江—议政府方向 | 第三次战役、冬季渡河与联合国军后撤 |
| 横城反击 | 1951-02-11—13 | 横城北部与公路节点 | 中部战线反击、韩8师方向、雪地山口与公路截断 |
| 砥平里外线 | 1951-02-13—15 | 环形阵地外围牵制与脱离 | 美23团战斗队、法军营、空中补给、克伦贝装甲救援；不允许虚构攻占砥平里 |
| 临津江渡河 | 1951-04-22—25 | 雪马里与235高地 | 63军、英29旅、格洛斯特营、分散山头阵地与河谷通道 |
| 铁原阻击 | 1951-05-29—06-10 | 铁原—涟川交通走廊 | 63军纵深阻击、迟滞追击、轮换防御 |
| 上甘岭坑道 | 1952-10-14—11-25 | 597.9与537.7高地 | 15军/12军、坑道体系、补给线、持续炮击与深秋初雪 |
| 猪排山争夺 | 1953-07-06—11 | 前哨东西支撑点 | 美7师前哨、反复争夺、停战前有限目标作战 |
| 金城反击 | 1953-07-13—27 | 第一夜突破与北汉江节点 | 20兵团、韩军4个师方向、集中炮火、季风暴雨与停战前最后攻势 |

## 主要公开来源

### 综合战史

- U.S. Army Center of Military History, [Korean War Campaigns](https://history.army.mil/Research/Reference-Topics/Army-Campaigns/Brief-Summaries/Korean-War/)
- U.S. Army Center of Military History, [South to the Naktong, North to the Yalu](https://history.army.mil/portals/143/Images/Publications/catalog/20-2.pdf)
- U.S. Army Center of Military History, [Ebb and Flow: November 1950–July 1951](https://history.army.mil/portals/143/Images/Publications/catalog/20-4.pdf)
- U.S. Army Center of Military History, [Truce Tent and Fighting Front](https://history.army.mil/portals/143/Images/Publications/catalog/20-3.pdf)
- U.S. Army Center of Military History, [The Korean War: Restoring the Balance](https://history.army.mil/portals/143/Images/Publications/catalog/19-9.pdf)

### 战役与参战方资料

- 中国军网，[云山之战：中美王牌军首次对决](https://www.81.cn/2022zt/2020-10/10/content_10205017.htm)
- 退役军人事务部，[战役故事：第一次战役与云山](https://www.mva.gov.cn/sy/zt/kmyc70zn/zygs/202009/t20200929_42468.html)
- U.S. Marine Corps Forces Korea, [History: Chosin (Changjin) Reservoir](https://www.marfork.marines.mil/About/History/)
- U.S. Marine Corps, [Frozen Chosin](https://www.marines.mil/Portals/1/Publications/Frozen%20Chosin%20US%20Marines%20at%20the%20Changjin%20Reservoir%20%20PCN%2019000410000_1.pdf)
- National Army Museum, [Battle of the Imjin River](https://www.nam.ac.uk/explore/battle-imjin)
- 退役军人事务部，[一面布满381个弹孔的战旗](https://www.mva.gov.cn/sy/zt/jdbn/qhxzc/202102/t20210224_45235.html)
- 中国国防部，[抗美援朝战争收局之战：金城战役](https://www.mod.gov.cn/gfbw/gfjy_index/16235847.html)
- U.S. Army Center of Military History, [The Korean War](https://history.army.mil/portals/143/Images/Publications/catalog/19-5.pdf)

### 照片与装备外形参考

- Library of Congress, [Korean War campaigns and battles photograph](https://www.loc.gov/pictures/item/2002695469/)
- U.S. Army Center of Military History, [Korea 1951–1953 (text and photographs)](https://history.army.mil/Portals/143/Images/Publications/Publication%20By%20Title%20Images/K%20Pdf/CMH_Pub_21-2.pdf)
- National Army Museum 的临津江专题中收录了25磅炮、百夫长坦克乘员、无后坐力炮和战场遗物照片。

## 仍需谨慎的部分

不同参战方对伤亡、战果和部分战术细节的统计经常不一致。本游戏避免在关卡界面给出有争议的精确伤亡数字；历史结局采用双方均能确认的阵地变化、撤退、停止进攻或停战节点。后续若加入百科模式，应并列呈现不同来源口径。

