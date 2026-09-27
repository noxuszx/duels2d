import type { AbilitySystem } from "../abilities/ability-system";
import type { Fighter } from "../entities/fighter";
import type { Projectile } from "../entities/projectile";
import type { IndicatorSystem } from "../systems/indicator-system";
import type { RuntimeConfig } from "../config/runtime-config";

type Point = { x: number; y: number };

export interface ArenaRenderState {
      width: number;
      height: number;
      arena: { ax: number; ay: number; aw: number; ah: number };
      characters: readonly Fighter[];
      projectiles: readonly Projectile[];
      paused: boolean;
}

/** Draws a complete arena frame without owning simulation or match state. */
export class ArenaRenderer {
      constructor(
            private readonly ctx: CanvasRenderingContext2D,
            private readonly runtimeConfig: RuntimeConfig,
            private readonly abilities: AbilitySystem,
            private readonly indicators: IndicatorSystem,
      ) {}

      render(state: ArenaRenderState): void {
            const { ctx } = this;
            ctx.clearRect(0, 0, state.width, state.height);
            this.drawBorder(state.arena);
            this.drawWatermark(state.arena);
            this.drawFooter(state.arena);
            this.drawProjectiles(state.projectiles);
            this.drawCharacters(state.characters, state.paused);
            this.drawHeldWeapons(state.characters);
            this.indicators.drawDamageIndicators(ctx);
            this.indicators.drawDialogueIndicators(ctx);
            this.indicators.drawHitSparks(ctx);
      }

      private drawBorder({ ax, ay, aw, ah }: ArenaRenderState["arena"]): void {
            const { ctx } = this;
            const border = this.runtimeConfig.game.arena.borderWidth;
            ctx.save();
            ctx.strokeStyle = this.runtimeConfig.game.arena.borderColor;
            ctx.lineWidth = border * 2;
            ctx.strokeRect(ax, ay, aw, ah);
            ctx.restore();
      }

