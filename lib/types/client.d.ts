import type { Context } from '@deepseek-ai/cordis';

export declare const inject: string[];

export declare function apply(ctx: Context): void;

export interface WallpaperEngineClientPlugin {
  apply: typeof apply;
  inject: typeof inject;
}

declare global {
  interface Window {

    __wpStats: { frame: () => any };

    __wp: {
      setWallpaper(cfg: any): void;
      pause(): void;
      resume(): void;
      setFit(fit: any): void;
      setVolume(v: any): void;
      release(): void;
      restore(): void;
      setRenderDpr(dpr: any): void;
      setSceneFps(fps: any): void;
      setQuality(patch: any): void;
      getQuality(): any;
      setFilter(id: any): void;
      updateWebProps(wire: any): void;
      pushPointer(u: any, v: any, buttons: any, mods: any): void;
      pointerLeave(): void;
      pushWheel(dx: any, dy: any, mode: any, mods: any): void;
      loadSceneFile(file: any, project: any): void;
      setAudioBridge(fn: any): void;
      capture(maxWidth: any): any;
      getProperties(): any;
      setMedia(init: any): void;
      setMediaControl(controls: any): void;
      setOcclusion(payload: any): void;
      getOcclusion(): any;
      getState(): any;
    };

    __weSetOcclusion: (payload: any) => void;

    __weOcclusionBridge: number;

    __weFocusGuard: {
      calls: number;
      blocked: number;
      allowed: number;
      installed: boolean;
      allow: boolean;
      elCalls: number;
      elAllowed: number;
      elBlocked: number;
      elInstalled: boolean;
      gestureAt: number;
      gestureWindowMs: number;
      elLastBlockedAt: number;
      elLastBlockedStack: string;
    };
  }
}
