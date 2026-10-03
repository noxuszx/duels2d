import type { CancellationReason } from "./action-scope";
import type { FighterRuntimeComponent } from "./fighter-runtime";
import type { SpawnedEntity } from "./spawned-entity";

export interface EntityAttachmentHost {
      addEntity?(entity: SpawnedEntity): void;
}

/** Registers one support entity and owns its reference; its system still owns entity ticking. */
export class EntityAttachment<T extends SpawnedEntity> implements FighterRuntimeComponent {
      private entity: T | null = null;

      constructor(
            private readonly host: EntityAttachmentHost,
            private readonly create: () => T,
      ) {}

      get current(): T | null { return this.entity; }

      update(deltaMs: number): void {
            if (!Number.isFinite(deltaMs) || deltaMs <= 0 || this.entity || !this.host.addEntity) return;
            const entity = this.create();
            this.entity = entity;
            this.host.addEntity(entity);
      }

      /** Status interruptions leave the independently managed support entity alive. */
      cancel(reason: CancellationReason): void {
            if (reason === "interrupted" || reason === "phase-ended") return;
            const entity = this.entity;
            this.entity = null;
            entity?.remove(reason === "death" ? "owner-death" : reason === "removed" ? "owner-removed" : "reset");
      }
}
