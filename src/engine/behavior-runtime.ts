import type { Entity } from "./entity";
import type { CancellationReason, ContactEvent, RuntimeTrace } from "./contracts";
import { OperationRejected, OperationRunner, type ScriptOperation } from "./scripting";

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
      /** Called after task cleanup for unhandled execution errors. */
      taskFailed?(error: unknown): void;
}

interface ActiveTask {
      move: MoveDefinition;
      runner: OperationRunner;
      admittedAtMs: number;
      committed: boolean;
      handle: MutableTaskHandle;
      startFailure: TaskRejectionReason | null;
}

interface MutableTaskHandle extends TaskHandle {
      state: TaskState;
      reason: CancellationReason | TaskRejectionReason | null;
}

/** One foreground simulation task per entity; components may tick independently. */
export class BehaviorRuntime {
      private current: ActiveTask | null = null;
      private readonly lastUseTimes = new Map<string, number>();
      private closing = false;
      private admitting = false;
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
                  move, runner: new OperationRunner(generator, {
                        ensureActive: () => this.ensureActive(active),
                        started: () => {
                              if (!active.committed) {
                                    active.committed = true;
                                    this.lastUseTimes.set(active.move.id, active.admittedAtMs);
                              }
                              this.trace("operation-started", active.move.id);
                        },
                        operationCompleted: reason => this.trace("operation-completed", active.move.id, reason),
                        completed: () => this.complete(active),
                        rejected: reason => this.reject(active, reason),
                        closed: () => { this.closing = false; },
                  }),
                  admittedAtMs: this.host.now(), committed: false,
                  handle, startFailure: null,
            };
            
            this.current = active;
            this.trace("admitted", move.id);
            try { active.runner.drain(0); }
            catch (error) { if (error instanceof OperationRejected) this.reject(active, error.reason); else this.fail(active, error); }
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
            try { active.runner.drain(deltaMs); }
            catch (error) { if (error instanceof OperationRejected) this.reject(active, error.reason); else this.fail(active, error); }
      }

      contact(event: ContactEvent): void {
            const active = this.current;
            if (!active || !this.ensureActive(active)) return;
            try { active.runner.contact(event); }
            catch (error) { if (error instanceof OperationRejected) this.reject(active, error.reason); else this.fail(active, error); }
      }

      cancel(reason: CancellationReason): void {
            if (reason === "removed") this.disposed = true;
            if (reason === "reset") this.lastUseTimes.clear();
            const active = this.current;
            if (active) this.cancelTask(active, reason);
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

      private fail(active: ActiveTask, error: unknown): never {
            try { this.cancelTask(active, "interrupted"); }
            catch { /* Preserve the execution error. */ }
            try { this.host.taskFailed?.(error); }
            catch { /* Preserve the execution error after host cleanup. */ }
            throw error;
      }

      private reject(active: ActiveTask, reason: TaskRejectionReason): void {
            if (this.current !== active) return;
            active.startFailure = reason;
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
            try { active.runner.cancel(reason); }
            finally { if (!active.runner.isClosing) this.closing = false; }
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
