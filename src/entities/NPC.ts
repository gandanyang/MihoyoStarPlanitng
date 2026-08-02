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
import { type DialogueLine } from '../systems/StorySystem';

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
  /** 名字标签主题色（用于头顶名牌，区分角色） */
  readonly nameColor: string;
  /** 贴图 key（preload 加载的图片 key） */
  readonly textureKey: string;
  /** 固定日程（按 time 升序排列） */
  readonly schedule: ScheduleEntry[];

  /** 当前所在场景 key（由 NPCSystem.refreshSchedule 判定） */
  currentLocation: string;
  /** 当前目标像素 x（在 currentLocation 场景内） */
  targetX: number;
  /** 当前目标像素 y */
  targetY: number;

  /** 渲染对象（由 MapScene 在 create 时创建并赋值，离开场景时置空） */
  sprite: Phaser.GameObjects.Image | null = null;
  /** 名字标签 */
  label: Phaser.GameObjects.Text | null = null;

  /** 对话剧本（靠近按 E 显示，StoryDialogue 全屏播放） */
  readonly dialogues: DialogueLine[];

  /** v0.6 阶段 2a：NPC 视觉生活动作 tween（单帧 Image，用 Tween 模拟动作）
   *  非 null 表示存在活动 tween，update 内位置插值暂停（避免踱步等位置类动画冲突） */
  idleTween: Phaser.Tweens.Tween | null = null;
  /** 踱步类 tween 基准 x（startIdleAnimation 时记录 sprite.x），用于重建相对运动 */
  private idleBaseX: number = 0;
  private idleBaseY: number = 0;

  constructor(
    id: string,
    name: string,
    nameColor: string,
    textureKey: string,
    dialogues: DialogueLine[],
    schedule: ScheduleEntry[]
  ) {
    this.id = id;
    this.name = name;
    this.nameColor = nameColor;
    this.textureKey = textureKey;
    this.dialogues = dialogues;
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
    // v0.6 阶段 2a 守卫：有活动 idleTween（如村长踱步）时跳过位置插值，避免 tween 冲突
    if (!this.idleTween) {
      const speed = 0.003; // 插值系数/毫秒，约 333ms 走完一段距离
      const factor = Math.min(1, dtMs * speed);
      const dx = this.targetX - this.sprite.x;
      const dy = this.targetY - this.sprite.y;
      this.sprite.x += dx * factor;
      this.sprite.y += dy * factor;
    }
    // 标签始终跟随 sprite（无论是否存在 tween，确保踱步/蹲起时视觉不脱节）
    if (this.label) {
      this.label.x = this.sprite.x;
      // 32x32 NPC 缩放 0.5 后，标签在头顶上方 14 像素
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
      // 32x32 NPC 缩放 0.5 后，标签在头顶上方 14 像素
      this.label.y = this.sprite.y - 14;
    }
  }

  // =========================================================================
  // v0.6 阶段 2a：NPC 视觉生活动作（Tween 模拟，不依赖动画帧）
  // =========================================================================

  /**
   * 根据 NPC id 启动对应的视觉动作 tween
   * 由 MapScene.setupNPCs 在创建 sprite + snapToTarget 后调用
   */
  startIdleAnimation(scene: Phaser.Scene): void {
    if (!this.sprite) return;
    this.stopIdleAnimation();
    this.idleBaseX = this.sprite.x;
    this.idleBaseY = this.sprite.y;
    const s = this.sprite;

    switch (this.id) {
      case 'miner': {
        // 矿工老张：挥镐 —— 身体前后摆动（模拟抡镐弧线）
        this.idleTween = scene.tweens.add({
          targets: s,
          angle: { from: 0, to: -25 },
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Cubic.InOut',
        });
        break;
      }
      case 'gardener': {
        // 花匠小梅：浇花 —— 身体微蹲（y 方向缩放+位置）
        this.idleTween = scene.tweens.add({
          targets: s,
          scaleY: { from: 0.5, to: 0.46 },
          y: { from: this.idleBaseY, to: this.idleBaseY + 2 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
        break;
      }
      case 'adventurer': {
        // 冒险家阿风：张望 —— 左右翻转（视线交替）
        this.idleTween = scene.tweens.add({
          targets: s,
          scaleX: { from: 0.5, to: -0.5 },
          duration: 1800,
          yoyo: true,
          repeat: -1,
          ease: 'Quad.InOut',
        });
        break;
      }
      case 'elder': {
        // 村长：踱步 —— 小幅度左右移动（影响位置，故需 update 守卫）
        this.idleTween = scene.tweens.add({
          targets: s,
          x: { from: this.idleBaseX - 7, to: this.idleBaseX + 7 },
          duration: 2000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
        break;
      }
      case 'shopkeeper': {
        // 商店老板：整理货物 —— 微弯+伸手
        this.idleTween = scene.tweens.add({
          targets: s,
          scaleY: { from: 0.5, to: 0.47 },
          scaleX: { from: 0.5, to: 0.515 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Cubic.InOut',
        });
        break;
      }
      case 'mystery': {
        // 神秘少女：静立呼吸 —— 透明度+轻微漂浮
        this.idleTween = scene.tweens.add({
          targets: s,
          alpha: { from: 0.85, to: 1 },
          y: { from: this.idleBaseY - 1.5, to: this.idleBaseY + 1.5 },
          duration: 2000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
        break;
      }
      default:
        // 未知 NPC：轻微呼吸（安全兜底）
        this.idleTween = scene.tweens.add({
          targets: s,
          scaleY: { from: 0.5, to: 0.49 },
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
    }
  }

  /** 停止并销毁 idle tween，重置 sprite 视觉状态（调用方在 sprite destroy 前运行） */
  stopIdleAnimation(): void {
    if (this.idleTween) {
      try { this.idleTween.stop(); } catch (_) { /* 已停止忽略 */ }
      try { this.idleTween.remove(); } catch (_) { /* 已移除忽略 */ }
      this.idleTween = null;
    }
    if (this.sprite) {
      this.sprite.angle = 0;
      this.sprite.alpha = 1;
      // scaleX/scaleY 恢复到 0.5（NPC 贴图统一展示尺寸）；注意 setScale(0.5) 在 setupNPCs 中已调用
      this.sprite.scaleX = 0.5;
      this.sprite.scaleY = 0.5;
    }
  }
}
