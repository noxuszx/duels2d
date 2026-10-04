import type { Entity } from "./entity";
import type { CancellationReason, ContactEvent, RuntimeTrace } from "./contracts";
import type { ScriptOperation } from "./scripting/operation";
import { ScriptScope } from "./scripting/scope";

export interface MoveDefinition { id: string; cooldownMs: number; }
export type TaskGenerator = Generator<ScriptOperation, void, unknown>;

export type TaskRejectionReason =
      | "busy" | "cooldown" | "status-blocked" | "invalid-target"
      | "inactive" | "noop" | "rejected" | "resource-conflict";

export type TaskState = "running" | "completed" | "cancelled" | "rejected";
export interface TaskHandle {
      readonly state: TaskState;
      readonly reason: CancellationReason | TaskRejectionReason | null;
      cancel(reason?: CancellationReason): void;
}
export type TaskStartResult =
      | { started: true; handle: TaskHandle }
      | { started: false; reason: TaskRejectionReason };

export interface BehaviorHost {
      now(): number;
      entities(): readonly Entity[];
      isCombatActive(): boolean;
      trace?(event: RuntimeTrace): void;
}

interface ActiveTask {
      move: MoveDefinition;
      generator: TaskGenerator;
      operation: ScriptOperation | null;
      scope: ScriptScope | null;
      admittedAtMs: number;
      committed: boolean;
      handle: MutableTaskHandle;
      startFailure: TaskRejectionReason | null;
}

interface MutableTaskHandle extends TaskHandle {
      state: TaskState;
      reason: CancellationReason | TaskRejectionReason | null;
}

const MAX_IMMEDIATE_STEPS = 1024;

/** One foreground simulation task per entity; components may tick independently. */
export class BehaviorRuntime {
      private current: ActiveTask | null = null;
      private readonly lastUseTimes = new Map<string, number>();
      private closing = false;
      private admitting = false;
      private dispatching = false;
      private disposed = false;

      constructor(readonly owner: Entity, private readonly host: BehaviorHost) { }

      get isRunning(): boolean { return this.current !== null; }
      get isBusy(): boolean { return this.current !== null; }
      get currentMove(): MoveDefinition | null { return this.current?.move ?? null; }

      readiness(move: MoveDefinition, target: Entity | null, allowInterrupt = false): TaskRejectionReason | null {
            if (this.disposed || this.closing || !this.isOwnerLive()) return "inactive";
            if ((!allowInterrupt && this.current) || this.admitting) return "busy";
            if (!move || !move.id || !Number.isFinite(move.cooldownMs) || move.cooldownMs < 0) return "rejected";
            if (target && !this.isLiveEnemy(target)) return "invalid-target";
            if (!this.owner.statuses.canStartCast) return "status-blocked";
            const nowMs = this.host.now();
            if (!Number.isFinite(nowMs)) return "inactive";
            if (nowMs - (this.lastUseTimes.get(move.id) ?? -Infinity) + 1e-9 < move.cooldownMs) return "cooldown";
            return null;
      }

      start(move: MoveDefinition, target: Entity | null, createGenerator: () => TaskGenerator,): TaskStartResult {

            const failure = this.readiness(move, target);
            if (failure) {
                  this.trace("rejected", move?.id ?? "", failure);
                  return { started: false, reason: failure };
            }

            this.admitting = true;
            let generator: TaskGenerator;
            try { generator = createGenerator(); }
            finally { this.admitting = false; }
            let active: ActiveTask;
            const handle: MutableTaskHandle = {
                  state: "running", reason: null,
                  cancel: reason => this.cancelTask(active, reason ?? "interrupted"),
            };

            active = {
                  move, generator, operation: null, scope: null,
                  admittedAtMs: this.host.now(), committed: false,
                  handle, startFailure: null,
            };
            
            this.current = active;
            this.trace("admitted", move.id);
            try { this.drain(active, 0); }
            catch (error) { this.cancelTask(active, "interrupted"); throw error; }
            if (active.startFailure) return { started: false, reason: active.startFailure };
            if (!active.committed && active.handle.state === "cancelled") {
                  return { started: false, reason: "inactive" };
            }
            return { started: true, handle };
      }

      update(deltaMs: number): void {
            const active = this.current;
            if (!active) return;
            if (!this.ensureActive(active)) return;
            if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
            try { this.drain(active, deltaMs); }
            catch (error) { this.cancelTask(active, "interrupted"); throw error; }
      }

      contact(event: ContactEvent): void {
            const active = this.current;
            if (!active || !this.ensureActive(active) || this.dispatching) return;
            this.dispatching = true;
            try { active.operation?.contact?.(event); }
            catch (error) { this.cancelTask(active, "interrupted"); throw error; }
            finally { this.dispatching = false; }
            if (this.current === active) {
                  try { this.drain(active, 0); }
                  catch (error) { this.cancelTask(active, "interrupted"); throw error; }
            }
      }

