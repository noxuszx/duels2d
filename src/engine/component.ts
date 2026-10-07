import type { ContactEvent, ContactPolicy, CancellationReason } from "./contracts";
import type { Entity } from "./entity";
import type { EntityConfig, RuntimeEntityConfig } from "../types/entity";
import type { Simulation } from "./simulation";
import { runAll } from "./cleanup";

/** Mechanics can be attached to any entity; fighter assembly narrows its config. */
export interface ComponentContext<C extends EntityConfig = EntityConfig> {
      entity: Entity<C>;
      simulation: Simulation;
      readonly config: RuntimeEntityConfig<C>;
}

/** Persistent, owner-bound capability. Its public methods may create per-use operations. */
export interface EntityComponent {
      attach?(owner: Entity): void;
      beforeStep?(deltaMs: number): void;
      afterStep?(deltaMs: number): void;
      contact?(event: ContactEvent): void;
      cancel?(reason: CancellationReason): void;
      detach?(reason: CancellationReason): void;
}

/** One attachment per name; stable registration order is observable at contacts. */
export class ComponentContainer {
      private readonly entries = new Map<string, EntityComponent>();
      private detached = false;

      constructor(private readonly owner: Entity) {}

      use<T extends EntityComponent>(name: string, component: T): T {
            if (this.detached) throw new Error("Cannot attach a component to a removed entity");
            if (!name || this.entries.has(name)) throw new Error(`Duplicate component: ${name}`);
            this.entries.set(name, component);
            try { component.attach?.(this.owner); }
            catch (error) {
                  this.entries.delete(name);
                  try { component.detach?.("removed"); }
                  finally { throw error; }
            }
            return component;
      }

      get<T extends EntityComponent = EntityComponent>(name: string): T | undefined {
            return this.entries.get(name) as T | undefined;
      }

      beforeStep(deltaMs: number): void {
            if (this.detached) return;
            for (const component of [...this.entries.values()]) {
                  if (this.detached || !this.owner.isAlive) break;
                  component.beforeStep?.(deltaMs);
            }
      }

      afterStep(deltaMs: number): void {
            if (this.detached) return;
            for (const component of [...this.entries.values()]) {
                  if (this.detached || !this.owner.isAlive) break;
                  component.afterStep?.(deltaMs);
            }
      }

      contact(event: ContactEvent): void {
            if (this.detached) return;
            for (const component of [...this.entries.values()]) {
                  if (this.detached || !this.owner.isAlive) break;
                  component.contact?.(event);
            }
      }

      cancel(reason: CancellationReason): void {
            if (this.detached) return;
            runAll([...this.entries.values()].map(component => () => component.cancel?.(reason)));
      }

      detach(reason: CancellationReason = "removed"): void {
            if (this.detached) return;
            this.detached = true;
            const components = [...this.entries.values()].reverse();
            this.entries.clear();
            runAll(components.flatMap(component => [
                  () => component.cancel?.(reason), () => component.detach?.(reason),
            ]));
      }
}

/** Generic control leases. A released lease is safe to release again. */
export class ResourceLeases {
      private readonly exclusive = new Map<string, object>();
      private readonly contactOverrides = new Map<object, Partial<ContactPolicy>>();
      private readonly ignoredContacts = new Map<string, Set<object>>();

      acquireExclusive(key: string): (() => void) | null {
            if (!key || this.exclusive.has(key)) return null;
            const token = {};
            this.exclusive.set(key, token);
            return () => {
                  if (this.exclusive.get(key) === token) this.exclusive.delete(key);
            };
      }

      isHeld(key: string): boolean { return this.exclusive.has(key); }

      acquireIgnoredContact(runtimeId: string): () => void {
            const token = {};
            const leases = this.ignoredContacts.get(runtimeId) ?? new Set<object>();
            leases.add(token);
            this.ignoredContacts.set(runtimeId, leases);
            return () => {
                  leases.delete(token);
                  if (!leases.size && this.ignoredContacts.get(runtimeId) === leases)
                        this.ignoredContacts.delete(runtimeId);
            };
      }

      ignoresContact(runtimeId: string): boolean { return this.ignoredContacts.has(runtimeId); }

      acquireContactPolicy(override: Partial<ContactPolicy>): () => void {
            const token = {};
            this.contactOverrides.set(token, override);
            return () => { this.contactOverrides.delete(token); };
      }

      get contactPolicy(): ContactPolicy {
            const policy: ContactPolicy = { defaultBounce: true, allowImpactDamage: true };
            for (const override of this.contactOverrides.values()) {
                  if (override.defaultBounce === false) policy.defaultBounce = false;
                  if (override.allowImpactDamage === false) policy.allowImpactDamage = false;
            }
            return policy;
      }

      clear(): void {
            this.exclusive.clear();
            this.contactOverrides.clear();
            this.ignoredContacts.clear();
      }
}
