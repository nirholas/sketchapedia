/**
 * Wire-protocol types mirroring the Python GroundRequest / GroundResponse
 * schemas. Shape is a strict subset of the future `@sketchapedia/protocol`
 * Hitmap types — when that package lands these will be replaced by re-exports.
 */

export type Point = readonly [number, number];

export interface BBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type Region =
  | { readonly kind: 'bbox'; readonly bbox: BBox }
  | { readonly kind: 'polygon'; readonly polygon: ReadonlyArray<Point> };

export type AriaRole =
  | 'button'
  | 'link'
  | 'textbox'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'slider'
  | 'combobox'
  | 'listbox'
  | 'option'
  | 'tab'
  | 'tablist'
  | 'tabpanel'
  | 'menuitem'
  | 'progressbar'
  | 'status'
  | 'dialog'
  | 'region';

export interface HitmapItem {
  readonly id: string;
  readonly region: Region;
  readonly role?: AriaRole;
  readonly ariaLabel?: string;
  readonly ariaSummary?: string;
  readonly intent?: Record<string, unknown>;
  readonly input?: Record<string, unknown>;
  readonly tabIndex?: number;
  readonly disabled?: boolean;
  readonly autofocus?: boolean;
  readonly confidence?: number;
  readonly lowConfidence?: boolean;
}

export interface Hitmap {
  readonly items: ReadonlyArray<HitmapItem>;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly coordinateSpace?: 'viewport' | 'keyframe';
  readonly ariaSummary?: string;
  readonly form?: Record<string, unknown>;
  readonly modal?: boolean;
}

export type GroundingMode = 'auto' | 'florence' | 'grounding-dino';

export interface GroundRequest {
  readonly keyframeUrl?: string;
  readonly keyframeB64?: string;
  readonly hitmapDraft: Hitmap;
  readonly mode?: GroundingMode;
  readonly deadlineMs?: number;
  readonly requestId?: string;
}

export interface CorrectionDiagnostic {
  readonly id: string;
  readonly iou: number;
  readonly confidence: number;
  readonly accepted: boolean;
  readonly escalated: boolean;
  readonly matchedPhrase?: string | null;
}

export interface Diagnostics {
  readonly meanConfidence: number;
  readonly meanIou: number;
  readonly matchRate: number;
  readonly escalationRate: number;
  readonly deadlineHit: boolean;
  readonly latencyMs: number;
  readonly corrections: ReadonlyArray<CorrectionDiagnostic>;
  readonly keyframeHash: string;
}

export interface GroundResponse {
  readonly hitmap: Hitmap;
  readonly diagnostics: Diagnostics;
}

export type GroundEvent =
  | { readonly type: 'started'; readonly requestId: string }
  | { readonly type: 'loading' }
  | { readonly type: 'completed'; readonly response: GroundResponse }
  | { readonly type: 'error'; readonly message: string };
