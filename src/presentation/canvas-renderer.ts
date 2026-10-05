import type { RuntimeConfig } from "../config/runtime-config";
import { getAspectFitCropDrawRect } from "../rendering/sprite-geometry";
import type { EntityView } from "./view";
import { viewChildTransform, viewRootTransform } from "./view";
import type { VisualTransform } from "./transform";
import type { ShapeVisual } from "./state";

type Arena = { ax: number; ay: number; aw: number; ah: number };
interface FloatingText { text: string; x: number; y: number; born: number; }

/** Browser-only asset/cache adapter and read-only drawing. Time is supplied by simulation. */
export class CanvasRenderer {
      private readonly images = new Map<string, HTMLImageElement>();
      private readonly hitSprites = new Map<string, HTMLCanvasElement>();
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
            this.drawWatermark(arena);
            ctx.font = "bold 20px sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillText(this.settings.game.text.footer, arena.ax + arena.aw / 2, arena.ay + arena.ah + 36);
            // Keep query visuals inside the arena, then cover their ends with its border.
            ctx.save();
            ctx.beginPath();
            ctx.rect(arena.ax, arena.ay, arena.aw, arena.ah);
            ctx.clip();
            for (const view of views) if (!view.dead) {
                  for (const visual of view.shapes ?? []) this.drawShape(visual);
            }
            ctx.restore();
            ctx.strokeStyle = this.settings.game.arena.borderColor;
            ctx.lineWidth = this.settings.game.arena.borderWidth * 2;
            ctx.strokeRect(arena.ax, arena.ay, arena.aw, arena.ah);
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
      private drawShape({ shape, color, opacity }: ShapeVisual): void {
            const { ctx } = this;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            switch (shape.type) {
                  case "segment":
                        ctx.beginPath();
                        ctx.moveTo(shape.from.x, shape.from.y);
                        ctx.lineTo(shape.to.x, shape.to.y);
                        ctx.lineCap = "butt";
                        ctx.lineWidth = Math.max(1, shape.width);
                        ctx.stroke();
                        break;
                  case "rectangle":
                        ctx.translate(shape.center.x, shape.center.y);
                        ctx.rotate(shape.angle ?? 0);
                        ctx.fillRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height);
                        break;
                  case "circle":
                        ctx.beginPath();
                        ctx.arc(shape.center.x, shape.center.y, shape.radius, 0, Math.PI * 2);
                        ctx.fill();
                        break;
            }
            ctx.restore();
      }
      private drawWatermark(arena: Arena): void {
            const { ctx } = this;
            const centerX = arena.ax + arena.aw / 2;
            const centerY = arena.ay + arena.ah / 2;

            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
            ctx.textBaseline = "middle";

            const text = "duels-2d";
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;

            const iconWidth = 26;
            const iconHeight = 18;
            const cornerRadius = 5;
            const gap = 8;
            const totalWidth = iconWidth + gap + textWidth;

            const iconX = centerX - totalWidth / 2;
            const iconY = centerY - iconHeight / 2;

            ctx.fillStyle = "#ff0000";
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
                  ctx.roundRect(iconX, iconY, iconWidth, iconHeight, cornerRadius);
            } else {
                  ctx.rect(iconX, iconY, iconWidth, iconHeight);
            }
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            const triWidth = 7;
            const triHeight = 8;
            const triX = iconX + (iconWidth - triWidth) / 2 + 0.75;

            ctx.beginPath();
            ctx.moveTo(triX, centerY - triHeight / 2);
            ctx.lineTo(triX + triWidth, centerY);
            ctx.lineTo(triX, centerY + triHeight / 2);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "left";
            ctx.fillText(text, iconX + iconWidth + gap, centerY);

            ctx.restore();
      }
      private image(path: string): HTMLImageElement | null {
            if (!path) return null;
            let image = this.images.get(path);
            if (!image) { image = new Image(); image.src = path; this.images.set(path, image); }
            return image.complete && image.naturalWidth > 0 ? image : null;
      }
      /** Tint an isolated crop so transparent pixels cannot pick up the scene behind it. */
      private hitSprite(image: HTMLImageElement, crop: { x: number; y: number; width: number; height: number }): HTMLCanvasElement {
            const key = `${image.src}:${crop.x},${crop.y},${crop.width},${crop.height}`;
            let sprite = this.hitSprites.get(key);
            if (!sprite) {
                  sprite = document.createElement("canvas");
                  sprite.width = crop.width; sprite.height = crop.height;
                  const layer = sprite.getContext("2d")!;
                  layer.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
                  layer.globalCompositeOperation = "source-atop";
                  layer.fillStyle = "rgba(255,0,0,0.55)";
                  layer.fillRect(0, 0, crop.width, crop.height);
                  this.hitSprites.set(key, sprite);
            }
            return sprite;
      }
      private drawEntity(view: EntityView, now: number): void {
            const { ctx } = this;
            const image = this.image(view.pose.image);
            ctx.save();
            this.applyTransform(viewChildTransform(view, "sprite"));
            if (image) {
                  const supplied = view.pose.imageCrop;
                  const x = Math.max(0, Math.min(supplied?.x ?? 0, image.naturalWidth - 1));
                  const y = Math.max(0, Math.min(supplied?.y ?? 0, image.naturalHeight - 1));
                  const crop = { x, y, width: Math.max(1, Math.min(supplied?.width ?? image.naturalWidth, image.naturalWidth - x)),
                        height: Math.max(1, Math.min(supplied?.height ?? image.naturalHeight, image.naturalHeight - y)) };
                  const rect = getAspectFitCropDrawRect(image.naturalWidth, image.naturalHeight, crop,
                        view.config.radius * (view.pose.imageScale ?? 1));
                  if ((this.flashes.get(view.runtimeId) ?? 0) > now) {
                        ctx.drawImage(this.hitSprite(image, crop), rect.dx, rect.dy, rect.dw, rect.dh);
                  } else ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, rect.dx, rect.dy, rect.dw, rect.dh);
            } else {
                  ctx.fillStyle = view.config.color;
                  const box = view.config.hitbox;
                  if (box.type === "box") ctx.fillRect(-box.width / 2, -box.height / 2, box.width, box.height);
                  else { ctx.beginPath(); ctx.arc(0, 0, box.radius, 0, Math.PI * 2); ctx.fill(); }
            }
            ctx.restore();
            this.drawWeapon(view);
            if (view.showHealth) {
                  ctx.save();
                  this.applyTransform(viewRootTransform(view));
                  this.health(view);
                  ctx.restore();
            }
      }
      private applyTransform({ a, b, c, d, e, f }: VisualTransform): void {
            this.ctx.transform(a, b, c, d, e, f);
      }
      private drawWeapon(view: EntityView): void {
            const config = view.config;
            const path = (view.busy && config.weaponAttack) || config.weaponIdle;
            const image = this.image(path ?? "");
            if (!image) return;
            const { ctx } = this;
            const scale = view.config.radius * 2 * (config.weaponScale ?? 1) /
                  Math.max(image.naturalWidth, image.naturalHeight);
            const width = image.naturalWidth * scale;
            const height = image.naturalHeight * scale;
            ctx.save();
            this.applyTransform(viewChildTransform(view, "weapon"));
            ctx.drawImage(image, -width / 2, -height / 2, width, height);
            ctx.restore();
      }
      private health(view: EntityView): void {
            const { ctx } = this;
            const size = view.config.radius * 2;
            const healthOffset = view.config.healthBarOffset;
            const x = -size / 2 + healthOffset.x;
            const y = -view.config.radius - 20 + healthOffset.y;
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
