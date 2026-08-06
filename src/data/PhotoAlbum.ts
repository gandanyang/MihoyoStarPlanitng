/**
 * 归星录·相簿（v0.1 极简版）
 *
 * 玩家收集的不是"图片"，而是"在这座岛上生活过的证明"。
 * 每张照片 = 一段经历（标题 + 画面 + 描述 + 获得方式），
 * 通过完成对应经历解锁（不直接送）。
 *
 * 存档：SaveData.album?: string[]（顶层可选字段，旧档无此字段视为空，兼容）。
 * 获取：unlockPhoto() 幂等（Set 去重，重复触发无副作用）。
 *
 * 红线：不直接使用 ComfyUI 原图——照片走 assets/photos/album/ 下的 webp（≤1280）。
 */

/** 相簿条目 */
export interface Photo {
  id: string;
  /** 标题（如《雨后的青禾镇》） */
  title: string;
  /** 画面资源（assets/photos/album/*.webp，16:9/4:3，≤1280，webp） */
  image: string;
  /** 一句话描述 */
  description: string;
  /** 获得方式文案（玩家可见） */
  source: string;
}

/** 照片数据库（第一版 3 张） */
export const PHOTO_DATABASE: Photo[] = [
  {
    id: 'summer_garden',
    title: '夏日花园',
    image: 'assets/photos/album/summer_garden.webp',
    description: '雨停以后，花园的泥土还会潮很久。夏雅说，她小时候经常来这里。',
    source: '完成「整理旧花园」',
  },
  {
    id: 'old_mine',
    title: '旧矿灯',
    image: 'assets/photos/album/old_mine.webp',
    description: '以前这里每天都有工人的声音。现在只剩下矿石在暗处发光。',
    source: '完成「矿洞探险」',
  },
  {
    id: 'hillside_view',
    title: '后山观景',
    image: 'assets/photos/album/hillside_view.webp',
    description: '这个地方，适合冒险结束以后坐一会。风会把烦恼带走。',
    source: '完成「后山老树」',
  },
  {
    id: 'xiya_garden',
    title: '有人照顾的院子',
    image: 'assets/photos/album/xiya_garden.webp',
    description: '小时候这里总有人坐在藤架下面喝茶。后来院子慢慢荒了。但现在，好像又有人回来了。',
    source: '完成夏雅「院子有人照顾」',
  },
  {
    id: 'elder_star',
    title: '青禾镇的星空',
    image: 'assets/photos/album/elder_star.webp',
    description: '很多人觉得这里什么都没有。但有些东西，只有慢下来才看得到。',
    source: '完成村长「看星星的地方」',
  },
  {
    id: 'xiya_old_photo',
    title: '泛黄的照片',
    image: 'assets/photos/album/xiya_old_photo.webp',
    description: '田埂上两个人，肩并着肩。原来以前的青禾镇，是这个样子的。',
    source: '完成夏雅「整理旧照片」',
  },
];

/** 已解锁照片 ID（模块级 Set，存档恢复后重新填充） */
let unlocked = new Set<string>();

/** 解锁一张照片（幂等；调用方负责在对应经历完成时触发） */
export function unlockPhoto(id: string): void {
  if (!PHOTO_DATABASE.some(p => p.id === id)) return;
  unlocked.add(id);
}

/** 是否已解锁 */
export function isPhotoUnlocked(id: string): boolean {
  return unlocked.has(id);
}

/** 全部照片（含锁定状态，UI 用） */
export function getAllPhotos(): (Photo & { unlocked: boolean })[] {
  return PHOTO_DATABASE.map(p => ({ ...p, unlocked: unlocked.has(p.id) }));
}

/** 已解锁照片数 */
export function unlockedPhotoCount(): number {
  return unlocked.size;
}

/** 存档序列化（photo IDs） */
export function getAlbumSaveData(): string[] {
  return Array.from(unlocked);
}

/** 存档恢复（旧档无 album 字段 → 空） */
export function restoreAlbumSaveData(ids: string[]): void {
  unlocked = new Set(ids.filter(id => PHOTO_DATABASE.some(p => p.id === id)));
}
