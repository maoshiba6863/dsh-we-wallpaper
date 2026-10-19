  function renderEffectsSlidersSection(ctx) {
    const { onBackgroundBrightness, onBackgroundContrast, onBackgroundSaturate, onLayerPositionX, onLayerPositionY, onLayerReset, onLayerScale, onScrim, onWallpaperBlur, onWallpaperOpacity, sel } = ctx;
    return React.createElement(React.Fragment, null,
      SliderRow(weT("壁纸模糊"), 0, 60, 1, sel.wallpaperBlur, onWallpaperBlur, sel.wallpaperBlur + "px"),
      SliderRow(weT("亮度"), 40, 160, 5, sel.backgroundBrightness, onBackgroundBrightness, sel.backgroundBrightness + "%"),
      SliderRow(weT("对比度"), 40, 200, 5, sel.backgroundContrast, onBackgroundContrast, sel.backgroundContrast + "%"),
      SliderRow(weT("饱和度"), 0, 200, 5, sel.backgroundSaturate, onBackgroundSaturate, sel.backgroundSaturate + "%"),

      SliderRow(weT("水平"), 0, 100, 1, sel.layerPositionX, onLayerPositionX, "%", "layer-pos-x", {
        tooltip: weT("整屏百分比偏移：50 = 中心，0/100 = 两端（与 Wallpaper Engine 自带的同名滑条同义）；双击标签回中心。"),
        numberEdit: true,
        onLabelDoubleClick: () => onLayerReset("x"),
      }),
      SliderRow(weT("垂直"), 0, 100, 1, sel.layerPositionY, onLayerPositionY, "%", "layer-pos-y", {
        tooltip: weT("整屏百分比偏移：50 = 中心，0/100 = 两端（与 Wallpaper Engine 自带的同名滑条同义）；双击标签回中心。"),
        numberEdit: true,
        onLabelDoubleClick: () => onLayerReset("y"),
      }),
      SliderRow(weT("缩放"), 50, 150, 1, sel.layerScale, onLayerScale, "%", "layer-scale", {
        tooltip: weT("100 = 原大小；95 = 缩到 95%（四周露出页面底色）；105 = 放大到 105%；双击标签回 100%。"),
        numberEdit: true,
        onLabelDoubleClick: () => onLayerReset("s"),
      }),

      SliderRow(weT("壁纸透明度"), 0, 90, 5, sel.wallpaperOpacity, onWallpaperOpacity, sel.wallpaperOpacity + "%", "wallpaper-opacity", {
        tooltip: weT("壁纸向原生底色淡出（浅色纯白 / 深色纯黑）；透明生效时壁纸层会垫这层原生底色，以保证玻璃模糊不被透明背景破坏。场景壁纸的垫底实时帧会在实时画面出场后退场，不会在淡出时透出来"),
      }),
      SliderRow(weT("暗化"), 0, 90, 5, Math.round(sel.scrim * 100), onScrim, Math.round(sel.scrim * 100) + "%"),
    );
  }

  function renderEffectsLiveSection(ctx) {
    const { onLiveBootDelay, onSceneLiveFps, onToggleSceneLive, sel } = ctx;
    return React.createElement(React.Fragment, null,

      (sel.type === "scene" || sel.type === "web") && switchRow(
        sel.type === "web" ? weT("网页实时渲染") : weT("场景实时渲染"),
        sel.sceneLive !== false, onToggleSceneLive, {
        key: "scene-live",
        hint: weT("WebGL 实时渲染 · 失败自动降级"),
        tooltip: sel.type === "web"
          ? weT("网页壁纸由 WebWallGL 加载并注入 WE API（音频/属性监听等），严格沙箱隔离（不继承宿主权限）；加载失败或运行失联时自动退回兼容 iframe。重新开启会重试此前失败的壁纸")
          : weT("场景壁纸由 WebWallGL 实时渲染（粒子/脚本/视差/包内音频）；加载失败或运行失联时自动退回内嵌视频 / 实时帧。重新开启会重试此前失败的壁纸"),
      }),
      (sel.type === "scene" || sel.type === "web") && sel.sceneLive !== false
        && React.createElement("div", { className: "we-picker__ctl", key: "live-boot-delay" },
        ctlText(weT("启动最长等待时间")),
        React.createElement("div", { className: "we-picker__seg" },
          [0, 3, 5, 10].map((secs) =>
            React.createElement("button", {
              key: secs,
              className: "we-picker__btn we-picker__rate" + (Number(sel.liveBootDelay) === secs ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onLiveBootDelay(secs),
            }, secs === 0 ? weT("立即") : "≤" + secs + "s"),
          ),
        ),
      ),
      (sel.type === "scene" || sel.type === "web") && sel.sceneLive !== false
        && (sel.sceneLiveSrc || sel.webLiveSrc)
        && React.createElement("div", { className: "we-picker__ctl", key: "scene-live-fps" },
        ctlText(weT("实时渲染帧率"), weT("渲染 fps · 越低越省电")),
        React.createElement("div", { className: "we-picker__seg" },
          SCENE_LIVE_FPS_VALUES.map((f) =>
            React.createElement("button", {
              key: f,
              className: "we-picker__btn we-picker__rate" + (sel.sceneLiveFps === f ? " we-picker__rate--active" : ""),
              type: "button",

              onClick: () => onSceneLiveFps(f),
            }, f + "fps"),
          ),
        ),
      ),
    );
  }

  function renderEffectsSourceSection(ctx) {
    const { onClearCustomFrame, onClearGpuFrame, onCustomFrameFile, onRecaptureGpuFrame, onRefreshFrame, sel, surface } = ctx;
    const sidebarSurface = surface === "sidebar";
    const sceneWithFrame = sel.type === "scene" && Boolean(sel.sceneFrameUrl);
    const gpuPinnedHere = gpuFrameUi.wid === String(sel.id) && gpuFrameUi.pinned;
    return React.createElement(React.Fragment, null,

      !sidebarSurface && sel.type === "scene" && sel.sceneFrameUrl && !liveRenderEnabled(sel)
        && React.createElement("div", { className: "we-picker__ctl" },
        ctlText(weT("出图来源"), weT("这张画面从哪来"),
          weT("场景壁纸「这张画面从哪来」。两档：**实时画面**（有抓帧就用它，没有则留空）与**自定义画面**（手动导入的截图）。点一次切换一次，选择记忆在当前壁纸上。实时渲染生效时本行不显示（那时画面来自实时渲染，切这里不会生效）")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onRefreshFrame,
          "aria-label": weT("切换出图来源"),
        }, weT("切换")),
        React.createElement("span", { className: "we-picker__hint we-picker__value" },

          (() => {
            const v = Number(sel.frameVariants && sel.frameVariants[String(sel.id)]) || 0;
            const i = Math.max(0, FRAME_VARIANTS.findIndex((f) => f.id === v));
            return weT("第 {n}/{total} 档 · {label}", { n: i + 1, total: frameVariantCount(sel, String(sel.id)), label: weT(FRAME_VARIANTS[i].label) });
          })()),
      ),

      !sidebarSurface && sceneWithFrame && (gpuPinnedHere || liveRenderEnabled(sel))
        && React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("实时帧"),
          gpuPinnedHere
            ? weT("已抓帧 · 优先于全部画面档位")
            : weT("实时渲染中 · 可随时抓一张"),
          weT("实时渲染成功后会自动抓帧缓存这一帧（<key>_gpu.png），它优先于「出图来源」的自动档；切换壁纸途中、以及 live 首帧出来之前，屏幕上显示的就是它。「重新截」会按**当前**画面重抓一张（已存在的缓存会被替换，抓不到则原样保留）；「清除 GPU 帧」删掉缓存、回到「自动」：没有实时画面时是空态（不再**合成**任何「猜」出来的图）；唯一的例外是该帧连**加载都失败**、而壁纸有工程预览图时，退到预览图垫底（作者随包发布的图）。")),

        gpuPinnedHere && React.createElement("img", {
          className: "we-picker__frame-shot",
          src: framePreviewSrc(sel),
          alt: weT("当前壁纸实时帧预览"),
          title: weT("当前壁纸的实时帧（就是切换途中 / live 首帧前显示的那张静帧）{size}", { size: gpuFrameUi.w > 0 && gpuFrameUi.h > 0 ? " · " + gpuFrameUi.w + "×" + gpuFrameUi.h : "" }),
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onRecaptureGpuFrame,
          disabled: gpuFrameUi.recapturing,
          "aria-label": weT("重新截取当前壁纸实时帧"),
        }, gpuFrameUi.recapturing ? weT("抓帧中…") : weT("重新截")),
        gpuPinnedHere && React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onClearGpuFrame,
          "aria-label": weT("清除 GPU 实时帧缓存"),
        }, gpuFrameUi.busy ? weT("清除中…") : weT("清除 GPU 帧")),
        gpuPinnedHere && gpuFrameUi.w > 0
          && React.createElement("span", { className: "we-picker__hint we-picker__value" },
            gpuFrameUi.w + "×" + gpuFrameUi.h),
        gpuFrameUi.error
          && React.createElement("div", { className: "we-picker__hint" }, gpuFrameUi.error),
      ),

      !sidebarSurface && sel.type === "scene" && React.createElement("div", { className: "we-picker__ctl" },
        ctlText(weT("自定义画面"),
          weT("手动给电脑桌面截图，导入截图解决错误壁纸"),
          weT("手动对电脑桌面截图（壁纸显示效果的分辨率即最终展示画质），再回来点「导入画面…」选中该截图；导入后自动切换为该图，可随时切回「实时画面」档。实时渲染生效时它仍会作为「出图来源」的自定义档")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: () => { if (customFrameInput) customFrameInput.click(); },
        }, frameVariantCount(sel, String(sel.id)) === FRAME_VARIANTS.length ? weT("替换图片…") : weT("导入画面…")),
        frameVariantCount(sel, String(sel.id)) === FRAME_VARIANTS.length && React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onClearCustomFrame,
        }, weT("清除")),
        React.createElement("input", {
          type: "file",
          accept: "image/png,image/jpeg,image/webp",
          style: { display: "none" },
          ref: (el) => { customFrameInput = el; },
          onChange: onCustomFrameFile,
        }),
      ),
    );
  }

  function renderTranscodeProgress(sel) {
    return React.createElement("div", { className: "we-picker__row we-picker__prog", key: "transcode-prog" },
      React.createElement("div", {
        className: "we-picker__prog-track",
        role: "progressbar",
        "aria-label": weT("转码进度"),
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.max(0, Math.min(100, sel.transcodeProgress.percent || 0)),
      },
        React.createElement("div", {
          className: "we-picker__prog-bar",
          style: { width: Math.max(2, Math.min(100, sel.transcodeProgress.percent || 0)) + "%" },
        }),
      ),
      React.createElement("span", { className: "we-picker__hint" },
        sel.transcodeProgress.phase === "download"
          ? weT("下载 ffmpeg {percent}%", { percent: sel.transcodeProgress.percent || 0 })
          : sel.transcodeProgress.phase === "transcode" && sel.transcodeProgress.finalizing ? weT("收尾中…")
          : sel.transcodeProgress.phase === "transcode"
            ? weT("转码中 {percent}%{eta}", {
              percent: sel.transcodeProgress.percent || 0,
              eta: sel.transcodeProgress.eta ? weT(" · 约剩 {sec} 秒", { sec: sel.transcodeProgress.eta }) : "",
            })
          : sel.transcodeProgress.phase === "done" ? weT("即将完成…")
          : weT("准备中…"),
      ),
    );
  }

  function renderEffectsPlaybackSection(ctx) {
    const { onFpsCap, onPlaybackRate, sel, surface } = ctx;
    const sidebarSurface = surface === "sidebar";
    return React.createElement(React.Fragment, null,

      sel.type === "video"
        && React.createElement("div", { className: "we-picker__ctl", key: "rate" },
        ctlText(weT("倍速")),
        React.createElement("div", { className: "we-picker__seg" },
          [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) =>
            React.createElement("button", {
              key: rate,
              className: "we-picker__btn we-picker__rate" + (sel.playbackRate === rate ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onPlaybackRate(rate),
            }, String(rate).replace(/\.?0+$/, "") + "x"),
          ),
        ),
      ),

      !sidebarSurface && sel.type === "video"
        && React.createElement("div", { className: "we-picker__ctl", key: "fps" },
        ctlText(weT("帧率上限"), weT("抽帧转码 · 降低解码占用")),
        React.createElement("div", { className: "we-picker__seg" },
          FPS_CAP_VALUES.map((cap) =>
            React.createElement("button", {
              key: cap,
              className: "we-picker__btn we-picker__rate" + (sel.fpsCap === cap ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onFpsCap(cap),
            }, cap === 0 ? weT("无限制") : cap + "fps"),
          ),
        ),
      ),

      !sidebarSurface && sel.type === "video" && sel.mediaInfo && React.createElement("span", { className: "we-picker__hint", key: "media-info" },
        weT("源 {width}×{height}{fps}{codec}{state}", {
          width: sel.mediaInfo.width,
          height: sel.mediaInfo.height,
          fps: sel.mediaInfo.fps ? " · " + sel.mediaInfo.fps + "fps" : "",
          codec: sel.mediaInfo.codec ? " · " + weT(codecLabel(sel.mediaInfo.codec)) : "",
          state: sel.transcodeState === "working" ? weT(" · 抽帧准备中…")
            : sel.transcodeState === "ready" ? weT(" · 已切换至 {fps}fps 抽帧版（正常速度，解码占用约减半）", { fps: sel.fpsCap })
            : sel.transcodeState === "cached" ? weT(" · 抽帧版已就绪（下次切换到这张时生效）")
            : sel.transcodeState === "native" ? weT(" · 源帧率未知，未抽帧")
            : sel.transcodeState === "fallback" ? weT(" · 转码不可用，已回退原片")
            : sel.transcodeState === "skipped" ? weT(" · 源帧率 ≤ 上限，无需抽帧")
            : "",
        }),
      ),

      !sidebarSurface && sel.type === "video" && sel.transcodeState === "working" && sel.transcodeProgress
        && renderTranscodeProgress(sel),
    );
  }

  function renderEffectsFitSection(ctx) {
    const { onFlip, onObjectFit, sel } = ctx;
    return React.createElement(React.Fragment, null,

      React.createElement("div", { className: "we-picker__ctl", key: "fit" },
        ctlText(weT("适配")),
        React.createElement("div", { className: "we-picker__seg" },
          ["cover", "contain", "center", "fill"].map((mode) => {
            const label = { cover: weT("覆盖"), contain: weT("填充"), center: weT("居中"), fill: weT("拉伸") }[mode];
            return React.createElement("button", {
              key: mode,
              className: "we-picker__btn we-picker__rate" + (sel.objectFit === mode ? " we-picker__rate--active" : ""),
              type: "button",
              title: mode,
              onClick: () => onObjectFit(mode),
            }, label);
          }),
        ),
      ),

      switchRow(weT("水平翻转"), sel.flip, onFlip, { key: "flip" }),
    );
  }

export { renderEffectsSlidersSection, renderEffectsLiveSection, renderEffectsSourceSection, renderEffectsPlaybackSection, renderEffectsFitSection };
