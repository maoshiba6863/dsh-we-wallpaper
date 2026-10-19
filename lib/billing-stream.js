import { AsyncLocalStorage } from 'node:async_hooks';
const depth = new AsyncLocalStorage();
export function createBillingStream({ billing, now = Date.now }) {
  return (options, next) => {
    const downstream = next();
    if (depth.getStore() !== undefined) return downstream;
    const startedAtMs = now();
    const turnInfo = billing.turnAt(options && options.sessionId);
    return (async function* billingStream() {
      let usage = null;
      let completed = false;
      let iterator = null;
      try {
        iterator = downstream[Symbol.asyncIterator]();
        for (;;) {
          const result = await depth.run(1, () => iterator.next());
          if (result.done) break;
          const chunk = result.value;
          if (chunk !== null && chunk !== undefined && chunk.type === 'usage' && chunk.usage != null) {
            usage = chunk.usage;
          }
          yield chunk;
        }
        completed = true;
      } finally {
        if (!completed) {
          try { await iterator?.return?.(); } catch {   }
        }
        if (usage !== null) {
          try {
            billing.account(usage, options, startedAtMs, turnInfo);
          } catch {   }
        }
      }
    })();
  };
}