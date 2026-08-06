/**
 * 临时脚本：解析 farm.json，输出地形（Ground）与碰撞（Walls）数据，用于 P2 装饰坐标设计。
 * 仅开发期诊断用，完成后删除。
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(join(__dirname, '../../public/assets/maps/farm.json'), 'utf8'));

const W = map.width, H = map.height; // 40x25
const ground = map.layers.find((l) => l.name === 'Ground');
const walls = map.layers.find((l) => l.name === 'Walls');

// Ground 地形统计
const terrain = new Map();
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const gid = ground.data[r * W + c];
    terrain.set(gid, (terrain.get(gid) || 0) + 1);
  }
}
console.log('Ground gid 分布:', Object.fromEntries([...terrain.entries()].sort((a, b) => a[0] - b[0])));

// 按地形类型列出区域（gid 值）
const gidGroups = new Map();
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const gid = ground.data[r * W + c];
    if (!gidGroups.has(gid)) gidGroups.set(gid, []);
    gidGroups.get(gid).push(`${c},${r}`);
  }
}
for (const [gid, cells] of gidGroups) {
  // 仅打印 gid != 1（草地）的组，超过 40 格只打印计数
  if (gid === 1) continue;
  if (cells.length <= 40) console.log(`Ground gid=${gid} (${cells.length}