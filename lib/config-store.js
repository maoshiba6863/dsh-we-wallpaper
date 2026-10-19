import { readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, mkdirSync } from 'node:fs';
import { writeFile as writeFileP, rename as renameP, unlink as unlinkP } from 'node:fs/promises';
import { dirname } from 'node:path';
export function createConfigStoreKit({ configPath }) {
  function readConfig() {
    try {
      const o = JSON.parse(readFileSync(configPath(), 'utf8'));
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch { return {}; }
  }
  function atomicWriteFileSync(filePath, data) {
    const tmp = filePath + '.tmp';
    const fd = openSync(tmp, 'w');
    try {
      writeFileSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      renameSync(tmp, filePath);
    } catch {
      writeFileSync(filePath, data);
    }
  }
  let atomicTmpSeq = 0;
  function atomicTmpPath(filePath) {
    atomicTmpSeq = (atomicTmpSeq + 1) % 1000000;
    return filePath + '.tmp' + process.pid + String(atomicTmpSeq).padStart(6, '0');
  }
  async function atomicWriteFileP(filePath, data) {
    const tmp = atomicTmpPath(filePath);
    await writeFileP(tmp, data);
    try {
      await renameP(tmp, filePath);
    } catch {
      try { await writeFileP(filePath, data); } finally {
        try { await unlinkP(tmp); } catch {   }
      }
    }
  }
  function writeConfig(cfg) {
    try {
      mkdirSync(dirname(configPath()), { recursive: true });
      atomicWriteFileSync(configPath(), JSON.stringify(cfg));
    } catch {   }
  }
  const SETTINGS_FIELD = 'settings';
  let configWriteQueue = Promise.resolve();
  function enqueueConfigWrite(fn) {
    const p = configWriteQueue.then(fn, fn);
    configWriteQueue = p.then(() => {}, () => {});
    return p;
  }
  function readSettings() {
    const cfg = readConfig();
    const s = cfg[SETTINGS_FIELD];
    return s && typeof s === 'object' ? s : null;
  }
  function writeSettings(settings) {
    return enqueueConfigWrite(() => {
      const cfg = readConfig();
      cfg[SETTINGS_FIELD] = settings;
      writeConfig(cfg);
      return settings;
    });
  }
  return {
    readConfig, writeConfig, readSettings, writeSettings, SETTINGS_FIELD,
    atomicWriteFileSync, atomicWriteFileP, atomicTmpPath, enqueueConfigWrite,
  };
}