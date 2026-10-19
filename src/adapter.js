const ADAPTER_LABELS = {
  get auto() { return weT('自动检测'); },
  get browser() { return weT('原生浏览器'); },
  get 'desktop-community'() { return weT('非官方桌面端'); },
  get 'desktop-official'() { return weT('官方桌面端'); },
};

let adapterHostReport = null;

function setAdapterFromHost(adapter) {
  adapterHostReport = adapter && typeof adapter === 'object'
    ? { detected: String(adapter.detected || ''), fence: Boolean(adapter.fence) }
    : null;
}

let adapterLocalTarget;
function adapterLocalDetect() {
  if (adapterLocalTarget !== undefined) return adapterLocalTarget;
  adapterLocalTarget = 'browser';
  try {
    let shell = false;
    if (typeof location !== 'undefined' && location && typeof location.search === 'string') {
      const q = new URLSearchParams(location.search);

      shell = q.get('dsh-desktop-mode') !== null || q.get('dsh-desktop-mica') !== null;
    }
    if (!shell && typeof document !== 'undefined' && document && typeof document.querySelector === 'function') {
      shell = Boolean(document.querySelector('.dshDesktopFrame, .dshDesktopConversationSurface'))
        || (Boolean(document.body) && document.body.hasAttribute('data-dsh-desktop-mode'));
    }
    if (!shell && typeof navigator !== 'undefined' && navigator && typeof navigator.userAgent === 'string') {
      shell = /Electron\//.test(navigator.userAgent);
    }

    if (shell) adapterLocalTarget = 'desktop-official';
  } catch {   }
  return adapterLocalTarget;
}

function adapterPickedTarget() {
  try {
    const v = typeof selection !== 'undefined' && selection ? selection.adapterTarget : 'auto';
    return typeof v === 'string' && ADAPTER_TARGET_VALUES.includes(v) ? v : 'auto';
  } catch { return 'auto'; }
}

function resolveAdapterTarget() {
  const picked = adapterPickedTarget();
  if (picked !== 'auto') return picked;
  if (adapterHostReport && adapterHostReport.detected
    && adapterHostReport.detected !== 'auto'
    && ADAPTER_TARGET_VALUES.includes(adapterHostReport.detected)) {
    return adapterHostReport.detected;
  }
  return adapterLocalDetect();
}

function adapterCaps() {
  const target = resolveAdapterTarget();
  const desktop = target !== 'browser';
  return {
    target,
    desktop,
    fence: Boolean(adapterHostReport && adapterHostReport.fence),
    blurPause: !desktop,
  };
}

function adapterDetectedLabel() {
  const detected = adapterHostReport && adapterHostReport.detected
    && adapterHostReport.detected !== 'auto'
    && ADAPTER_TARGET_VALUES.includes(adapterHostReport.detected)
    ? adapterHostReport.detected
    : adapterLocalDetect();
  return ADAPTER_LABELS[detected] || ADAPTER_LABELS.browser;
}

function adapterMismatchWarning() {
  const picked = adapterPickedTarget();
  if (picked === 'auto') return '';
  const detected = adapterHostReport && adapterHostReport.detected
    && adapterHostReport.detected !== 'auto'
    && ADAPTER_TARGET_VALUES.includes(adapterHostReport.detected)
    ? adapterHostReport.detected
    : adapterLocalDetect();
  if (detected === picked) return '';
  if (picked === 'browser' && adapterHostReport && adapterHostReport.fence) {
    return weT('手选了原生浏览器，但宿主观测到能力头栅栏 —— 网页壁纸会 403，请改回自动检测或桌面目标');
  }
  return weT('手选目标与检测不一致（检测到：{target}）', { target: ADAPTER_LABELS[detected] || '' });
}

export {
  ADAPTER_LABELS, setAdapterFromHost, resolveAdapterTarget,
  adapterCaps, adapterDetectedLabel, adapterMismatchWarning,
};
