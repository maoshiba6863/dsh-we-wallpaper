  function renderWallpaperCurrentSection(ctx) {
    const { current, isLiveScene, onClear, onOpenPicker, onRefresh, onToggleAudio, onTogglePlay, onTogglePropsPanel, playbackLive, propsPanelOpen, renderUserPropsPanel, sel, setPickerOpener } = ctx;
    const rotGroup = videoRotationGroup(false);
    const rotationOn = !!(rotGroup && sel.rotationEnabled && sel.rotationGroupId === rotGroup.id);
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("当前壁纸")),
      ),
      React.createElement("div", { className: "we-picker__current" },
        React.createElement(VinylRecord, {
          cover: current && current.preview, title: current ? current.title : "",
          playing: playbackLive && Boolean(sel.url) && vinylSpinVisible(),
        }),
        React.createElement("div", { className: "we-picker__current-info" },
          React.createElement("div", { className: "we-picker__current-title", title: current ? current.title : "" },
            sel.id && current ? current.title : weT("未选择壁纸"),

            React.createElement("span", { className: "we-picker__current-meta" },
              current
                ? weT("{type}{status}", {
                    type: { video: weT("视频壁纸"), web: weT("网页壁纸"), image: weT("图片壁纸"), scene: weT(isLiveScene ? "场景壁纸（实时渲染）" : "场景壁纸（静态帧）") }[current.type] || weT("壁纸"),
                    status: weT(playbackLive ? " · 播放中" : " · 已暂停"),
                  })
                : weT("尚未选择壁纸"))),

          React.createElement("div", { className: "we-picker__current-sub" },

          sel.videoError && React.createElement("div", { className: "we-picker__current-error" }, sel.videoError),

          sel.blockedNote && React.createElement("div", { className: "we-picker__current-error" }, sel.blockedNote),

          liveFailReasonOf(sel) && React.createElement("div", { className: "we-picker__current-error" },
            weT("实时渲染失败（{reason}），已自动回退；重新打开「实时渲染」开关可重试", { reason: weT(liveFailReasonOf(sel)) }))
          ),
        ),

        React.createElement("div", { className: "we-picker__current-actions" },
          React.createElement("button", {
            className: "we-picker__btn we-picker__btn--primary", type: "button",
            ref: setPickerOpener,
            onClick: onOpenPicker,
          }, weT("选择壁纸")),
        ),
      ),

      renderUserPropsPanel(),

      React.createElement("div", { className: "we-picker__row" },

        (current && (current.type === "scene" || current.type === "web") && sel.propsUrl)
          && React.createElement("button", {
            className: "we-picker__btn" + (propsPanelOpen ? " is-on" : ""),
            type: "button",
            title: weT("壁纸作者提供的可调属性（改动立即生效）"),
            onClick: onTogglePropsPanel,
          }, weT("壁纸属性")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onTogglePlay, disabled: !sel.url,

        }, playbackLive ? weT("暂停") : weT("播放", null, "play")),

        (sel.type === "video" || (sel.type === "scene" && (sel.sceneVideo || sel.sceneHasAudio)))
          && React.createElement("button", {
            className: "we-picker__btn" + (sel.videoAudioEnabled === false ? "" : " is-on"),
            type: "button",
            onClick: onToggleAudio,
            disabled: !sel.url,
            title: sel.videoAudioEnabled === false
              ? weT("开启壁纸音轨（音量为 0 时自动设为 50%）")
              : weT("关闭壁纸音轨（画面继续播放）"),
          }, sel.videoAudioEnabled === false ? weT("🔇 音乐关") : weT("🔊 音乐开")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onClear, disabled: !sel.id,
          title: weT("清除当前壁纸（停止播放，回到无壁纸状态）"),
        }, weT("清除")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onRefresh, disabled: sel.loading,
        }, sel.loading ? weT("刷新中…") : weT("刷新")),
        React.createElement("button", {
          className: "we-picker__btn" + (rotationOn ? " is-on" : ""),
          type: "button",
          onClick: toggleVideoRotation,
          title: weT("按下面勾选的视频自动轮播；间隔与参与的视频都在下方设置"),
        }, rotationOn ? weT("停止轮播") : weT("轮播")),
      ),
      renderWallpaperRotationBlock(sel),
    ),
    );
  }

  const ROTATION_INTERVALS = [1, 5, 10, 30, 60];

  function rotationMinutesLabel(minutes) {
    const n = Number(minutes) || 0;
    if (n >= 60 && n % 60 === 0) return weT("{n} 小时", { n: n / 60 });
    return weT("{n} 分钟", { n });
  }

  /* 轮播明细：只出现在「当前壁纸」这一节里，紧跟在操作按钮行之后。 */
  function renderWallpaperRotationBlock(sel) {
    const group = videoRotationGroup(false);
    const chosen = group && Array.isArray(group.wallpaperIds) ? group.wallpaperIds : [];
    const videos = videoWallpapers();
    const interval = group && Number(group.interval) > 0 ? Number(group.interval) : 5;
    return React.createElement("div", { className: "we-picker__rotation" },
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" },
          weT("轮播范围：下面勾选的视频 · 已选 {n} 个 · 每 {interval}切一张", {
            n: chosen.length, interval: rotationMinutesLabel(interval),
          }))),
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("间隔"), weT("等多久切到下一张")),
        React.createElement("div", { className: "we-picker__seg" },
          ROTATION_INTERVALS.map((m) => React.createElement("button", {
            key: m, type: "button",
            className: "we-picker__btn we-picker__rate" + (interval === m ? " we-picker__rate--active" : ""),
            onClick: () => onVideoRotationInterval(m),
          }, m >= 60 ? weT("{n}小时", { n: m / 60 }) : weT("{n}分", { n: m }))))),
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("参与轮播的视频"), weT("只轮播勾选的视频；WE 视频壁纸与上传的 MP4 都算"))),
      React.createElement("div", { className: "we-picker__rotation-list" },
        videos.length === 0
          ? React.createElement("div", { className: "we-picker__hint" },
            weT("没有可轮播的视频：上传 MP4，或安装视频类 Wallpaper Engine 壁纸"))
          : videos.map((w) => React.createElement("label", {
            key: w.id,
            className: "we-picker__rotation-item" + (chosen.indexOf(w.id) >= 0 ? " is-on" : ""),
          },
            React.createElement("input", {
              type: "checkbox",
              checked: chosen.indexOf(w.id) >= 0,
              onChange: () => onToggleRotationVideo(w.id),
            }),
            React.createElement("span", { className: "we-picker__rotation-name", title: w.title || "" }, w.title || w.id),
            React.createElement("span", { className: "we-picker__hint" },
              isUploadedWallpaper(w) ? weT("自定义") : weT("WE"))))),
    );
  }

  function renderWallpaperTransitionSection(ctx) {
    const { onSwitchTransition, onSwitchTransitionDir, onSwitchTransitionSpeed, sel } = ctx;
    const switchTr = switchTransitionOf(sel);
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("切换过场")),
      ),

      React.createElement("div", { className: "we-picker__ctl" },
        ctlText(weT("过场动画"), weT("换壁纸时的转场")),
        React.createElement("select", {
          className: "we-picker__select",
          value: sel.switchTransition,
          onChange: (e) => onSwitchTransition(e.target.value),
          "aria-label": weT("过场动画"),
        },
          ...SWITCH_TRANSITIONS.map((t) =>
            React.createElement("option", { key: t.id, value: t.id }, t.label)),
        ),
      ),

      switchTr.directional && React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("方向"), weT("新画面从哪边进")),
        React.createElement("div", { className: "we-picker__seg" },
          SWITCH_DIRS.map((d) =>
            React.createElement("button", {
              key: d,
              className: "we-picker__btn we-picker__rate" + (sel.switchTransitionDir === d ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onSwitchTransitionDir(d),
              "aria-pressed": sel.switchTransitionDir === d ? "true" : "false",
              "aria-label": weT("过场方向 {dir}", { dir: weT(SWITCH_DIR_LABELS[d]) }),
            }, SWITCH_DIR_LABELS[d]),
          ),
        ),
      ),

      switchTr.ms > 0 && React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("时长"), weT("当前约 {ms} ms", { ms: switchTr.ms })),
        React.createElement("div", { className: "we-picker__seg" },
          SWITCH_SPEEDS.map((s) =>
            React.createElement("button", {
              key: s.id,
              className: "we-picker__btn we-picker__rate" + (sel.switchTransitionSpeed === s.id ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onSwitchTransitionSpeed(s.id),
              "aria-pressed": sel.switchTransitionSpeed === s.id ? "true" : "false",
              "aria-label": weT("过场速度 {speed}", { speed: weT(s.label) }),
            }, s.label),
          ),
        ),
      ),
    ),
    );
  }

  function renderWallpaperUploadsSection(ctx) {
    const { armedConfirm, group, onArmConfirm, onCancelEditUploadDir, onCancelEditWeAssetsDir, onDisarmConfirm, onStartEditUploadDir, onStartEditWeAssetsDir, onUploadDirDraft, onWeAssetsDirDraft, playableCount, playableList, sel, uploadedList } = ctx;
    const uploadToken = (w) => "upload:" + w.id;
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("自定义壁纸")),
      ),
      React.createElement("div", { className: "we-picker__uploads" },

      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("存储位置")),
        React.createElement("span", {
          className: "we-picker__uploads-path",
        }, sel.inventory.uploadDir || "—"),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          disabled: sel.uploading,
          onClick: onStartEditUploadDir,
        }, weT("更改")),
      ),
      sel.editingUploadDir && React.createElement("div", { className: "we-picker__row" },
        React.createElement("input", {
          className: "we-picker__text", type: "text",
          value: sel.uploadDirDraft,
          placeholder: weT("绝对路径，如 D:\\MyWallpapers"),
          onInput: onUploadDirDraft,
          onKeyDown: (e) => {
            if (e.key === "Enter") changeUploadDir(sel.uploadDirDraft, true);
            if (e.key === "Escape") onCancelEditUploadDir();
          },
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          disabled: sel.uploading,
          onClick: () => changeUploadDir(sel.uploadDirDraft, true),
        }, weT("保存")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onCancelEditUploadDir,
        }, weT("取消")),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" },
          weT("已有文件会迁移到新位置")),
        React.createElement("span", { className: "we-picker__hint" },
          weT("支持 ~ 表示用户主目录")),
      ),

      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("官方资源路径")),
        React.createElement("span", {
          className: "we-picker__uploads-path",
        }, sel.inventory.weAssetsDir || "—"),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onStartEditWeAssetsDir,
        }, sel.inventory.weAssetsDir ? weT("更改") : weT("设置")),
      ),
      sel.editingWeAssetsDir && React.createElement("div", { className: "we-picker__row" },
        React.createElement("input", {
          className: "we-picker__text", type: "text",
          value: sel.weAssetsDirDraft,
          placeholder: weT("WE assets 绝对路径，留空保存=清除"),
          onInput: onWeAssetsDirDraft,
          onKeyDown: (e) => {
            if (e.key === "Enter") changeWeAssetsDir(sel.weAssetsDirDraft);
            if (e.key === "Escape") onCancelEditWeAssetsDir();
          },
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: () => changeWeAssetsDir(sel.weAssetsDirDraft),
        }, weT("保存")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onCancelEditWeAssetsDir,
        }, weT("取消")),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" },
          sel.inventory.weAssetsAvailable
            ? weT("已启用 · 场景实时渲染取官方像素")
            : (sel.inventory.weAssetsDir
              ? weT("目录不可用（缺 materials/），场景实时渲染走程序化复刻")
              : weT("未配置 · 场景实时渲染贴图走程序化复刻"))),
        React.createElement("span", { className: "we-picker__hint" },
          weT("指向 Wallpaper Engine 安装目录的 assets（或其拷贝）")),
      ),
      sel.weAssetsError && React.createElement("div", { className: "we-picker__error" },
        sel.weAssetsError,
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("自定义")),
        React.createElement("input", {
          className: "we-picker__file", type: "file",
          accept: ".jpg,.jpeg,.png,.mp4",
          disabled: sel.uploading,
          onChange: (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) uploadWallpaperFile(f);
            e.target.value = "";
          },
        }),
        sel.uploading && React.createElement("span", { className: "we-picker__hint" }, weT("上传中…")),
      ),
      sel.uploadError && React.createElement("div", { className: "we-picker__error" }, sel.uploadError),
      sel.uploadNote && React.createElement("div", { className: "we-picker__note" }, sel.uploadNote),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" }, weT("已上传 {count} 个", { count: uploadedList.length })),
        React.createElement("span", { className: "we-picker__hint" }, weT("支持 JPG / PNG / MP4，及含 project.json 的 WE 壁纸目录")),
      ),
      uploadedList.length > 0 && React.createElement("div", { className: "we-picker__uploads-list" },
        uploadedList.map((w) => React.createElement(React.Fragment, { key: w.id },
          React.createElement("div", { className: "we-picker__uploads-item" },
          React.createElement("span", { className: "we-picker__uploads-name", title: w.title }, w.title),
          React.createElement("span", { className: "we-picker__hint" }, w.type === "video" ? "MP4" : weT("图片")),
          React.createElement("button", {
            className: "we-picker__btn", type: "button",

            onClick: () => onArmConfirm(uploadToken(w)),
            disabled: sel.uploading || armedConfirm === uploadToken(w),
            title: armedConfirm === uploadToken(w)
              ? weT("已经问过你了 —— 在下面那一行选「确认」或「取消」")
              : weT("移除这个自定义壁纸（会再问一次，且会删除本地文件）"),
          }, weT("移除")),
          ),

          renderConfirmRow(armedConfirm, uploadToken(w),
            weT("移除自定义壁纸「{name}」？此操作会删除本地文件，且不可恢复。", { name: w.title }),
            () => removeUploadWallpaper(w.id), onDisarmConfirm),
        )),
      ),
      ),
    ),
    React.createElement("div", { className: "we-picker__row" },
      React.createElement("span", { className: "we-picker__hint" },
        (group
          ? weT("列表「{name}」：{count} 项 · {playable} 可播放 · 每 {interval} 分钟 · {order}{rotating}", {
            name: group.name,
            count: group.wallpaperIds.length,
            playable: playableCount,
            interval: group.interval,
            order: group.order === "random" ? weT("随机") : weT("顺序", null, "seq"),
            rotating: sel.rotationEnabled ? weT(" · 自动轮转中") : "",
          })
          : weT("{count} 个可播放壁纸{rotating}", { count: playableList.length, rotating: sel.rotationEnabled ? weT(" · 自动轮转中") : "" }))),
    ),
    );
  }

export { renderWallpaperCurrentSection, renderWallpaperTransitionSection, renderWallpaperUploadsSection };
