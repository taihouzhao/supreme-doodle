import type { ItemId } from "../core/types";
import { ITEMS } from "./items";

/**
 * 战役物资循序解锁：开局只给急救与口粮，其余按关卡引入。
 * `introMission` 为 0-based 关卡下标；-1 表示开局仓库已有。
 */
export interface ItemIntro {
  id: ItemId;
  introMission: number;
  /** 参谋部/结算页短提示 */
  note: string;
}

export const ITEM_INTROS: ItemIntro[] = [
  { id: "bandage", introMission: -1, note: "轻伤包扎，开局即可使用" },
  { id: "ration", introMission: -1, note: "炒面袋，压疲劳" },
  { id: "medkit", introMission: 0, note: "医疗包：温井地图可拾取，战后入库" },
      { id: "at_charge", introMission: 1, note: "反坦克武器：云山合围面对装甲与火力点" },
      { id: "field_manual", introMission: 1, note: "战术笔记：击溃精锐后缴获，战场不可使用" },
      { id: "smoke_grenade", introMission: 2, note: "烟幕弹：清川江穿插与后续渡河掩护" },
  { id: "compressed_ration", introMission: 3, note: "压缩干粮：长津湖极寒行军" },
  { id: "satchel", introMission: 3, note: "爆破筒：路障与工事" },
  { id: "water_purification", introMission: 3, note: "净水片：山地驻地饮水，长津湖偶发缴获" },
  { id: "ammo_crate", introMission: 4, note: "弹药箱：第三次战役后补给线拉长" },
  { id: "grenade_bundle", introMission: 5, note: "手榴弹束：横城村落与火力点近战" },
  { id: "signal_flare", introMission: 6, note: "信号弹：砥平里脱离与夜间校射" },
  { id: "arty_support", introMission: 7, note: "炮火支援：临津江以后才有稳定呼叫权" },
];

export const PACED_STARTING_INVENTORY: Partial<Record<ItemId, number>> = {
  bandage: 2,
  ration: 1,
};

/** 打完 missions[i] 后入库；战败同样补给，避免把工具锁在通关后面。 */
export const PACED_RESUPPLY_AFTER: Array<Partial<Record<ItemId, number>>> = [
  { medkit: 1, bandage: 1, ration: 1 },
  { bandage: 1, at_charge: 1 },
  { smoke_grenade: 1, ration: 1 },
  { compressed_ration: 1, medkit: 1 },
  { ammo_crate: 1, bandage: 1 },
  { grenade_bundle: 1, ration: 1 },
  { signal_flare: 1, medkit: 1 },
  { arty_support: 1, smoke_grenade: 1 },
  { ammo_crate: 1, bandage: 1 },
  { satchel: 1, medkit: 1 },
  { arty_support: 1, at_charge: 1 },
  { medkit: 1, ration: 1 },
];

export function itemIntroducedBy(missionIndex: number): ItemIntro[] {
  return ITEM_INTROS.filter((entry) => entry.introMission === missionIndex);
}

export function itemsKnownAtMission(missionIndex: number): Set<ItemId> {
  const known = new Set<ItemId>();
  for (const entry of ITEM_INTROS) {
    if (entry.introMission < missionIndex) known.add(entry.id);
  }
  return known;
}

export function briefingGearHint(missionIndex: number): string {
  const opening = ITEM_INTROS.filter((entry) => entry.introMission < 0).map(
    (entry) => ITEMS[entry.id].name,
  );
  const fresh = itemIntroducedBy(missionIndex);
  if (missionIndex === 0) {
    const found = fresh.map((entry) => ITEMS[entry.id].name).join("、");
    return `开局只带${opening.join("、")}。${found ? `本关可在地图发现${found}。` : ""}后续工具按战役阶段解锁，不会一开始堆满仓库。`;
  }
  if (fresh.length === 0) {
    return "本关没有新的常备物资；把已有工具用在关键单位上。";
  }
  return `本关新接触：${fresh.map((entry) => `${ITEMS[entry.id].name}（${entry.note}）`).join("；")}。`;
}

export function resupplyUnlockHint(completedMissionIndex: number): string | null {
  const unlocked = itemIntroducedBy(completedMissionIndex).filter((entry) => {
    const amount = PACED_RESUPPLY_AFTER[completedMissionIndex]?.[entry.id] ?? 0;
    return amount > 0;
  });
  if (unlocked.length === 0) return null;
  return `补给解锁：${unlocked.map((entry) => `${ITEMS[entry.id].name} — ${entry.note}`).join("；")}`;
}

export function resupplyAfterMission(
  completedMissionIndex: number,
): Partial<Record<ItemId, number>> {
  return PACED_RESUPPLY_AFTER[completedMissionIndex] ?? {};
}