      cancel(reason: CancellationReason): void {
            if (reason === "removed") this.disposed = true;
            if (reason === "reset") this.lastUseTimes.clear();
            const active = this.current;
            if (active) this.cancelTask(active, reason);
      }

      private drain(active: ActiveTask, deltaMs: number): void {
            let remainingMs = deltaMs;
            let immediateSteps = 0;
            while (this.current === active) {
                  if (++immediateSteps > MAX_IMMEDIATE_STEPS) {
                        throw new Error("Task exceeded the immediate operation limit");
                  }
                  if (!this.ensureActive(active)) return;
                  if (active.operation?.isComplete) this.completeOperation(active);
                  if (!this.ensureActive(active)) return;
                  if (!active.operation) {
                        const next = active.generator.next();
                        if (!this.ensureActive(active)) return;
                        if (next.done) {
                              this.complete(active);
                              return;
                        }
                        const operation = next.value;
                        if (!operation || typeof operation.start !== "function" ||
                              typeof operation.advance !== "function") {
                              throw new TypeError("Task yielded an invalid operation");
                        }
                        active.operation = operation;
                        const scope = new ScriptScope();
                        active.scope = scope;
                        const accepted = operation.start(scope);
                        if (!this.ensureActive(active)) return;
                        if (!accepted) {
                              const reason = operation.rejectionReason ?? "rejected";
                              active.startFailure = reason;
                              this.reject(active, reason);
                              return;
                        }
                        if (!active.committed) {
                              active.committed = true;
                              this.lastUseTimes.set(active.move.id, active.admittedAtMs);
                        }
                        this.trace("operation-started", active.move.id);
                        if (operation.isComplete) continue;
                  }
                  const operation = active.operation;
                  if (!operation || remainingMs <= 0) return;
                  const consumed = operation.advance(remainingMs);
                  if (!this.ensureActive(active)) return;
                  if (!Number.isFinite(consumed) || consumed < 0 || consumed > remainingMs) {
                        throw new RangeError("Operation returned invalid consumed time");
                  }
                  const beforeMs = remainingMs;
                  remainingMs -= consumed;
                  if (consumed > 0 && beforeMs === remainingMs) {
                        throw new Error("Operation consumed too little time to advance tick");
                  }
                  if (consumed > 0) immediateSteps = 0;
                  if (operation.isComplete) continue;
                  if (consumed === 0) throw new Error("Operation made no progress");
                  if (remainingMs <= 0) return;
            }
      }

      private completeOperation(active: ActiveTask): void {
            const operation = active.operation;
            const scope = active.scope;
            active.operation = null;
            active.scope = null;
            scope?.release();
            this.trace("operation-completed", active.move.id, operation?.endReason);
      }

      private complete(active: ActiveTask): void {
            if (this.current !== active) return;
            this.current = null;
            if (!active.committed) {
                  active.startFailure = "noop";
                  active.handle.state = "rejected";
                  active.handle.reason = "noop";
                  this.trace("rejected", active.move.id, "noop");
            } else {
                  active.handle.state = "completed";
                  this.trace("completed", active.move.id);
            }
      }

      private reject(active: ActiveTask, reason: TaskRejectionReason): void {
            if (this.current !== active) return;
            active.handle.state = "rejected";
            active.handle.reason = reason;
            this.stop(active, "interrupted");
            this.trace("rejected", active.move.id, reason);
      }

      private cancelTask(active: ActiveTask, reason: CancellationReason): void {
            if (this.current !== active) return;
            active.handle.state = "cancelled";
            active.handle.reason = reason;
            this.stop(active, reason);
            this.trace("cancelled", active.move.id, reason);
      }

      private stop(active: ActiveTask, reason: CancellationReason): void {
            if (this.current !== active) return;
            this.closing = true;
            this.current = null;
            const operation = active.operation;
            const scope = active.scope;
            active.operation = null;
            active.scope = null;
            try { operation?.cancel(reason); }
            finally {
                  try { scope?.release(); }
                  finally {
                        try { active.generator.return(undefined); }
                        finally { this.closing = false; }
                  }
            }
      }

      private ensureActive(active: ActiveTask): boolean {
            if (this.current !== active) return false;
            if (!this.isOwnerLive()) {
                  this.cancelTask(active, this.owner.isDead ? "death" : this.owner.isRemoved ? "removed" : "match-ended");
                  return false;
            }
            if (!this.owner.statuses.canContinueCast) {
                  this.cancelTask(active, "interrupted");
                  return false;
            }
            return true;
      }

      private isOwnerLive(): boolean {
            return !this.disposed && this.owner.isAlive && this.host.isCombatActive() &&
                  this.host.entities().includes(this.owner);
      }

      private isLiveEnemy(target: Entity): boolean {
            return target.isAlive && target.tags.has("targetable") && target !== this.owner && target.teamId !== this.owner.teamId &&
                  this.host.entities().includes(target);
      }

      private trace(kind: RuntimeTrace["kind"], moveId: string, reason?: string): void {
            this.host.trace?.({ kind, entityId: this.owner.runtimeId, moveId, reason });
      }
}
