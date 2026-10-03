import type { Fighter } from "./fighter";
import type { ArenaBounds } from "../skills/types";
import type { Vector2 } from "../types/fighter";
import type { SpawnedEntity, SpawnedEntityContext, EntityRemovalReason } from "../gameplay/spawned-entity";
import { assertSaucerSettings, type SaucerSettings } from "../gameplay/saucer-settings";
import { BeamHazard } from "../skills/beam-hazard";
import type { LaserShot } from "../gameplay/instant-laser";

/** Owns horizontal flight and the timed floodlight; the fighter chooses deployment. */
export class Saucer implements SpawnedEntity {
      removed = false;
      private x: number | null = null;
      private y = 0;
      private direction: -1 | 1 = Math.random() < 0.5 ? 1 : -1;
      private entered = false;
      private elapsedMs = 0;
      private beamEnabled = true;
      private beamActive = false;
      private image: HTMLImageElement | null = null;
      private readonly beam: BeamHazard;
      private readonly settings: SaucerSettings;

      constructor(readonly owner: Fighter, settings: SaucerSettings) {
            assertSaucerSettings(settings);
            this.settings = structuredClone(settings);
            this.beam = new BeamHazard(owner, settings.beamDamageIntervalMs);
            if (settings.image) {
                  const image = new Image();
                  image.onload = () => { if (!this.removed) this.image = image; };
                  image.src = settings.image;
            }
      }

      stopBeam(): void { this.beamEnabled = false; this.beamActive = false; this.beam.cancel(); }

      deploymentPosition(arena: ArenaBounds): Vector2 {
            return { x: Math.max(arena.minX, Math.min(arena.maxX, this.x ?? arena.minX)), y: arena.minY };
      }

      update(deltaMs: number, context: SpawnedEntityContext): void {
            if (this.removed || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
            const { arena, viewport } = context;
            const { width, height, altitude, speed } = this.settings;
            this.y = arena.minY - altitude - height / 2;
            if (this.x === null) this.x = this.direction === 1
                  ? Math.min(viewport.left, arena.minX) - width / 2
                  : Math.max(viewport.right, arena.maxX) + width / 2;
            let distance = speed * deltaMs / 1000;
            if (!this.entered) {
                  const entry = this.direction === 1 ? arena.minX : arena.maxX;
                  const remaining = Math.abs(entry - this.x);
                  if (distance < remaining) { this.x += this.direction * distance; distance = 0; }
                  else { this.x = entry; distance -= remaining; this.entered = true; }
            }
            // Fold the travel distance into alternating complete sweeps, including resize.
            if (this.entered) {
                  const span = arena.maxX - arena.minX;
                  if (span > 0) {
                        const current = Math.max(0, Math.min(span, this.x - arena.minX));
                        const phase = ((this.direction === 1 ? current : 2 * span - current) + distance) % (2 * span);
                        this.x = arena.minX + (phase <= span ? phase : 2 * span - phase);
                        this.direction = phase < span ? 1 : -1;
                  }
            }
            // Arrival does not consume the first full beam pulse.
            if (this.entered) this.elapsedMs += distance / speed * 1000;
            this.beamActive = this.beamEnabled && this.entered &&
                  this.elapsedMs % this.settings.beamIntervalMs < this.settings.beamDurationMs;
            if (this.beamActive) this.beam.update(this.beamShot(arena), context);
            else this.beam.pause();
      }

      private beamShot(arena: ArenaBounds): LaserShot {
            return { origin: { x: this.x ?? arena.minX, y: arena.minY }, direction: { x: 0, y: 1 },
                  length: arena.maxY - arena.minY, width: this.settings.beamWidth,
                  damage: this.settings.beamDamage, color: this.settings.beamColor, flashMs: 0 };
      }

      remove(_reason: EntityRemovalReason): void {
            if (this.removed) return;
            this.removed = true;
            this.stopBeam();
            this.image = null;
      }

      draw(ctx: CanvasRenderingContext2D, arena: ArenaBounds): void {
            if (this.removed || this.x === null) return;
            ctx.save();
            if (this.beamActive) {
                  ctx.fillStyle = this.settings.beamColor;
                  ctx.shadowColor = this.settings.beamColor;
                  ctx.shadowBlur = 24;
                  ctx.globalAlpha = 0.65;
                  ctx.fillRect(this.x - this.settings.beamWidth / 2,
                        this.y + this.settings.height / 2, this.settings.beamWidth,
                        arena.maxY - this.y - this.settings.height / 2);
                  ctx.shadowBlur = 0;
                  ctx.globalAlpha = 0.85;
                  ctx.fillStyle = "#ffffff";
                  ctx.fillRect(this.x - this.settings.beamWidth * 0.08,
                        this.y + this.settings.height / 2, this.settings.beamWidth * 0.16,
                        arena.maxY - this.y - this.settings.height / 2);
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            if (this.image) {
                  const crop = this.settings.imageCrop;
                  ctx.drawImage(this.image, crop?.x ?? 0, crop?.y ?? 0,
                        crop?.width ?? this.image.naturalWidth, crop?.height ?? this.image.naturalHeight,
                        this.x - this.settings.width / 2, this.y - this.settings.height / 2,
                        this.settings.width, this.settings.height);
            }
            ctx.restore();
      }
}
