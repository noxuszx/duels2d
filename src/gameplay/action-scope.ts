import type { Fighter } from "../entities/fighter";
import type { ArenaWall } from "../skills/types";

export type CancellationReason =
      | "interrupted"
      | "death"
      | "removed"
      | "reset"
      | "phase-ended";

/** A simulation-ticked operation. Cancellation never means successful completion. */
export interface GameplayOperation {
      update(deltaMs: number): void;
      cancel(reason: CancellationReason): void;
      handleFighterCollision?(target: Fighter): boolean;
      handleWallCollision?(wall: ArenaWall): boolean;
      readonly isDashing?: boolean;
}

/** Owns the operations/resources of one ability phase. */
export class ActionScope {
      private operations: GameplayOperation[] = [];
      private closed = false;

      get isClosed(): boolean { return this.closed; }

      use<T extends GameplayOperation>(operation: T): T {
            if (this.closed) operation.cancel("phase-ended");
            else this.operations.push(operation);
            return operation;
      }

      update(deltaMs: number): void {
            for (const operation of [...this.operations]) {
                  if (this.closed) break;
                  operation.update(deltaMs);
            }
      }

      handleFighterCollision(target: Fighter): void {
            for (const operation of [...this.operations]) {
                  if (this.closed) break;
                  operation.handleFighterCollision?.(target);
            }
      }

      handleWallCollision(wall: ArenaWall): void {
            for (const operation of [...this.operations]) {
                  if (this.closed) break;
                  operation.handleWallCollision?.(wall);
            }
      }

      get isDashing(): boolean {
            return this.operations.some((operation) => operation.isDashing);
      }

      cancel(reason: CancellationReason): void {
            if (this.closed) return;
            this.closed = true;
            const operations = this.operations;
            this.operations = [];
            for (const operation of operations) operation.cancel(reason);
      }
}
