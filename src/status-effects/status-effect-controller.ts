import { STATUS_EFFECT_DEFINITIONS } from "./definitions";
import type {
      ActiveStatusEffect,
      StatusApplicationResult,
      StatusCapabilities,
      StatusEffectApplication,
      StatusEffectId,
} from "./types";

interface MutableActiveStatusEffect {
      effect: StatusEffectId;
      sourceId: string | null;
      durationMs: number;
      remainingMs: number;
}

const DEFAULT_CAPABILITIES: StatusCapabilities = Object.freeze({
      canStartAbilities: true,
      canContinueAbility: true,
      canUseMovement: true,
});

function isStatusEffectId(effect: unknown): effect is StatusEffectId {
      return typeof effect === "string" &&
            Object.prototype.hasOwnProperty.call(STATUS_EFFECT_DEFINITIONS, effect);
}

function isValidDuration(durationMs: number): boolean {
      return Number.isFinite(durationMs) && durationMs > 0;
}

/** Tracks timed effects using simulation time only. */
export class StatusEffectController {
      private readonly activeEffects = new Map<StatusEffectId, MutableActiveStatusEffect>();

      get capabilities(): StatusCapabilities {
            if (this.activeEffects.size === 0) return DEFAULT_CAPABILITIES;

            let canStartAbilities = true;
            let canContinueAbility = true;
            let canUseMovement = true;

            for (const active of this.activeEffects.values()) {
                  const capabilities = STATUS_EFFECT_DEFINITIONS[active.effect].capabilities;
                  canStartAbilities &&= capabilities.canStartAbilities;
                  canContinueAbility &&= capabilities.canContinueAbility;
                  canUseMovement &&= capabilities.canUseMovement;
            }

            return Object.freeze({
                  canStartAbilities,
                  canContinueAbility,
                  canUseMovement,
            });
      }

      get canStartAbilities(): boolean {
            return this.capabilities.canStartAbilities;
      }

      get canContinueAbility(): boolean {
            return this.capabilities.canContinueAbility;
      }

      get canUseMovement(): boolean {
            return this.capabilities.canUseMovement;
      }

      apply(application: StatusEffectApplication): StatusApplicationResult {
            if (!application || !isStatusEffectId(application.effect)) {
                  return { applied: false, reason: "unknown-effect" };
            }
            if (!isValidDuration(application.durationMs)) {
                  return { applied: false, reason: "invalid-duration" };
            }

            const current = this.activeEffects.get(application.effect);
            const durationMs = current
                  ? Math.max(application.durationMs, current.remainingMs)
                  : application.durationMs;
            this.activeEffects.set(application.effect, {
                  effect: application.effect,
                  sourceId: application.sourceId ?? null,
                  durationMs,
                  remainingMs: durationMs,
            });

            return { applied: true, refreshed: current !== undefined };
      }

      /** Advances every active effect by simulation milliseconds. */
      update(deltaMs: number): void {
            if (!Number.isFinite(deltaMs) || deltaMs < 0) {
                  throw new RangeError("Status-effect deltaMs must be finite and non-negative.");
            }
            if (deltaMs === 0 || this.activeEffects.size === 0) return;

            for (const [effect, active] of this.activeEffects) {
                  // Treat floating-point roundoff at a mathematical boundary as expiry.
                  const precisionTolerance =
                        Number.EPSILON * Math.max(1, deltaMs, active.remainingMs) * 4;
                  if (deltaMs + precisionTolerance >= active.remainingMs) {
                        this.activeEffects.delete(effect);
                  } else {
                        active.remainingMs -= deltaMs;
                  }
            }
      }

      clear(): void {
            this.activeEffects.clear();
      }

      getActiveEffects(): readonly ActiveStatusEffect[] {
            const snapshot = [...this.activeEffects.values()].map((active) =>
                  Object.freeze({ ...active }),
            );
            return Object.freeze(snapshot);
      }
}
