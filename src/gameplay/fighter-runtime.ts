import type { Fighter } from "../entities/fighter";
import type { ArenaWall } from "../skills/types";
import type { CancellationReason } from "./action-scope";

/** A reusable mechanic owned and advanced by one fighter. */
export interface FighterRuntimeComponent {
      update(deltaMs: number): void;
      cancel(reason: CancellationReason): void;
      handleFighterCollision?(target: Fighter): void;
      handleWallCollision?(wall: ArenaWall): void;
      readonly isDashing?: boolean;
}

export interface FighterRuntimeContext {
      isCombatActive?(): boolean;
}

/** Owns the shared tick, collision, and cancellation boundary for a fighter's components. */
export class FighterRuntime {
      private readonly components: FighterRuntimeComponent[] = [];
      private readonly registered = new Set<FighterRuntimeComponent>();
      private stopped = false;
      private disposed = false;
      private stopReason: CancellationReason = "death";
      private generation = 0;

      constructor(
            private readonly fighter: Fighter,
            private readonly context: FighterRuntimeContext,
      ) {}

      use<T extends FighterRuntimeComponent>(component: T): T {
            if (this.disposed) {
                  component.cancel("removed");
                  return component;
            }
            if (!this.registered.has(component)) {
                  this.registered.add(component);
                  this.components.push(component);
                  if (this.stopped) component.cancel(this.stopReason);
            }
            return component;
      }

      update(deltaMs: number): void {
            if (this.disposed || this.stopped) return;
            if (!this.refreshState()) return;
            if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
            const generation = this.generation;
            for (const component of [...this.components]) {
                  if (this.disposed || this.stopped || generation !== this.generation || !this.refreshState()) break;
                  if (this.registered.has(component)) component.update(deltaMs);
            }
      }

      /** Reusable interruption: component state is cancelled while registrations remain available. */
      cancel(reason: CancellationReason): void {
            if (this.disposed || this.stopped) return;
            if (reason === "death" || reason === "removed") return this.stop(reason);
            this.generation++;
            this.cancelComponents(reason);
      }

      /** Match reset reopens a runtime after death or combat end, retaining reusable components. */
      reset(): void {
            if (this.disposed) return;
            this.generation++;
            this.cancelComponents("reset");
            this.stopped = false;
      }

      get isDashing(): boolean {
            return !this.disposed && !this.stopped && this.components.some(
                  component => this.registered.has(component) && component.isDashing === true,
            );
      }

      get hasComponents(): boolean { return !this.disposed && this.registered.size > 0; }

      handleFighterCollision(target: Fighter): void {
            if (this.disposed || this.stopped || !this.refreshState()) return;
            const generation = this.generation;
            for (const component of [...this.components]) {
                  if (this.disposed || this.stopped || generation !== this.generation || !this.refreshState()) break;
                  if (this.registered.has(component)) component.handleFighterCollision?.(target);
            }
      }

      handleWallCollision(wall: ArenaWall): void {
            if (this.disposed || this.stopped || !this.refreshState()) return;
            const generation = this.generation;
            for (const component of [...this.components]) {
                  if (this.disposed || this.stopped || generation !== this.generation || !this.refreshState()) break;
                  if (this.registered.has(component)) component.handleWallCollision?.(wall);
            }
      }

      dispose(): void {
            if (this.disposed) return;
            this.disposed = true;
            this.cancelComponents("removed");
            this.components.length = 0;
            this.registered.clear();
      }

      private stop(reason: CancellationReason): void {
            if (this.stopped) return;
            this.stopped = true;
            this.stopReason = reason;
            this.generation++;
            this.cancelComponents(reason);
      }

      private cancelComponents(reason: CancellationReason): void {
            for (const component of [...this.components]) {
                  if (this.registered.has(component)) component.cancel(reason);
            }
      }

      private refreshState(): boolean {
            if (this.fighter.isDead) {
                  this.stop("death");
                  return false;
            }
            if (this.context.isCombatActive?.() === false) {
                  this.stop("interrupted");
                  return false;
            }
            return !this.stopped;
      }
}
