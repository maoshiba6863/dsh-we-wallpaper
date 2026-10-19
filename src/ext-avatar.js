const AVATAR_SIDE_ROWS = [
  {
    id: 'user',
    get label() { return weT("「我」的头像"); },
    get hint() { return weT("你的消息在右侧，头像跟着在右侧"); },
  },
  {
    id: 'ai',
    get label() { return weT("「助手」的头像"); },
    get hint() { return weT("助手的消息在左侧，头像跟着在左侧"); },
  },
];

const AVATAR_PREVIEW_BOX = 80;

const AVATAR_PREVIEW_SIZE_FALLBACK = 40;
const AVATAR_PREVIEW_ROUND_FALLBACK = 100;

function avatarSideRow(side, sel, acts) {
  const set = Boolean(side.id === 'user' ? sel.avatarUserImage : sel.avatarAiImage);
  const busy = sel.avatarBusy === side.id;
  const size = avatarPreviewSize(sel);
  const round = avatarPreviewRound(sel);
  const url = avatarImageUrl(side.id, sel);
  return React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap", key: "avatar-row-" + side.id },

    React.createElement("span", {
      className: "we-avatar-preview",
      style: { width: AVATAR_PREVIEW_BOX + "px", height: AVATAR_PREVIEW_BOX + "px" },
    },
      React.createElement("span", {
        className: "we-avatar-preview__face",
        style: {
          width: size + "px",
          height: size + "px",
          borderRadius: (round / 2) + "%",
        },
      },
        url
          ? React.createElement("img", {
              className: "we-avatar-preview__img", src: url, alt: "", draggable: false,
            })
          : React.createElement("span", { className: "we-avatar-preview__glyph" },
              renderAvatarGlyph(side.id, AVATAR_PREVIEW_BOX)),
      ),
    ),
    ctlText(side.label, side.hint),
    React.createElement("button", {
      className: "we-picker__btn",
      type: "button",
      disabled: busy,
      onClick: () => acts.onPick(side.id),
    }, busy ? weT("导入中…") : (set ? weT("替换图片…") : weT("导入图片…"))),
    set && React.createElement("button", {
      className: "we-picker__btn",
      type: "button",
      disabled: busy,
      onClick: () => acts.onClear(side.id),
    }, weT("清除")),
  );
}

function avatarPreviewSize(sel) {
  const n = Number(sel && sel.avatarSize);
  if (!isFinite(n)) return AVATAR_PREVIEW_SIZE_FALLBACK;
  return Math.min(AVATAR_SIZE_MAX, Math.max(AVATAR_SIZE_MIN, Math.round(n)));
}

function avatarPreviewRound(sel) {
  const n = Number(sel && sel.avatarRadius);
  if (!isFinite(n)) return AVATAR_PREVIEW_ROUND_FALLBACK;
  return Math.min(AVATAR_RADIUS_MAX, Math.max(AVATAR_RADIUS_MIN, Math.round(n)));
}

function renderAvatarCropModal(ctx) {
  const { sel, onAvatarCropZoom, onAvatarCropDrag, onAvatarCropConfirm, onAvatarCropCancel } = ctx;
  if (!sel.avatarCropSide) return null;

  const geo = ctx.avatarCropGeo || { dw: 0, dh: 0, dx: 0, dy: 0 };
  const view = ctx.avatarCropView || 260;
  return React.createElement("div", { className: "we-crop" },
    React.createElement("div", { className: "we-crop__card" },
      React.createElement("div", { className: "we-crop__title" }, weT("裁切头像")),
      React.createElement("span", { className: "we-picker__hint" },
        weT("拖动调整位置、滚轮或滑块缩放；框内这一块会作为头像（方形）。")),
      React.createElement("div", {
        className: "we-crop__view",
        style: { width: view + "px", height: view + "px" },
        onPointerDown: (e) => {
          const startX = e.clientX;
          const startY = e.clientY;
          const move = (ev) => onAvatarCropDrag(ev.clientX - startX, ev.clientY - startY);
          const up = () => {
            try { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); } catch {   }
          };
          try {
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          } catch {   }
          if (e.preventDefault) e.preventDefault();
        },
        onWheel: (e) => {
          const dir = (e.deltaY || 0) > 0 ? -0.1 : 0.1;
          onAvatarCropZoom((Number(sel.avatarCropZoom) || 1) + dir, true);
          if (e.preventDefault) e.preventDefault();
        },
      },
        React.createElement("img", {
          className: "we-crop__img",
          src: sel.avatarCropUrl,
          alt: "",
          draggable: false,
          style: {
            width: geo.dw + "px",
            height: geo.dh + "px",
            left: (view - geo.dw) / 2 + geo.dx + "px",
            top: (view - geo.dh) / 2 + geo.dy + "px",
          },
        }),
        React.createElement("span", { className: "we-crop__frame", "aria-hidden": "true" }),
      ),
      SliderRow(weT("缩放"), 100, 400, 5, Math.round((Number(sel.avatarCropZoom) || 1) * 100),
        (v, live) => onAvatarCropZoom(v / 100, live), "%", "avatar-crop-zoom"),
      React.createElement("div", { className: "we-crop__actions" },
        React.createElement("button", {
          className: "we-picker__btn", type: "button", onClick: onAvatarCropCancel,
        }, weT("取消")),
        React.createElement("button", {
          className: "we-picker__btn we-picker__btn--primary", type: "button",
          disabled: sel.avatarBusy === sel.avatarCropSide,
          onClick: onAvatarCropConfirm,
        }, sel.avatarBusy === sel.avatarCropSide ? weT("导入中…") : weT("确认并导入")),
      ),
    ),
  );
}

