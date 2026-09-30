import type {
      FighterTransformationConfig,
      TransformationTrigger,
} from "../types/fighter";

export type TransformationState = "base" | "transforming" | "transformed";

/** Owns a fighter's one-way, deterministic transformation state. */
export class TransformationController {
      private state: TransformationState = "base";
      private stepIndex = 0;
      private stepElapsedMs = 0;

      constructor(
            public readonly config: FighterTransformationConfig | null,
      ) {}

      get currentState(): TransformationState {
            return this.state;
      }

      get isTransformed(): boolean {
            return this.state === "transformed";
      }

      get isTransforming(): boolean {
            return this.state === "transforming";
      }

      get currentPose(): string | null {
            return this.isTransforming
                  ? this.config?.sequence?.[this.stepIndex]?.pose ?? null
                  : null;
      }

      /** Evaluates automatic triggers. Returns true only on the transition tick. */
      update(currentHealth: number, maxHealth: number, deltaMs = 0): boolean {
            if (!Number.isFinite(deltaMs) || deltaMs < 0) {
                  throw new Error("Transformation deltaMs must be finite and non-negative.");
            }
            if (this.isTransforming) {
                  if (currentHealth <= 0) return false;
                  this.stepElapsedMs += deltaMs;
                  const sequence = this.config?.sequence ?? [];
                  while (this.stepIndex < sequence.length &&
                        this.stepElapsedMs >= sequence[this.stepIndex].durationMs) {
                        this.stepElapsedMs -= sequence[this.stepIndex].durationMs;
                        this.stepIndex++;
                  }
                  if (this.stepIndex === sequence.length) this.state = "transformed";
                  return false;
            }
            if (
                  this.isTransformed ||
                  !this.config ||
                  currentHealth <= 0 ||
                  maxHealth <= 0
            ) {
                  return false;
            }
            if (!this.isTriggered(this.config.trigger, currentHealth, maxHealth)) {
                  return false;
            }
            return this.transform();
      }

      /** Allows future behaviors and actions to initiate a configured transformation. */
      transform(): boolean {
            if (this.state !== "base" || !this.config) return false;
            this.state = this.config.sequence?.length ? "transforming" : "transformed";
            return true;
      }

      reset(): void {
            this.state = "base";
            this.stepIndex = 0;
            this.stepElapsedMs = 0;
      }

      private isTriggered(
            trigger: TransformationTrigger,
            currentHealth: number,
            maxHealth: number,
      ): boolean {
            switch (trigger.type) {
                  case "health-threshold":
                        return currentHealth / maxHealth <= trigger.healthRatio;
            }
      }
}
