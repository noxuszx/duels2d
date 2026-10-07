import type * as Matter from "matter-js";
import { resolveEntityConfig, type EntityConfig, type RuntimeEntityConfig } from "../types/entity";
import { PresentationState } from "../presentation/state";
import { StatusController } from "../gameplay/statuses";
import { ComponentContainer, ResourceLeases } from "./component";
import type { ContactEvent, CancellationReason } from "./contracts";
import type { BehaviorRuntime } from "./behavior-runtime";
import { EventSource } from "./events/source";
import { ScriptScope } from "./scripting/scope";
import { runAll } from "./cleanup";

export interface EntityEventMap {
      damaged: Readonly<{ targetId: string; sourceId: string | null; amount: number; killed: boolean }>;
      death: Readonly<{ entity: Entity; sourceId: string | null }>;
      removed: Readonly<{ entity: Entity; reason: EntityRemovalReason }>;
}

export type EntityRemovalReason =
      | "removed" | "owner-removed" | "owner-death" | "match-ended"
      | "reset" | "hit" | "expired";

export interface EntityOptions<C extends EntityConfig = EntityConfig> {
      runtimeId: string;
      configId: string;
      teamId: string;
      ownerId?: string | null;
      body: Matter.Body;
      config: C;
      health?: number;
      tags?: readonly string[];
      containWithinArena?: boolean;
      onPeriodicDamage?: (target: Entity, amount: number, sourceId: string | null) => void;
}

/** Headless entity identity and lifetime. World registration belongs to Simulation. */
export class Entity<C extends EntityConfig = EntityConfig> {
      readonly id: string;
      readonly runtimeId: string;
      readonly configId: string;
      readonly teamId: string;
      readonly tags: Set<string>;
      readonly containWithinArena: boolean;
      readonly ownerId: string | null;
      readonly body: Matter.Body;
      private configValue: RuntimeEntityConfig<C>;
      readonly maxHealth: number;
      readonly presentation = new PresentationState();
      readonly resources = new ResourceLeases();
      readonly components = new ComponentContainer(this);
      readonly statuses: StatusController;
      readonly events = new EventSource<EntityEventMap>();
      readonly lifetime = new ScriptScope();
      behavior: BehaviorRuntime | null = null;
      health: number;
      facing: "left" | "right";
      private removal: EntityRemovalReason | null = null;
      private damageDispatchDepth = 0;
      private pendingRemovalEvent: EntityRemovalReason | null = null;

      constructor(options: EntityOptions<C>) {
            this.runtimeId = options.runtimeId;
            this.configId = options.configId;
            this.id = options.configId;
            this.teamId = options.teamId;
            this.tags = new Set(options.tags ?? ["targetable", "contestant"]);
            this.containWithinArena = options.containWithinArena ?? true;
            this.ownerId = options.ownerId ?? null;
            this.body = options.body;
            this.configValue = resolveEntityConfig(options.config);
            this.maxHealth = options.config.maxHealth;
            this.health = Math.max(0, Math.min(options.health ?? this.maxHealth, this.maxHealth));
            this.facing = this.config.defaultFacing;
            this.presentation.facing = this.facing;
            this.presentation.imagePath = this.config.image;
            this.presentation.position = {
                  x: this.body.position.x,
                  y: this.body.position.y,
            };
            this.statuses = new StatusController(
                  this,
                  (amount, sourceId) => {
                        if (options.onPeriodicDamage) options.onPeriodicDamage(this, amount, sourceId);
                        else this.takeDamage(amount, sourceId);
                  },
                  (before, after) => {
                        if (before.canContinueCast && !after.canContinueCast) {
                              this.behavior?.cancel("interrupted");
                              this.components.cancel("interrupted");
                        }
                  },
            );
      }

      get config(): RuntimeEntityConfig<C> { return this.configValue; }

