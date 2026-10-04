import type { Entity } from "../../engine/entity";
import { statusDefinitions, type StatusId } from "./registry";
import type {
      StatusApplication, StatusApplyResult, StatusCapabilities,
      StatusContext, StatusDefinition, StatusInstanceState,
} from "./types";

interface ActiveStatus {
      id: StatusId;
      remainingMs: number;
      durationMs: number;
      stacks: number;
      sourceId: string | null;
      state: StatusInstanceState;
}

const DEFAULT_CAPABILITIES: StatusCapabilities = {
      canStartCast: true, canContinueCast: true, canMove: true,
};

/** Timed, owner-bound effects with data-driven restrictions and hooks. */
export class StatusController {
      private readonly active = new Map<StatusId, ActiveStatus>();
      private damageHandler: (amount: number, sourceId: string | null) => void;

      constructor(
            private readonly owner: Entity,
            damage: (amount: number, sourceId: string | null) => void,
            private readonly onCapabilitiesChanged: (
                  before: StatusCapabilities, after: StatusCapabilities,
            ) => void = () => {},
      ) { this.damageHandler = damage; }

      setDamageHandler(handler: (amount: number, sourceId: string | null) => void): void {
            this.damageHandler = handler;
      }

      get capabilities(): StatusCapabilities {
            const result = { ...DEFAULT_CAPABILITIES };
            for (const status of this.active.values()) {
                  const restrictions = (statusDefinitions[status.id] as StatusDefinition).restrictions;
                  if (restrictions?.canStartCast === false) result.canStartCast = false;
                  if (restrictions?.canContinueCast === false) result.canContinueCast = false;
                  if (restrictions?.canMove === false) result.canMove = false;
            }
            return result;
      }

      get canStartCast(): boolean { return this.capabilities.canStartCast; }
      get canContinueCast(): boolean { return this.capabilities.canContinueCast; }
      get canMove(): boolean { return this.capabilities.canMove; }

      apply(application: StatusApplication<StatusId>): StatusApplyResult {
            if (this.owner.isDead || this.owner.isRemoved) return { applied: false, reason: "owner-inactive" };
            if (!Object.prototype.hasOwnProperty.call(statusDefinitions, application?.id)) {
                  return { applied: false, reason: "unknown-status" };
            }
            if (!Number.isFinite(application.durationMs) || application.durationMs <= 0) {
                  return { applied: false, reason: "invalid-duration" };
            }
            const before = this.capabilities;
            const existing = this.active.get(application.id);
            const definition = statusDefinitions[application.id] as StatusDefinition;
            if (existing) {
                  existing.remainingMs = definition.refresh === "replace"
                        ? application.durationMs
                        : Math.max(existing.remainingMs, application.durationMs);
                  existing.durationMs = definition.refresh === "replace"
                        ? application.durationMs
                        : Math.max(existing.durationMs, application.durationMs);
                  if (definition.maxStacks) {
                        existing.stacks = Math.min(definition.maxStacks, existing.stacks + 1);
                  }
                  existing.sourceId = application.sourceId ?? existing.sourceId;
            } else {
                  const status: ActiveStatus = {
                        id: application.id,
                        durationMs: application.durationMs,
                        remainingMs: application.durationMs,
                        stacks: 1,
                        sourceId: application.sourceId ?? null,
                        state: { elapsedMs: 0, pulseMs: 0 },
                  };
                  this.active.set(status.id, status);
                  (statusDefinitions[status.id] as StatusDefinition).onApply?.(this.context(status), status.state);
            }
            this.onCapabilitiesChanged(before, this.capabilities);
            return { applied: true, refreshed: Boolean(existing) };
      }

      update(deltaMs: number): void {
            if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError("Invalid status tick");
            if (deltaMs === 0 || this.active.size === 0) return;
            const before = this.capabilities;
            for (const status of [...this.active.values()]) {
                  if (!this.active.has(status.id)) continue;
                  // Repeated fixed steps accumulate rounding error before an exact
                  // duration boundary (for example 60 ticks at 120 Hz = 500 ms).
                  const tolerance = Math.max(1e-9, Number.EPSILON *
                        Math.max(1, deltaMs, status.durationMs) * 8);
                  const expires = deltaMs + tolerance >= status.remainingMs;
                  const consumed = expires ? status.remainingMs : deltaMs;
                  status.remainingMs = expires ? 0 : status.remainingMs - consumed;
                  status.state.elapsedMs += consumed;
                  (statusDefinitions[status.id] as StatusDefinition).onTick?.(
                        this.context(status), status.state, consumed,
                  );
                  if (status.remainingMs <= 0 && this.active.delete(status.id)) {
                        (statusDefinitions[status.id] as StatusDefinition).onExpire?.(
                              this.context(status), status.state,
                        );
                  }
                  if (this.owner.isDead || this.owner.isRemoved) break;
            }
            this.onCapabilitiesChanged(before, this.capabilities);
      }

      clear(): void {
            const before = this.capabilities;
            const statuses = [...this.active.values()];
            this.active.clear();
            let failed = false;
            let firstError: unknown;
            for (const status of statuses) {
                  try {
                        (statusDefinitions[status.id] as StatusDefinition).onExpire?.(
                              this.context(status), status.state,
                        );
                  } catch (error) { if (!failed) firstError = error; failed = true; }
            }
            this.onCapabilitiesChanged(before, this.capabilities);
            if (failed) throw firstError;
      }

      list(): readonly Readonly<ActiveStatus>[] {
            return [...this.active.values()].map(status => ({
                  ...status, state: { ...status.state },
            }));
      }

      private context(status: ActiveStatus): StatusContext {
            return {
                  owner: this.owner,
                  sourceId: status.sourceId,
                  stacks: status.stacks,
                  damage: (amount, sourceId) => this.damageHandler(amount, sourceId),
            };
      }
}
