/**
 * 输入管理器（Phase M1）
 *
 * 架构：所有输入源（键盘/摇杆/按钮）统一汇入 InputManager，
 * Player 和 MapScene 只读语义化接口，不直接接触具体输入设备。
 *
 *   KeyboardInput ─┐
 *   VirtualJoystick├─→ InputManager ─→ Player.moveX/moveY
 *   VirtualButton ─┘      consumeAction()─→ MapScene 交互
 *
 * 接口设计预留扩展（menu/cancel/冲刺 等），当前只实现 move + action。
 *
 * 消费语义：
 *   动作输入用 consumeAction() 消费模式，按一次只返回 true 一次。
 *   避免按住不放导致连续触发（对话开关反复、采集连发等）。
 */

import Phaser from 'phaser';

export class InputManager {
  /** 水平移动向量：-1 左 / 0 停 / 1 右 */
  moveX = 0;
  /** 垂直移动向量：-1 上 / 0 停 / 1 下 */
  moveY = 0;

  /** 排队待消费的动作（按下时排队，consumeAction 消费） */
  private actionQueued = false;

  // 键盘按键引用（PC 端，移动端 M3 不用）
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW: Phaser.Input.Keyboard.Key;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyS: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  /** 背包键：B（MapScene 直接读取 JustDown） */
  keyB: Phaser.Input.Keyboard.Key;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey('W');
    this.keyA = keyboard.addKey('A');
    this.keyS = keyboard.addKey('S');
    this.keyD = keyboard.addKey('D');

    // 动作键：E / Space / Enter 都触发 action（用 keydown 事件排队）
    keyboard.addKey('E').on('down', () => this.queueAction());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => this.queueAction());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).on('down', () => this.queueAction());

    // 背包键：B（MapScene 直接读取，不走 action 队列）
    this.keyB = keyboard.addKey('B');
  }

  /**
   * 排队一个动作输入（键盘 keydown / 触屏按钮按下时调用）
   * M3 的虚拟按钮也会调这个方法
   */
  queueAction(): void {
    this.actionQueued = true;
  }

  /**
   * 消费一次动作输入
   * @returns 如果有待消费的动作返回 true 并清除；否则 false
   * 按一次只触发一次，不会连发
   */
  consumeAction(): boolean {
    if (this.actionQueued) {
      this.actionQueued = false;
      return true;
    }
    return false;
  }

  /**
   * 清空排队动作（丢弃本次按键）
   * 场景：打开商店时，若开门瞬间的 E 键已排队，
   * 不清空会导致下一次 update 立即把商店关掉。
   */
  clearAction(): void {
    this.actionQueued = false;
  }

  /**
   * 每帧调用：从键盘读取移动向量
   * M3 接入摇杆后，摇杆直接设置 moveX/moveY，此方法只处理键盘部分
   */
  update(): void {
    let x = 0;
    let y = 0;
    if (this.keyA.isDown || this.cursors.left.isDown) x = -1;
    else if (this.keyD.isDown || this.cursors.right.isDown) x = 1;
    if (this.keyW.isDown || this.cursors.up.isDown) y = -1;
    else if (this.keyS.isDown || this.cursors.down.isDown) y = 1;
    this.moveX = x;
    this.moveY = y;
  }
}