      /** Replace settings explicitly; physical identity/body and maximum health stay fixed. */
      setConfiguration(config: C): void {
            if (this.isRemoved) throw new Error("Cannot configure a removed entity");
            const current = this.configValue;
            const box = config.hitbox, previousBox = current.hitbox;
            const sameHitbox = box.type === "circle"
                  ? previousBox.type === "circle" && box.radius === previousBox.radius
                  : previousBox.type === "box" && box.width === previousBox.width && box.height === previousBox.height;
            if (config.id !== current.id || config.maxHealth !== current.maxHealth ||
                  config.radius !== current.radius || !sameHitbox ||
                  (config.hitboxOffset?.x ?? 0) !== current.hitboxOffset.x ||
                  (config.hitboxOffset?.y ?? 0) !== current.hitboxOffset.y)
                  throw new Error("Configuration changes cannot replace an entity's physical setup or maximum health");
            this.configValue = resolveEntityConfig(config);
            this.presentation.imagePath = this.config.image;
      }

      get ownerRuntimeId(): string | null { return this.ownerId; }
      get isDead(): boolean { return this.health <= 0; }
      get isRemoved(): boolean { return this.removal !== null; }
      get isAlive(): boolean { return !this.isDead && !this.isRemoved; }
      get removalReason(): EntityRemovalReason | null { return this.removal; }

      setPeriodicDamageHandler(
            handler: (target: Entity, amount: number, sourceId: string | null) => void,
      ): void {
            this.statuses.setDamageHandler((amount, sourceId) => handler(this, amount, sourceId));
      }

      setBehavior(runtime: BehaviorRuntime): void {
            if (this.isRemoved) throw new Error("Cannot attach behavior to a removed entity");
            if (this.behavior && this.behavior !== runtime) throw new Error("Behavior already attached");
            this.behavior = runtime;
      }

      /** Returns actual health lost; the first lethal hit cancels owned work now. */
      takeDamage(amount: number, sourceId: string | null = null): number {
            if (!this.isAlive || !Number.isFinite(amount) || amount <= 0) return 0;
            const applied = Math.min(this.health, amount);
            this.health -= applied;
            const killed = this.isDead;
            this.damageDispatchDepth++;
            runAll([
                  () => {
                        if (this.events.isBound) this.events.emit("damaged",
                              Object.freeze({ targetId: this.runtimeId, sourceId, amount: applied, killed }));
                  },
                  ...(killed ? [
                        () => { if (this.events.isBound) this.events.emit("death", Object.freeze({ entity: this, sourceId })); },
                        () => this.behavior?.cancel("death"),
                        () => this.components.cancel("death"),
                        () => this.statuses.clear(),
                        () => this.lifetime.release(),
                  ] : []),
                  () => {
                        this.damageDispatchDepth--;
                        if (this.damageDispatchDepth === 0 && this.pendingRemovalEvent) {
                              const reason = this.pendingRemovalEvent;
                              this.pendingRemovalEvent = null;
                              this.finishRemovalEvents(reason);
                        }
                  },
            ]);
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
            if (!this.isAlive) return;
            this.components.beforeStep(deltaMs);
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
            runAll([
                  () => this.behavior?.cancel(reason),
                  () => this.components.cancel(reason),
            ]);
      }

      /** Marks lifetime synchronously; Simulation removes the Matter body safely later. */
      remove(reason: EntityRemovalReason = "removed"): void {
            if (this.isRemoved) return;
            this.removal = reason;
            const cancellation: CancellationReason = reason === "match-ended" ? "match-ended"
                  : reason === "reset" ? "reset" : "removed";

            runAll([
                  () => this.behavior?.cancel(cancellation),
                  () => this.components.detach(cancellation),
                  () => this.statuses.clear(),
                  () => this.resources.clear(),
                  () => this.presentation.clear(),
                  () => {
                        // Damage/death publication must finish even if a damage observer removes us.
                        if (this.damageDispatchDepth > 0) this.pendingRemovalEvent = reason;
                        else this.finishRemovalEvents(reason);
                  },
            ]);
      }

      private finishRemovalEvents(reason: EntityRemovalReason): void {
            runAll([
                  () => { if (this.events.isBound) this.events.emit("removed", Object.freeze({ entity: this, reason })); },
                  () => this.lifetime.release(),
                  () => this.events.close(),
            ]);
      }

      private syncPresentation(): void {
            this.presentation.position = {
                  x: this.body.position.x,
                  y: this.body.position.y,
            };
            this.presentation.facing = this.facing;
      }
}
