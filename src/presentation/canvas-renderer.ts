import type { RuntimeConfig } from "../config/runtime-config";
import { getAspectFitCropDrawRect } from "../rendering/sprite-geometry";
import type { EntityView } from "./view";

type Arena = { ax: number; ay: number; aw: number; ah: number };
interface FloatingText { text: string; x: number; y: number; born: number; }

/** Browser-only asset/cache adapter and read-only drawing. Time is supplied by simulation. */
export class CanvasRenderer {
      private readonly images = new Map<string, HTMLImageElement>();
      private readonly flashes = new Map<string, number>();
      private texts: FloatingText[] = [];
      constructor(private readonly ctx: CanvasRenderingContext2D, private readonly settings: RuntimeConfig) {}
      hit(id: string, amount: number, view: EntityView, now: number): void {
            this.texts = this.texts.filter(text => now - text.born < 700);
            for (const [id, until] of this.flashes) if (until <= now) this.flashes.delete(id);
            this.flashes.set(id, now + 150);
            this.texts.push({ text: `-${Math.round(amount)}`, x: view.x, y: view.y, born: now });
      }
      reset(): void { this.flashes.clear(); this.texts = []; }
      render(width: number, height: number, arena: Arena, views: readonly EntityView[], now: number): void {
            const { ctx } = this;
            ctx.clearRect(0, 0, width, height);
            ctx.strokeStyle = this.settings.game.arena.borderColor;
            ctx.lineWidth = this.settings.game.arena.borderWidth * 2;
            ctx.strokeRect(arena.ax, arena.ay, arena.aw, arena.ah);
            ctx.font = "600 14px sans-serif";
            ctx.textAlign = "right";
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.fillText("duels-2d", arena.ax + arena.aw - 12, arena.ay + 22);
            ctx.textAlign = "center";
            ctx.fillText(this.settings.game.text.footer, arena.ax + arena.aw / 2, arena.ay + arena.ah + 30);
            for (const view of views) if (!view.dead) this.drawEntity(view, now);
            for (const text of this.texts) {
                  const elapsed = now - text.born;
                  if (elapsed >= 700) continue;
                  ctx.save();
                  ctx.globalAlpha = 1 - elapsed / 700;
                  ctx.font = `${this.settings.indicators.damage.minFontSize}px ${this.settings.indicators.text.family}`;
                  ctx.fillStyle = this.settings.indicators.damage.fillColor;
                  ctx.fillText(text.text, text.x, text.y - elapsed * 0.04);
                  ctx.restore();
            }
      }
      private image(path: string): HTMLImageElement | null {
            if (!path) return null;
            let image = this.images.get(path);
            if (!image) { image = new Image(); image.src = path; this.images.set(path, image); }
            return image.complete && image.naturalWidth > 0 ? image : null;
      }
      private drawEntity(view: EntityView, now: number): void {
            const { ctx } = this;
            const image = this.image(view.pose.image);
            ctx.save();
            const offset = view.pose.imageOffset ?? { x: 0, y: 0 };
            const pivot = view.rotationPivot ?? { x: 0, y: 0 };
            const mirror = view.facing !== (view.config.defaultFacing ?? "right") ? -1 : 1;
            ctx.translate(view.x + offset.x + mirror * pivot.x, view.y + offset.y + pivot.y);
            ctx.rotate(view.angle);
            ctx.scale(mirror, 1);
            ctx.translate(-pivot.x, -pivot.y);
            if (image) {
                  const supplied = view.pose.imageCrop;
                  const x = Math.max(0, Math.min(supplied?.x ?? 0, image.naturalWidth - 1));
                  const y = Math.max(0, Math.min(supplied?.y ?? 0, image.naturalHeight - 1));
                  const crop = { x, y, width: Math.max(1, Math.min(supplied?.width ?? image.naturalWidth, image.naturalWidth - x)),
                        height: Math.max(1, Math.min(supplied?.height ?? image.naturalHeight, image.naturalHeight - y)) };
                  const rect = getAspectFitCropDrawRect(image.naturalWidth, image.naturalHeight, crop,
                        view.config.radius * (view.pose.imageScale ?? 1));
                  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, rect.dx, rect.dy, rect.dw, rect.dh);
                  if ((this.flashes.get(view.runtimeId) ?? 0) > now) {
                        ctx.globalCompositeOperation = "source-atop";
                        ctx.fillStyle = "rgba(255,0,0,0.55)";
                        ctx.fillRect(rect.dx, rect.dy, rect.dw, rect.dh);
                  }
            } else {
                  ctx.fillStyle = view.config.color ?? "#ffffff";
                  const box = view.config.hitbox;
                  if (box.type === "box") ctx.fillRect(-box.width / 2, -box.height / 2, box.width, box.height);
                  else { ctx.beginPath(); ctx.arc(0, 0, box.radius, 0, Math.PI * 2); ctx.fill(); }
            }
            ctx.restore();
            if (view.showHealth) this.health(view);
      }
      private health(view: EntityView): void {
            const { ctx } = this;
            const size = view.config.radius * 2;
            const healthOffset = view.config.healthBarOffset ?? { x: 0, y: 0 };
            const x = view.x - size / 2 + healthOffset.x;
            const y = view.y - view.config.radius - 20 + healthOffset.y;
            const unit = size / 3;
            const trace = () => {
                  ctx.beginPath();
                  ctx.moveTo(x + unit, y); ctx.lineTo(x + 2 * unit, y);
                  ctx.lineTo(x + 2 * unit, y + unit); ctx.lineTo(x + size, y + unit);
                  ctx.lineTo(x + size, y + 2 * unit); ctx.lineTo(x + 2 * unit, y + 2 * unit);
                  ctx.lineTo(x + 2 * unit, y + size); ctx.lineTo(x + unit, y + size);
                  ctx.lineTo(x + unit, y + 2 * unit); ctx.lineTo(x, y + 2 * unit);
                  ctx.lineTo(x, y + unit); ctx.lineTo(x + unit, y + unit); ctx.closePath();
            };
            const ratio = view.health / view.maxHealth;
            ctx.save(); trace(); ctx.fillStyle = "#222"; ctx.fill();
            ctx.save(); trace(); ctx.clip(); ctx.fillStyle = `hsl(${ratio > .5 ? 120 : ratio > .25 ? 50 : 0},90%,40%)`;
            ctx.fillRect(x, y + size * (1 - ratio), size, size * ratio); ctx.restore();
            ctx.font = `${Math.max(this.settings.indicators.health.minFontSize, size * this.settings.indicators.health.sizeMultiplier)}px ${this.settings.indicators.text.family}`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillStyle = this.settings.indicators.health.fillColor;
            ctx.fillText(String(Math.ceil(view.health)), x + size / 2, y + size / 2);
            ctx.restore();
      }
}
