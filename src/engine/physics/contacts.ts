import { Events, type Engine, type IEventCollision, type Pair } from "matter-js";
import type { EntityRegistry } from "../entity-registry";
import type { ContactPolicy, Vector2 } from "../contracts";

export interface ContactSideSnapshot {
      readonly id: string;
      readonly policy: Readonly<ContactPolicy>;
      readonly hadForegroundTask: boolean;
}

/** Values copied inside Matter callbacks. Gameplay dispatch happens after Engine.update. */
export interface EntityContactSnapshot {
      readonly kind: "entity";
      readonly first: ContactSideSnapshot;
      readonly second: ContactSideSnapshot;
      /** Separation normal applied to first. */
      readonly normal: Readonly<Vector2>;
      readonly incomingSpeed: number;
}

function snapshotPolicy(policy: ContactPolicy): Readonly<ContactPolicy> {
      return Object.freeze({ defaultBounce: policy.defaultBounce, allowImpactDamage: policy.allowImpactDamage });
}

/** Stable pair capture; no combat code runs in a Matter callback. */
export class MatterContactCollector {
      private readonly contacts: EntityContactSnapshot[] = [];
      private attached = false;

      constructor(private readonly engine: Engine, private readonly registry: EntityRegistry) {}

      attach(): void {
            if (this.attached) return;
            this.attached = true;
            Events.on(this.engine, "collisionStart", this.capture);
            Events.on(this.engine, "beforeUpdate", this.refreshPhysicalPolicies);
      }

      drain(): readonly EntityContactSnapshot[] {
            const contacts = this.contacts.splice(0);
            contacts.sort((a, b) => {
                  const aKey = `${a.first.id}\0${a.second.id}`;
                  const bKey = `${b.first.id}\0${b.second.id}`;
                  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
            });
            return contacts;
      }

      clear(): void { this.contacts.length = 0; }
      dispose(): void {
            if (!this.attached) return;
            Events.off(this.engine, "collisionStart", this.capture);
            Events.off(this.engine, "beforeUpdate", this.refreshPhysicalPolicies);
            this.attached = false;
            this.clear();
      }

      private readonly capture = (event: IEventCollision<Engine>): void => {
            for (const pair of event.pairs) {
                  if (this.applyPhysicalPolicy(pair)) continue;
                  const bodyA = pair.bodyA;
                  const bodyB = pair.bodyB;
                  const fromA = this.registry.byBody(bodyA);
                  const fromB = this.registry.byBody(bodyB);
                  if (!fromA || !fromB || fromA === fromB) continue;
                  const first = fromA.runtimeId < fromB.runtimeId ? fromA : fromB;
                  const second = first === fromA ? fromB : fromA;
                  const collisionNormal = pair.collision.normal;
                  // Matter's collision.normal separates bodyA from bodyB.
                  const direction = first === fromA ? 1 : -1;
                  const normalA = { x: collisionNormal.x * direction, y: collisionNormal.y * direction };
                  const relative = {
                        x: bodyA.velocity.x - bodyB.velocity.x,
                        y: bodyA.velocity.y - bodyB.velocity.y,
                  };
                  const incomingSpeed = Math.abs(relative.x * normalA.x + relative.y * normalA.y);
                  const snapshot: EntityContactSnapshot = Object.freeze({
                        kind: "entity",
                        first: Object.freeze({ id: first.runtimeId,
                              policy: snapshotPolicy(first.resources.contactPolicy),
                              hadForegroundTask: first.behavior?.isRunning ?? false }),
                        second: Object.freeze({ id: second.runtimeId,
                              policy: snapshotPolicy(second.resources.contactPolicy),
                              hadForegroundTask: second.behavior?.isRunning ?? false }),
                        normal: Object.freeze(normalA),
                        incomingSpeed,
                  });
                  this.contacts.push(snapshot);
            }
      };

      // Matter 0.19 emits collisionStart before its position/velocity solvers.
      // Only physics policy runs here; gameplay remains queued until after update.
      private applyPhysicalPolicy(pair: Pair): boolean {
            const first = this.registry.byBody(pair.bodyA);
            const second = this.registry.byBody(pair.bodyB);
            const ignored = Boolean(first && second &&
                  (first.resources.ignoresContact(second.runtimeId) ||
                        second.resources.ignoresContact(first.runtimeId)));
            pair.isSensor = pair.bodyA.isSensor || pair.bodyB.isSensor || ignored;
            return ignored;
      }

      private readonly refreshPhysicalPolicies = (): void => {
            // Existing pairs don't emit collisionStart again when a lease changes.
            for (const pair of this.engine.pairs.list) this.applyPhysicalPolicy(pair);
      };
}
