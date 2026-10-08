// Node test reporter for sharded lanes: one "shard-weight node <file> <seconds>"
// line per test file at the end. Each file's own summary carries its duration,
// hooks and tests a helper defines included (a test's own event names the file
// that called test(), which may be a helper). tools/shard_weights.mjs reads
// these lines back from a CI run's logs.
import path from 'node:path';

export default async function* shardTimes(source) {
  const seconds = new Map();
  for await (const event of source) {
    // The run's overall summary has no file.
    if (event.type !== 'test:summary' || !event.data.file) continue;
    const file = path.relative(process.cwd(), event.data.file).split(path.sep).join('/');
    seconds.set(file, (seconds.get(file) || 0) + (event.data.duration_ms || 0) / 1000);
  }
  for (const [file, total] of [...seconds].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    yield `shard-weight node ${file} ${Math.max(total, 0.1).toFixed(1)}\n`;
  }
}
