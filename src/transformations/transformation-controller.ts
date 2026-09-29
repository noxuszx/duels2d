import type {
      FighterTransformationConfig,
      TransformationTrigger,
} from "../types/fighter";

export type TransformationState = "base" | "transformed";

/** Owns a fighter's one-way, deterministic transformation state. */
export class TransformationController {
      private state: TransformationState = "base";

      constructor(
            public readonly config: FighterTransformationConfig | null,
      ) {}

      get currentState(): TransformationState {
            return this.state;
      }

      get isTransformed(): boolean {
            return this.state === "transformed";
      }

      /** Evaluates automatic triggers. Returns true only on the transition tick. */
      update(currentHealth: number, maxHealth: number): boolean {
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
            if (this.isTransformed || !this.config) return false;
            this.state = "transformed";
            return true;
      }

      reset(): void {
            this.state = "base";
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