      private drawWatermark({ ax, ay, aw, ah }: ArenaRenderState["arena"]): void {
            const { ctx } = this;
            const text = "duels-2d";
            const fontSize = 24;
            const iconHeight = fontSize * 0.95;
            const iconWidth = iconHeight * 1.4;
            const spacing = 9;
            const centerY = ay + ah / 2;
            const startX = ax + aw / 2 -
                  (iconWidth + spacing + this.measure(text, fontSize)) / 2;
            const iconY = centerY - iconHeight / 2;

            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.font = `800 ${fontSize}px sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ff0000";
            ctx.beginPath();
            this.roundedRect(startX, iconY, iconWidth, iconHeight, iconHeight * 0.28);
            ctx.fill();

            const centerX = startX + iconWidth / 2;
            const triWidth = iconWidth * 0.36;
            const triHeight = iconHeight * 0.44;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(centerX - triWidth * 0.42, centerY - triHeight / 2);
            ctx.lineTo(centerX + triWidth * 0.58, centerY);
            ctx.lineTo(centerX - triWidth * 0.42, centerY + triHeight / 2);
            ctx.closePath();
            ctx.fill();

            const textX = startX + iconWidth + spacing;
            ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
            ctx.lineWidth = 2.5;
            ctx.lineJoin = "round";
            ctx.strokeText(text, textX, centerY);
            ctx.fillText(text, textX, centerY);
            ctx.restore();
      }

      private measure(text: string, fontSize: number): number {
            this.ctx.save();
            this.ctx.font = `800 ${fontSize}px sans-serif`;
            const width = this.ctx.measureText(text).width;
            this.ctx.restore();
            return width;
      }

      private roundedRect(
            x: number,
            y: number,
            width: number,
            height: number,
            radius: number,
      ): void {
            const { ctx } = this;
            if (typeof ctx.roundRect === "function") {
                  ctx.roundRect(x, y, width, height, radius);
                  return;
            }
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
      }

      private drawFooter({ ax, ay, aw, ah }: ArenaRenderState["arena"]): void {
            const { ctx } = this;
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.font = "800 18px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
            ctx.lineWidth = 3;
            ctx.lineJoin = "round";
            ctx.strokeText("LIKE & SUBSCRIBE", ax + aw / 2, ay + ah + 28);
            ctx.fillStyle = "#ffffff";
            ctx.fillText("LIKE & SUBSCRIBE", ax + aw / 2, ay + ah + 28);
            ctx.restore();
      }

      private drawProjectiles(projectiles: readonly Projectile[]): void {
            for (const projectile of projectiles) {
                  const { ctx } = this;
                  const { position } = projectile.body;
                  const radius = projectile.radius;
                  ctx.save();
                  ctx.translate(position.x, position.y);
                  if (projectile.angle) ctx.rotate(projectile.angle);
                  if (projectile.image) {
                        const maxSide = Math.max(
                              projectile.image.naturalWidth,
                              projectile.image.naturalHeight,
                        );
                        const scale = radius * 2 * projectile.imageScale / maxSide;
                        const width = projectile.image.naturalWidth * scale;
                        const height = projectile.image.naturalHeight * scale;
                        ctx.drawImage(projectile.image, -width / 2, -height / 2, width, height);
                  } else {
                        ctx.fillStyle = "#9ad6ff";
                        ctx.beginPath();
                        ctx.arc(0, 0, radius, 0, Math.PI * 2);
                        ctx.fill();
                  }
                  ctx.restore();
            }
      }

      private drawCharacters(characters: readonly Fighter[], paused: boolean): void {
            for (const fighter of characters) {
                  if (fighter.isDead) continue;
                  if (!paused) fighter.presentation.update();
                  const position = fighter.visualPosition;
                  const radius = fighter.config.radius;
                  const angle = this.abilities.getWallCrawlAngle(fighter) ?? fighter.body.angle;
                  const flip = fighter.facing !== fighter.config.defaultFacing;
                  const sprite = fighter.presentation.getCurrentSprite(
                        fighter.abilities.state,
                        this.abilities.isWallCrawling(fighter),
                  );
                  if (sprite) this.drawSprite(fighter, position, radius, angle, flip, sprite);
                  else this.drawFallbackFighter(fighter, position, radius);
                  this.drawHealthBar(fighter, position, radius);
            }
      }

      private drawSprite(
            fighter: Fighter,
            position: Point,
            radius: number,
            angle: number,
            flip: boolean,
            sprite: NonNullable<ReturnType<Fighter["presentation"]["getCurrentSprite"]>>,
      ): void {
            const { image, imageScale, imageOffset, imageCrop } = sprite;
            const rect = fighter.presentation.getCropDrawRect(
                  image,
                  imageCrop,
                  radius * imageScale,
            );
            const windingUp = fighter.abilities.state === "windup" &&
                  !this.abilities.isWallCrawling(fighter) &&
                  fighter.abilities.active?.actions.some((action) => action.type === "dash");
            const time = performance.now();
            const shakeX = windingUp ? Math.sin(time * 0.18) * 1.25 : 0;
            const shakeY = windingUp ? Math.cos(time * 0.21) : 0;
            const shakeRotation = windingUp ? Math.sin(time * 0.23) * 0.0125 : 0;
            const { ctx } = this;
            ctx.save();
            ctx.translate(position.x + imageOffset.x + shakeX, position.y + imageOffset.y + shakeY);
            ctx.rotate(angle + shakeRotation);
            ctx.scale(flip ? -1 : 1, 1);
            ctx.drawImage(
                  image,
                  rect.crop.x,
                  rect.crop.y,
                  rect.crop.width,
                  rect.crop.height,
                  rect.dx,
                  rect.dy,
                  rect.dw,
                  rect.dh,
            );
            if (fighter.presentation.isFlashing) {
                  ctx.globalCompositeOperation = "source-atop";
                  ctx.fillStyle = "rgba(255, 0, 0, 0.55)";
                  ctx.fillRect(rect.dx, rect.dy, rect.dw, rect.dh);
            }
            ctx.restore();
      }

      private drawFallbackFighter(fighter: Fighter, position: Point, radius: number): void {
            const { ctx } = this;
            ctx.save();
            const gradient = ctx.createRadialGradient(
                  position.x - radius * 0.3,
                  position.y - radius * 0.3,
                  radius * 0.05,
                  position.x,
                  position.y,
                  radius,
            );
            gradient.addColorStop(0, "rgba(255,255,255,0.35)");
            gradient.addColorStop(1, "rgba(0,0,0,0.25)");
            ctx.beginPath();
            ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
            if (fighter.presentation.isFlashing) {
                  ctx.globalCompositeOperation = "source-atop";
                  ctx.fillStyle = "rgba(255, 0, 0, 0.55)";
                  ctx.fill();
            }
            ctx.strokeStyle = fighter.presentation.isFlashing ? "#ff4d4d" : fighter.config.color;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
      }

      private drawHeldWeapons(characters: readonly Fighter[]): void {
            for (const fighter of characters) {
                  if (fighter.isDead || fighter.abilities.state === "idle") continue;
                  const presentation = fighter.presentation;
                  const image = presentation.weaponAttack ?? presentation.weaponIdle;
                  if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) continue;
                  const scale = fighter.config.radius * 2 * presentation.weaponScale /
                        Math.max(image.naturalWidth, image.naturalHeight);
                  const width = image.naturalWidth * scale;
                  const height = image.naturalHeight * scale;
                  const { ctx } = this;
                  ctx.save();
                  ctx.translate(fighter.visualPosition.x, fighter.visualPosition.y);
                  ctx.rotate(this.abilities.getWallCrawlAngle(fighter) ?? fighter.body.angle);
                  const facing = fighter.abilities.facing ?? fighter.facing;
                  ctx.scale(facing !== fighter.config.defaultFacing ? -1 : 1, 1);
                  ctx.translate(presentation.weaponPivot.x, presentation.weaponPivot.y);
                  ctx.rotate(this.abilities.getWeaponSwingAngle(fighter) ?? 0);
                  ctx.drawImage(
                        image,
                        presentation.weaponOffset.x - presentation.weaponPivot.x - width / 2,
                        presentation.weaponOffset.y - presentation.weaponPivot.y - height / 2,
                        width,
                        height,
                  );
                  ctx.restore();
            }
      }

      private tracePlus(x: number, y: number, size: number): void {
            const unit = size / 3;
            const { ctx } = this;
            ctx.beginPath();
            ctx.moveTo(x + unit, y);
            ctx.lineTo(x + unit * 2, y);
            ctx.lineTo(x + unit * 2, y + unit);
            ctx.lineTo(x + size, y + unit);
            ctx.lineTo(x + size, y + unit * 2);
            ctx.lineTo(x + unit * 2, y + unit * 2);
            ctx.lineTo(x + unit * 2, y + size);
            ctx.lineTo(x + unit, y + size);
            ctx.lineTo(x + unit, y + unit * 2);
            ctx.lineTo(x, y + unit * 2);
            ctx.lineTo(x, y + unit);
            ctx.lineTo(x + unit, y + unit);
            ctx.closePath();
      }

      private drawHealthBar(fighter: Fighter, position: Point, radius: number): void {
            const { ctx } = this;
            const ratio = fighter.healthRatio;
            const size = radius * 2;
            const x = position.x - size / 2 + fighter.presentation.healthBarOffset.x;
            const y = position.y - radius - 20 + fighter.presentation.healthBarOffset.y;
            const fillHeight = Math.max(0, Math.round(ratio * size));
            ctx.save();
            this.tracePlus(x, y, size);
            ctx.fillStyle = "#222222";
            ctx.fill();
            ctx.save();
            this.tracePlus(x, y, size);
            ctx.clip();
            ctx.fillStyle = `hsl(${ratio > 0.5 ? 120 : ratio > 0.25 ? 50 : 0}, 90%, 40%)`;
            ctx.fillRect(x, y + size - fillHeight, size, fillHeight);
            ctx.restore();
            this.tracePlus(x, y, size);
            ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
            ctx.lineWidth = 1.5;
            ctx.lineJoin = "round";
            ctx.stroke();

            const { text, health } = this.runtimeConfig.indicators;
            const fontSize = Math.max(health.minFontSize, size * health.sizeMultiplier);
            ctx.fillStyle = health.fillColor;
            ctx.strokeStyle = health.strokeColor;
            ctx.lineWidth = health.strokeWidth;
            ctx.font = `${text.weight} ${fontSize}px ${text.family}`;
            ctx.textAlign = text.align;
            ctx.textBaseline = text.baseline;
            const value = String(Math.ceil(fighter.currentHealth));
            ctx.strokeText(value, x + size / 2, y + size / 2);
            ctx.fillText(value, x + size / 2, y + size / 2);
            ctx.restore();
      }
}
