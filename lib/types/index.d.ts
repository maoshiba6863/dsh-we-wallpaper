import type { Context } from '@deepseek-ai/cordis';

export interface WallpaperDescriptor {

  id: string;

  title: string;

  type: string;

  contentrating: string | null;

  playable: boolean;

  media: string | null;

  mediaExt: string | null;

  preview: string | null;

  frameUrl: string | null;

  schemeColor: string | null;

  sceneLive: boolean;

  sceneLiveSrc: string | null;

  scenePkgBytes: number;

  sceneVideo: string | null;

  sceneAudio: string | null;

  hasCustomFrame: boolean;

  webLive: boolean;

  webLiveSrc: string | null;

  propsUrl: string | null;

  liveFrame: string | null;
}

export interface PlaylistDescriptor {

  id: string;

  name: string;

  order: 'sequence' | 'random';

  delay: number | null;

  wallpaperIds: string[];

  total: number;

  portableCount: number;

  unresolvedCount: number;
}

export interface Inventory {

  installDir: string | null;

  uploadDir: string;

  cacheDir: string;

  weAssetsDir: string | null;

  weAssetsAvailable: boolean;

  sceneMediaBase: string;

  total: number;

  portableCount: number;

  wallpapers: WallpaperDescriptor[];

  playlists: PlaylistDescriptor[];
}

export declare const inject: string[];

export declare function apply(ctx: Context): () => void;

declare const plugin: { inject: string[]; apply: typeof apply };
export default plugin;
