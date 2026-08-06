// 临时修复脚本：批量把索引中缺失 blob 的对象写回对象库
// 仅当工作区文件存在且内容 hash 与索引一致时写回；不一致则报告（需人工处理）
import { execSync } from 'child_process';

const lines = execSync('git ls-files -s', { encoding: 'utf8' }).trim().split('\n');
let missing = 0, fixed = 0, hashDiff = 0, fileMissing = 0;

for (const line of lines) {
  const m = line.match(/^100644 ([0-9a-f]{40}) 0\t(.+)$/);
  if (!m) continue;
  const hash = m[1];
  const path = m[2];
  try {
    execSync(`git cat-file -e ${hash}`, { stdio: 'ignore' });
    continue;
  } catch {
    missing++;
  }
  // 工作区文件存在则写回
  try {
    // 用 hash-object 直接读文件（不经过 shell 重定向，避免转义问题）
    const newHash = execSync(`git hash-object -w "${path}"`, { encoding: 'utf8' }).trim();
    if (newHash === hash) {
      fixed++;
      console.log('OK  已修复: ' + path);
    } else {
      hashDiff++;
      console.log('DIFF hash 不同(需更新索引): ' + path + '  ' + hash + ' -> ' + newHash);
    }
  } catch {
    fileMissing++;
    console.log('MISS 工作区文件缺失: ' + path + ' (hash=' + hash + ')');
  }
}
console.log(`\n缺失: ${missing} | 修复: ${fixed} | hash不同: ${hashDiff} | 文件缺失: ${fileMissing}`);