function avatarOverflowRow(sel, acts) {
  const info = sel.avatarOverflow;
  if (!info) return null;

  const dims = { w: info.width, h: info.height, mb: humanMb(info.bytes) };
  const why = info.overBytes && info.overEdge
    ? weT("原图 {w}×{h}、{mb}，同时超过 1024×1024 与 4 MB 上限", dims)
    : info.overEdge
      ? weT("原图 {w}×{h}，超过 1024×1024 上限", dims)
      : weT("原图 {mb}，超过 4 MB 上限", dims);
  const busy = sel.avatarCompressing === true;
  return React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap we-avatar-overflow", key: "avatar-overflow" },
    React.createElement("span", { className: "we-picker__hint we-avatar-error" },
      weT("这张图无法直接导入：{why}。", { why: why })),
    React.createElement("span", { className: "we-picker__hint" },
      weT("可以点下面的按钮自动压缩后再导入：等比缩到 1024×1024 以内、优先 PNG 无损编码（只有 PNG 装不下才转视觉无损 WebP），压缩完仍然让你先裁切、可取消。")),
    React.createElement("button", {
      className: "we-picker__btn we-picker__btn--primary",
      type: "button",
      disabled: busy,
      onClick: () => acts.onAutoCompress(),
    }, busy ? weT("压缩中…") : weT("自动压缩后导入")),
  );
}

function renderAvatarIsland(ctx) {
  const { sel, onAvatarEnabled, onAvatarSize, onAvatarRadius, onAvatarPick, onAvatarClear } = ctx;
  const on = sel.avatarEnabled === true;
  return React.createElement(React.Fragment, null,
    switchRow(weT("启用自定义会话头像"), on, onAvatarEnabled,
      { key: "avatar-on", hint: weT("给会话双方配上头像，消息像好友聊天一样左右分列") }),
    React.createElement("span", { className: "we-picker__hint", key: "avatar-what" },
      weT("开启后：你的消息靠右侧、带你的头像；助手的消息靠左侧、带助手的头像。图片只保存在本机（导入时会缩到 1024px 以内）；JPG / PNG / WebP 直接导入，SVG / GIF / BMP / AVIF 会在导入时转成位图。超过 1024×1024 或 4 MB 的图会被拦下，可选择自动压缩后导入。没导入就用内置的默认头像。关掉这个开关，会话立刻恢复原样。")),
    on && AVATAR_SIDE_ROWS.map((side) => avatarSideRow(side, sel, {
      onPick: onAvatarPick,
      onClear: onAvatarClear,
    })),
    on && SliderRow(weT("头像大小"), AVATAR_SIZE_MIN, AVATAR_SIZE_MAX, 1, sel.avatarSize, onAvatarSize, "px", "avatar-size"),
    on && SliderRow(weT("圆角强度"), AVATAR_RADIUS_MIN, AVATAR_RADIUS_MAX, 1, sel.avatarRadius, onAvatarRadius, "%", "avatar-radius",
      { tooltip: weT("100% = 正圆（默认），50% = 大圆角方块，0% = 直角方形") }),
    on && avatarOverflowRow(sel, { onAutoCompress: ctx.onAvatarAutoCompress }),
    on && sel.avatarError
      && React.createElement("div", { className: "we-picker__hint we-avatar-error", key: "avatar-err" }, sel.avatarError),

    renderAvatarCropModal(ctx),
  );
}

const AVATAR_EXTENSION_MODULE = {
  id: 'avatar',

  resetGroup: 'avatar',
  get title() { return weT("自定义会话头像"); },
  get desc() { return weT("给会话双方各配一张头像，消息像好友聊天一样左右分列（默认关）"); },
  render: renderAvatarIsland,
};

export { AVATAR_EXTENSION_MODULE, renderAvatarIsland };
