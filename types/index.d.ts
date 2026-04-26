export interface FlipbookProgress {
  frame: number;
  total: number;
  percent: number;
}

export interface FlipbookOptions {
  id: string;
  path: string;
  filename: string;
  extension: string;
  count?: number;
  rows?: number[];
  sprite?: boolean;
  speed?: number;
  cover?: boolean;
  gif?: boolean;
  progress?: (data: FlipbookProgress) => void;
  loaded?: () => void;
}

export interface CanvidVideo {
  src: string;
  frames: number;
  cols: number;
  fps?: number;
  loops?: number;
  onEnd?: () => void;
}

export interface CanvidOptions {
  selector?: string | Element;
  videos: Record<string, CanvidVideo>;
  width?: number;
  height?: number;
  srcGif?: string;
  loaded?: (control: CanvidControl) => void;
}

export interface CanvidControl {
  play: (key: string, reverse?: boolean, fps?: number) => void;
  pause: () => void;
  resume: () => void;
  destroy: () => void;
  isPlaying: () => boolean;
  getCurrentFrame: () => number;
  setCurrentFrame: (frameNumber: number) => void | false;
}

export function flipbook(opts: FlipbookOptions): void;
export function canvid(opts: CanvidOptions): CanvidControl | undefined;

declare const _default: typeof flipbook;
export default _default;
