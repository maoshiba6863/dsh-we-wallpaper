export function bodyReader(req, { maxBytes, shouldStop, onOverflow } = {}) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('bodyReader 需要 maxBytes（正整数）—— 收 body 必须有上限，这是不变量不是选项');
  }
  const chunks = [];
  let size = 0;
  let overflowed = false;
  const onData = (chunk) => {
    if (overflowed) return;
    if (shouldStop && shouldStop()) return;
    size += chunk.length;
    if (size > maxBytes) {
      overflowed = true;
      if (onOverflow) onOverflow();
      return;
    }
    chunks.push(chunk);
  };
  return {
    onData,
    get overflowed() { return overflowed; },
    get bytes() { return size; },
    buf: () => Buffer.concat(chunks),
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}