import type * as Matter from "matter-js";
import type { FighterConfig } from "../types/fighter";
import { PresentationState } from "../presentation/state";
import { StatusController } from "../gameplay/statuses";
import { ComponentContainer, ResourceLeases } from "./component";
import type { ContactEvent, CancellationReason } from "./contracts";
import type { BehaviorRuntime } from "./behavior-runtime";

export type EntityRemovalReason =
      | "removed" | "owner-removed" | "owner-death" | "match-ended"
      | "reset" | "hit" | "expired";

export interface EntityOptions {
      runtimeId: string;
      configId: string;
      teamId: string;
      ownerId?: string | null;
      body: Matter.Body;
      config: FighterConfig;
      health?: number;
      tags?: readonly string[];
      containWithinArena?: boolean;
      onPeriodicDamage?: (target: Entity, amount: number, sourceId: string | null) => void;
}

/** Headless fighter identity and lifetime. World registration belongs to Simulation. */
export class Entity {
      readonly id: string;
      readonly runtimeId: string;
      readonly configId: string;
      readonly teamId: string;
      readonly tags: Set<string>;
      readonly containWithinArena: boolean;
      readonly ownerId: string | null;
      readonly body: Matter.Body;
      readonly config: FighterConfig;
      readonly maxHealth: number;
      readonly presentation = new PresentationState();
      readonly resources = new ResourceLeases();
      readonly components = new ComponentContainer(this);
      readonly statuses: StatusController;
      behavior: BehaviorRuntime | null = null;
      health: number;
      facing: "left" | "right";
      private removed = false;
      private removal: EntityRemovalReason | null = null;

      constructor(options: EntityOptions) {
            this.runtimeId = options.runtimeId;
            this.configId = options.configId;
            this.id = options.configId;
            this.teamId = options.teamId;
            this.tags = new Set(options.tags ?? ["targetable", "contestant"]);
            this.containWithinArena = options.containWithinArena ?? true;
            this.ownerId = options.ownerId ?? null;
            this.body = options.body;
            this.config = options.config;
            this.maxHealth = options.config.maxHealth;
            this.health = Math.max(0, Math.min(options.health ?? this.maxHealth, this.maxHealth));
            this.facing = options.config.defaultFacing;
            this.presentation.facing = this.facing;
            this.presentation.imagePath = options.config.image;
            this.presentation.position = {
                  x: this.body.position.x,
                  y: this.body.position.y,
            };
            this.statuses = new StatusController(
                  this,
                  (amount, sourceId) => {
                        if (options.onPeriodicDamage) options.onPeriodicDamage(this, amount, sourceId);
                        else this.takeDamage(amount);
                  },
                  (before, after) => {
                        if (before.canContinueCast && !after.canContinueCast) {
                              this.behavior?.cancel("interrupted");
                              this.components.cancel("interrupted");
                        }
                  },
            );
      }

      get ownerRuntimeId(): string | null { return this.ownerId; }
      get isDead(): boolean { return this.health <= 0; }
      get isRemoved(): boolean { return this.removed; }
      get isAlive(): boolean { return !this.isDead && !this.removed; }
      get removalReason(): EntityRemovalReason | null { return this.removal; }

      setPeriodicDamageHandler(
            handler: (target: Entity, amount: number, sourceId: string | null) => void,
      ): void {
            this.statuses.setDamageHandler((amount, sourceId) => handler(this, amount, sourceId));
      }

      setBehavior(runtime: BehaviorRuntime): void {
            if (this.removed) throw new Error("Cannot attach behavior to a removed entity");
            if (this.behavior && this.behavior !== runtime) throw new Error("Behavior already attached");
            this.behavior = runtime;
      }

      /** Returns actual health lost; the first lethal hit cancels owned work now. */
      takeDamage(amount: number): number {
            if (!this.isAlive || !Number.isFinite(amount) || amount <= 0) return 0;
            const applied = Math.min(this.health, amount);
            this.health -= applied;
            if (this.isDead) {
                  let firstError: unknown;
                  let failed = false;
                  for (const action of [
                        () => this.behavior?.cancel("death"),
                        () => this.components.cancel("death"),
                        () => this.statuses.clear(),
                  ]) {
                        try { action(); }
                        catch (error) { if (!failed) firstError = error; failed = true; }
                  }
                  if (failed) throw firstError;
            }
            return applied;
      }

      heal(amount: number): number {
            if (!this.isAlive || !Number.isFinite(amount) || amount <= 0) return 0;
            const applied = Math.min(this.maxHealth - this.health, amount);
            this.health += applied;
            return applied;
      }

      beforeStep(deltaMs: number): void {
            if (!this.isAlive || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
            this.statuses.update(deltaMs);
            if (!this.isAlive) return;
            this.behavior?.update(deltaMs);
            if (this.isAlive) this.components.beforeStep(deltaMs);
      }

      afterStep(deltaMs: number): void {
            if (this.isAlive && Number.isFinite(deltaMs) && deltaMs > 0) {
                  this.components.afterStep(deltaMs);
                  if (!this.isRemoved) this.syncPresentation();
            }
      }

      contact(event: ContactEvent): void {
            if (!this.isAlive) return;
            event.hadForegroundTask ||= this.behavior?.isRunning ?? false;
            this.behavior?.contact(event);
            if (this.isAlive) this.components.contact(event);
            if (!this.isRemoved) this.syncPresentation();
      }

      cancel(reason: CancellationReason): void {
            let failure: unknown;
            let failed = false;
            for (const action of [() => this.behavior?.cancel(reason), () => this.components.cancel(reason)]) {
                  try { action(); }
                  catch (error) { if (!failed) failure = error; failed = true; }
            }
            if (failed) throw failure;
      }

      /** Marks lifetime synchronously; Simulation removes the Matter body safely later. */
      remove(reason: EntityRemovalReason = "removed"): void {
            if (this.removed) return;
            this.removed = true;
            this.removal = reason;
            const cancellation: CancellationReason = reason === "match-ended" ? "match-ended"
                  : reason === "reset" ? "reset" : "removed";
            let failed = false;
            let firstError: unknown;
            const release = (action: () => void) => {
                  try { action(); }
                  catch (error) { if (!failed) firstError = error; failed = true; }
            };
            release(() => this.behavior?.cancel(cancellation));
            release(() => this.components.detach(cancellation));
            release(() => this.statuses.clear());
            release(() => this.resources.clear());
            release(() => this.presentation.clear());
            if (failed) throw firstError;
      }

      private syncPresentation(): void {
            this.presentation.position = {
                  x: this.body.position.x,
                  y: this.body.position.y,
            };
            this.presentation.facing = this.facing;
      }
}
