import type { Fighter } from "../entities/fighter";
import type { CancellationReason } from "../gameplay/action-scope";
import type { FighterRuntimeComponent } from "../gameplay/fighter-runtime";

/** Owns one pose lease and its optional simulation-time expiry. */
export class TimedPoseSkill implements FighterRuntimeComponent {
      private releasePose: (() => void) | null = null;
      private remaining: number | null = null;
      private closed = false;

      constructor(
            private readonly fighter: Fighter,
            private readonly preserveOnCancel: (reason: CancellationReason) => boolean = () => false,
      ) {}

      get remainingMs(): number | null { return this.remaining; }
      get isHoldingPose(): boolean { return this.releasePose !== null; }

      /** Acquire a pose for a duration, or omit durationMs to hold it until clear/cancel. */
      acquirePose(pose: string, durationMs?: number): void {
            if (this.closed) return;
            this.clear();
            this.releasePose = this.fighter.presentation.acquirePose(pose);
            this.remaining = Number.isFinite(durationMs) ? Math.max(0, durationMs!) : null;
            if (this.remaining === 0) this.clear();
      }

      update(deltaMs: number): void {
            if (this.closed || this.remaining === null || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
            this.remaining = Math.max(0, this.remaining - deltaMs);
            if (this.remaining === 0) this.clear();
      }

      clear(): void {
            this.releasePose?.();
            this.releasePose = null;
            this.remaining = null;
      }

      cancel(reason: CancellationReason): void {
            if (this.preserveOnCancel(reason)) return;
            this.clear();
            if (reason === "removed") this.closed = true;
      }
}
