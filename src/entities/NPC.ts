/**
 * NPC 实体（Phase 5）
 *
 * 设计原则（按需求）：
 *   - NPC 不是 AI，使用固定日程
 *   - 第一版不做寻路，直接向目标点插值移动
 *   - 只用占位方块，三个 NPC 名字/颜色不同
 *
 * 日程格式：[{ time: "HH:MM", location: 场景key, x: 目标像素x, y: 目标像素y }]
 * 根据 TimeSystem 当前时间，判定 NPC 当前应在哪个场景的哪个位置。
 */

import Phaser from 'phaser';

/** 单条日程：某时刻起，NPC 位于某场景的某坐标 */
export interface ScheduleEntry {
  /** "HH:MM" 格式，从该时刻起生效，直到下一条日程时刻 */
  time: string;
  /** 场景 key（farm/town/forest/mine） */
  location: string;
  /** 该场景中的目标像素 x */
  x: number;
  /** 该场景中的目标像素 y */
  y: number;
}

/** NPC 数据 + 运行时状态 */
export class NPC {
  readonly id: string;
  readonly name: string;
  /** 占位方块颜色 */
  readonly color: number;
  /** 固定日程（按 time 升序排列） */
  readonly schedule: ScheduleEntry[];

  /** 当前所在场景 key（由 NPCSystem.refreshSchedule 判定） */
  currentLocation: string;
  /** 当前目标像素 x（在 currentLocation 场景内） */
  targetX: number;
  /** 当前目标像素 y */
  targetY: number;

  /** 渲染对象（由 MapScene 在 create 时创建并赋值，离开场景时置空） */
  sprite: Phaser.GameObjects.Rectangle | null = null;
  /** 名字标签 */
  label: Phaser.GameObjects.Text | null = null;

  /** 对话内容（靠近按 E 显示） */
  readonly dialogue: string;

  constructor(
    id: string,
    name: string,
    color: number,
    dialogue: string,
    schedule: ScheduleEntry[]
  ) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.dialogue = dialogue;
    this.schedule = schedule;
    // 初始位置取第一条日程（应是最早时刻 06:00 那条）
    this.currentLocation = schedule[0].location;
    this.targetX = schedule[0].x;
    this.targetY = schedule[0].y;
  }

  /**
   * 每帧插值移动 sprite 向 targetX/targetY
   * @param dtMs 距上一帧毫秒
   */
  update(dtMs: number): void {
    if (!this.sprite) return;
    const speed = 0.003; // 插值系数/毫秒，约 333ms 走完一段距离
    const factor = Math.min(1, dtMs * speed);
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    this.sprite.x += dx * factor;
    this.sprite.y += dy * factor;
    if (this.label) {
      this.label.x = this.sprite.x;
      this.label.y = this.sprite.y - 14;
    }
  }

  /**
   * 当 NPC 被某个场景激活时，立即把 sprite 放到目标位置
   * （避免玩家进入场景时看到 NPC 从原点滑过来）
   */
  snapToTarget(): void {
    if (!this.sprite) return;
    this.sprite.x = this.targetX;
    this.sprite.y = this.targetY;
    if (this.label) {
      this.label.x = this.sprite.x;
      this.label.y = this.sprite.y - 14;
    }
  }
}
