import type { ImageCrop, Vector2 } from "../../../src/types/fighter";
import type {
      DragState,
      EditableHitbox,
      StudioConfig,
      StudioState,
} from "./editor-types";
import { appendHistory, snapshotStudioState } from "./editor-history";

type History = { history: string[]; historyIndex: number };

function authoredSnapshot(snapshot: string): string {
      const {
            activePoseKey: _pose,
            activeForm: _form,
            ...document
      } = JSON.parse(snapshot) as StudioState;
      return JSON.stringify(document);
}

/** Restore authored fields without touching the source document or UI. */
export function restoreStudioState(
      config: StudioConfig,
      snapshot: string,
): { config: StudioConfig; state: StudioState } {
      const state = JSON.parse(snapshot) as StudioState;
      const { activePoseKey: _pose, activeForm: _form, ...fields } = state;
      return {
            config: {
                  ...structuredClone(config),
                  ...structuredClone(fields),
                  components: structuredClone(state.components),
                  moves: structuredClone(state.moves),
                  forms: structuredClone(state.forms),
                  lines: structuredClone(state.lines),
                  weaponIdle: state.weaponIdle,
                  weaponAttack: state.weaponAttack,
                  faceTarget: structuredClone(state.faceTarget),
                  hitboxOffset: structuredClone(
                        state.hitboxOffset ?? { x: 0, y: 0 },
                  ),
                  defaultFacing: state.defaultFacing ?? "right",
                  imageCrop: structuredClone(state.imageCrop ?? null),
                  poses: structuredClone(state.poses ?? null),
            },
            state: {
                  ...state,
                  activeForm: state.activeForm ?? "base",
                  activePoseKey: state.activePoseKey ?? "idle",
            },
      };
}

/** Owns editor state and independent undo stacks for each fighter. */
export class EditorSession {
      activeConfigIndex = 0;
      activePoseKey = "idle";
      activeForm: string = "base";
      mode: "default" | "crop" | "hitbox" = "default";
      cropDraft: ImageCrop | null = null;
      hitboxDraft: EditableHitbox | null = null;
      hitboxDraftOffset: Vector2 | null = null;
      dragState: DragState | null = null;
      isRestoring = false;
      private histories = new Map<string, History>();
      constructor(public configs: StudioConfig[]) {}
      currentConfig(): StudioConfig {
            return this.configs[this.activeConfigIndex];
      }
      private currentHistory(): History {
            const id = this.currentConfig().id;
            let entry = this.histories.get(id);
            if (!entry) {
                  entry = { history: [], historyIndex: -1 };
                  this.histories.set(id, entry);
            }
            return entry;
      }
      get history(): string[] {
            return this.currentHistory().history;
      }
      set history(value: string[]) {
            this.currentHistory().history = value;
      }
      get historyIndex(): number {
            return this.currentHistory().historyIndex;
      }
      set historyIndex(value: number) {
            this.currentHistory().historyIndex = value;
      }
      resetHistory(): void {
            this.history = [];
            this.historyIndex = -1;
            this.commit();
      }
      commit(): boolean {
            if (this.isRestoring) return false;
            const snapshot = snapshotStudioState(
                  this.currentConfig(),
                  this.activePoseKey,
                  this.activeForm,
            );
            const previous = this.history[this.historyIndex];
            // Selection belongs in restore metadata, but is not an authored edit.
            if (
                  previous &&
                  authoredSnapshot(snapshot) === authoredSnapshot(previous)
            )
                  return false;
            Object.assign(
                  this.currentHistory(),
                  appendHistory(this.history, this.historyIndex, snapshot),
            );
            return true;
      }
      restore(snapshot: string): StudioState {
            const restored = restoreStudioState(this.currentConfig(), snapshot);
            // Preserve references held by tools and panels.
            Object.assign(this.currentConfig(), restored.config);
            this.activePoseKey = restored.state.activePoseKey;
            this.activeForm = restored.state.activeForm;
            this.clearDrafts();
            return restored.state;
      }
      clearDrafts(): void {
            this.mode = "default";
            this.cropDraft = null;
            this.hitboxDraft = null;
            this.hitboxDraftOffset = null;
            this.dragState = null;
      }
      undo(): StudioState | null {
            if (this.historyIndex <= 0) return null;
            this.historyIndex--;
            return this.restore(this.history[this.historyIndex]);
      }
      redo(): StudioState | null {
            if (this.historyIndex >= this.history.length - 1) return null;
            this.historyIndex++;
            return this.restore(this.history[this.historyIndex]);
      }
}
