/**
 * NPC 系统（Phase 5）
 *
 * 职责：
 *   - 持有三个 NPC 的固定数据
 *   - 根据 TimeSystem 当前时间，判定每个 NPC 应在哪个场景的哪个位置
 *   - 提供按场景查询 NPC 的接口（供 MapScene create 时创建 sprite）
 *   - 每帧 update 推进 NPC 插值移动
 *
 * 日程（三 NPC 共用结构，名字/颜色/对话不同）：
 *   06:00-08:00  farm   （出生/家）
 *   08:00-12:00  town   （上午在小镇）
 *   12:00-18:00  forest （下午在森林）
 *   18:00-22:00  farm   （回家）
 *
 * 目标坐标（在各场景中的固定点，像素）：
 *   farm:   (3*16+8, 11*16+8)  木屋旁
 *   town:   (15*16+8, 10*16+8) 小镇中央
 *   forest: (15*16+8, 10*16+8) 森林中央
 */

import { NPC, ScheduleEntry } from '../entities/NPC';
import { getTime } from '../data/TimeSystem';

/** 瓦片尺寸 */
const T = 16;

/** 场景内固定目标点（像素） */
const SPOTS = {
  farm: { x: 3 * T + 8, y: 11 * T + 8 },
  town: { x: 15 * T + 8, y: 10 * T + 8 },
  forest: { x: 15 * T + 8, y: 10 * T + 8 },
};

/** 构建日程（三 NPC 共用结构） */
function buildSchedule(): ScheduleEntry[] {
  return [
    { time: '06:00', location: 'farm', ...SPOTS.farm },
    { time: '08:00', location: 'town', ...SPOTS.town },
    { time: '12:00', location: 'forest', ...SPOTS.forest },
    { time: '18:00', location: 'farm', ...SPOTS.farm },
  ];
}

/** 三个 NPC（textureKey 对应 preload 加载的贴图） */
const npcs: NPC[] = [
  new NPC('elder', '村长', 'npc_elder', '欢迎来到星辰岛。', buildSchedule()),
  new NPC('shopkeeper', '商店老板', 'npc_merchant', '小店刚开张，0.1 版本还没货。', buildSchedule()),
  new NPC('mystery', '神秘少女', 'npc_girl', '...你听得见岛的低语吗？', buildSchedule()),
];

/** 读取全部 NPC（只读列表） */
export function getAllNPCs(): readonly NPC[] {
  return npcs;
}

/**
 * 把 "HH:MM" 转成当日分钟数（0-1439）
 */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 根据 TimeSystem 当前时间，刷新所有 NPC 的 currentLocation / targetX / targetY
 * 规则：取 schedule 中 time <= 当前时间 的最后一条
 * 应在场景 create 时、以及 TimeSystem.nextDay 之后调用
 */
export function refreshSchedule(): void {
  const now = getTime();
  const nowMin = now.hour * 60 + now.minute;
  for (const npc of npcs) {
    let active = npc.schedule[0];
    for (const entry of npc.schedule) {
      if (timeToMinutes(entry.time) <= nowMin) {
        active = entry;
      } else {
        break;
      }
    }
    npc.currentLocation = active.location;
    npc.targetX = active.x;
    npc.targetY = active.y;
  }
}

/**
 * 获取当前应出现在指定场景的 NPC 列表
 * （供 MapScene create 时创建 sprite）
 */
export function getNPCsForScene(sceneKey: string): NPC[] {
  return npcs.filter((n) => n.currentLocation === sceneKey);
}

/**
 * 每帧推进所有 NPC 的插值移动
 * （仅对有 sprite 的 NPC 生效，sprite 由 MapScene 创建/销毁）
 */
export function updateNPCs(dtMs: number): void {
  for (const npc of npcs) {
    npc.update(dtMs);
  }
}

/**
 * TimeSystem.nextDay 之后调用：重置 NPC 日程
 * （NPC 仍按时间判定位置，这里只需 refreshSchedule）
 */
export function onDayChange(): void {
  refreshSchedule();
}
