// This module retains the original game-loop implementation while the physics
// collaborators are migrated in parallel. Its public module boundary is typed.
import { Body, Engine, Events, Runner, World } from "matter-js";
import { Fighter } from "../entities/fighter";
import { Projectile } from "../entities/projectile";
import { IndicatorSystem } from "../systems/indicator-system";
import { WeaponSystem } from "../systems/weapon-system";
import { FighterSelectPanel } from "../ui/fighter-select-panel";
import type { FighterConfig } from "../types/fighter";
import type { RuntimeConfig } from "../config/runtime-config";

type Point = { x: number; y: number };
type ImpactDamageSettings = {
      minSpeedMultiplier?: number;
      minSpeed?: number;
      damage?: number;
};

export class GameManager {
      COLLISION_COOLDOWN: number;
      ARENA_BORDER: number;
      VISUAL_OVERFLOW: number;
      paused: boolean;
      characters: Fighter[];
      projectiles: Projectile[];
      indicators: IndicatorSystem;
      gameOver: boolean;
      victorySoundPlayed: boolean;
      private _animId: number | null;
      private selectedCharacterIds: string[];
      private engine: Engine;
      world: World;
      private runner: Runner;
      private readonly container: HTMLElement;
      private readonly canvas: HTMLCanvasElement;
      private readonly ctx: CanvasRenderingContext2D;
      private readonly hudEls: { status: HTMLElement };
      private readonly weaponSystem: WeaponSystem;
      private readonly characterSelectPanel: FighterSelectPanel;
      private arenaW = 0;
      private arenaH = 0;
      private W = 0;
      private H = 0;

      constructor(
            public readonly fighterRoster: FighterConfig[],
            private readonly runtimeConfig: RuntimeConfig,
      ) {
            const cfg = this.runtimeConfig.game;
            this.COLLISION_COOLDOWN = cfg.physics.collisionCooldownMs;
            this.ARENA_BORDER = cfg.arena.borderWidth;
            this.VISUAL_OVERFLOW = cfg.arena.visualOverflow ?? 160;
            this.paused = false;
            this.characters = [];
            this.projectiles = [];
            this.indicators = new IndicatorSystem(
                  this.runtimeConfig.game,
                  this.runtimeConfig.indicators,
            );
            this.gameOver = false;
            this.victorySoundPlayed = false;
            this._animId = null;
            this.selectedCharacterIds = this._defaultSelectedCharacterIds();

            this.engine = Engine.create({
                  gravity: { x: 0, y: 0 },
                  enableSleeping: false,
            });
            this.world = this.engine.world;
            this.runner = Runner.create();
            // Supported by Matter 0.19 at runtime, though omitted from its current typings.
            Object.assign(this.runner, { isFixed: true });
            const container = document.getElementById("game-container");
            const canvas = document.getElementById("arena-canvas");
            const status = document.getElementById("hud-status");
            if (
                  !(container instanceof HTMLElement) ||
                  !(canvas instanceof HTMLCanvasElement) ||
                  !(status instanceof HTMLElement)
            ) {
                  throw new Error("Arena markup is missing required elements.");
            }
            const context = canvas.getContext("2d");
            if (!context)
                  throw new Error(
                        "Arena canvas does not support 2D rendering.",
                  );
            this.container = container;
            this.canvas = canvas;
            this.ctx = context;
            this.hudEls = { status };
            this.weaponSystem = new WeaponSystem(this);
            this.characterSelectPanel = new FighterSelectPanel(this);

            this._resizeCanvas();
            const ro = new ResizeObserver(() => this._resizeCanvas());
            ro.observe(this.container);
            this._applyConfigDOM();
            this._init();
      }

      _defaultSelectedCharacterIds() {
            return this.fighterRoster.slice(0, 2).map((config) => config.id);
      }

      _applyConfigDOM() {
            const cfg = this.runtimeConfig.game;
            document.body.style.background = cfg.arena.backgroundColor;
            this.hudEls.status.textContent = cfg.text.statusFight;
            const footer = document.getElementById("game-footer");
            if (footer) footer.textContent = cfg.text.footer;
      }

      _resizeCanvas() {
            const rect = this.container.getBoundingClientRect();
            const overflow = this.VISUAL_OVERFLOW;
            const renderScale = this.runtimeConfig.game.rendering.scale;
            this.arenaW = Math.round(rect.width);
            this.arenaH = Math.round(rect.height);
            this.W = this.arenaW + overflow * 2;
            this.H = this.arenaH + overflow * 2;
            this.canvas.width = Math.round(this.W * renderScale);
            this.canvas.height = Math.round(this.H * renderScale);
            this.canvas.style.left = `${-overflow}px`;
            this.canvas.style.top = `${-overflow}px`;
            this.canvas.style.width = `${this.W}px`;
            this.canvas.style.height = `${this.H}px`;
            // Keep all drawing and physics in CSS-pixel coordinates while the
            // backing buffer carries the extra pixels used by recordings.
            this.ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      }

      _getArena() {
            return {
                  ax: this.VISUAL_OVERFLOW,
                  ay: this.VISUAL_OVERFLOW,
                  aw: this.arenaW,
                  ah: this.arenaH,
            };
      }

      _getSelectedCharacterConfigs() {
            const byId = new Map(
                  this.fighterRoster.map((config) => [config.id, config]),
            );
            const selectedConfigs = this.selectedCharacterIds
                  .map((id) => byId.get(id))
                  .filter(
                        (config): config is FighterConfig =>
                              config !== undefined,
                  );

            if (selectedConfigs.length >= 2) {
                  return selectedConfigs.slice(0, 2);
            }

            return this.fighterRoster.slice(0, 2);
      }

      _cleanupCharacters() {
            this.characters.forEach((c) => c.destroy());
            this.characters = [];
      }

      _playSharedSound(type: string): void {
            const pool = Fighter._getSharedSoundPools(
                  this.runtimeConfig.sounds,
                  this.runtimeConfig.game,
            )[type];
            if (!pool || pool.length === 0) return;
            pool[Math.floor(Math.random() * pool.length)].play();
      }

      _spawnCharacters() {
            const configs = this._getSelectedCharacterConfigs();
            if (configs.length < 2)
                  throw new Error(
                        "At least two fighters are required to start a duel.",
                  );
            const firstConfig = configs[0]!;
            const secondConfig = configs[1]!;
            const m =
                  this.runtimeConfig.game.physics.globalSpeedMultiplier || 1.0;
            const { ax, ay, aw, ah } = this._getArena();
            const spawnData: [
                  { x: number; y: number; vx: number; vy: number },
                  { x: number; y: number; vx: number; vy: number },
            ] = [
                  {
                        x: ax + aw * 0.25,
                        y: ay + ah * 0.5,
                        vx: firstConfig.speed * m,
                        vy: firstConfig.speed * 0.6 * m,
                  },
                  {
                        x: ax + aw * 0.75,
                        y: ay + ah * 0.5,
                        vx: -secondConfig.speed * m,
                        vy: -secondConfig.speed * 0.7 * m,
                  },
            ];

            this.characters = configs.map((cfg, i) => {
                  const sd = spawnData[i];
                  const character = new Fighter(
                        cfg,
                        sd.x,
                        sd.y,
                        sd.vx,
                        sd.vy,
                        this.runtimeConfig.game,
                        this.runtimeConfig.sounds,
                  );
                  World.add(this.world, character.body);
                  return character;
            });

            const title = document.getElementById("hud-title");
            if (title)
                  title.innerHTML = `${this.characters[0]!.name} <span class="accent">VS</span> ${this.characters[1]!.name}`;
      }

      _registerCollisionEvents() {
            Events.on(this.engine, "collisionStart", (event) => {
                  if (this.gameOver) return;
                  const now = Date.now();

                  event.pairs.forEach(({ bodyA, bodyB }) => {
                        const projectile =
                              this._projectileFromBody(bodyA) ??
                              this._projectileFromBody(bodyB);
                        const charA = this._charFromBody(bodyA);
                        const charB = this._charFromBody(bodyB);
                        const character = charA ?? charB;

                        if (projectile && character) {
                              if (projectile.ownerId === character.id) return;

                              const didDamage = character.takeDamage(
                                    projectile.damage,
                                    now,
                                    this.COLLISION_COOLDOWN,
                              );
                              if (didDamage) {
                                    character.playSound("hurt");
                                    this.indicators.spawnDamageIndicator(
                                          character,
                                          projectile.damage,
                                    );
                                    this.indicators.spawnHitSpark(
                                          character.body.position,
                                          character.color,
                                    );
                                    const owner = this.characters.find(
                                          (c) => c.id === projectile.ownerId,
                                    );
                                    if (owner)
                                          this.indicators.spawnCharacterLine(
                                                owner,
                                                "weaponHit",
                                          );
                              }
                              projectile.dead = true;
                              World.remove(this.world, projectile.body);
                              this.projectiles = this.projectiles.filter(
                                    (p) => p !== projectile,
                              );
                              return;
                        }

                        if (charA && charB && charA !== charB) {
                              this._handleCharacterImpact(charA, charB, now);
                        }
                  });
            });

            Events.on(this.engine, "beforeUpdate", () => {
                  const now = performance.now();
                  const { ax, ay, aw, ah } = this._getArena();
                  const bPadding = this.ARENA_BORDER || 0;

                  this.characters.forEach((char) => {
                        if (char.isDead) return;

                        let pos = char.body.position;
                        const vel = { ...char.body.velocity };
                        const incomingSpeed = Math.hypot(vel.x, vel.y);
                        const minX = ax + char.hitbox.halfWidth + bPadding;
                        const maxX = ax + aw - char.hitbox.halfWidth - bPadding;
                        const minY = ay + char.hitbox.halfHeight + bPadding;
                        const maxY =
                              ay + ah - char.hitbox.halfHeight - bPadding;
                        let hitWall = false;
                        let hitLeftRight = false;
                        let hitTopBottom = false;

                        if (pos.x < minX) {
                              Body.setPosition(char.body, {
                                    x: minX,
                                    y: pos.y,
                              });
                              vel.x = Math.abs(vel.x);
                              hitWall = true;
                              hitLeftRight = true;
                        } else if (pos.x > maxX) {
                              Body.setPosition(char.body, {
                                    x: maxX,
                                    y: pos.y,
                              });
                              vel.x = -Math.abs(vel.x);
                              hitWall = true;
                              hitLeftRight = true;
                        }

                        pos = char.body.position;
                        if (pos.y < minY) {
                              Body.setPosition(char.body, {
                                    x: pos.x,
                                    y: minY,
                              });
                              vel.y = Math.abs(vel.y);
                              hitWall = true;
                              hitTopBottom = true;
                        } else if (pos.y > maxY) {
                              Body.setPosition(char.body, {
                                    x: pos.x,
                                    y: maxY,
                              });
                              vel.y = -Math.abs(vel.y);
                              hitWall = true;
                              hitTopBottom = true;
                        }

                        const minWallExitSpeed = char.baseSpeed * 0.2;
                        if (hitLeftRight) {
                              vel.x =
                                    vel.x > 0
                                          ? Math.max(vel.x, minWallExitSpeed)
                                          : Math.min(vel.x, -minWallExitSpeed);
                        }
                        if (hitTopBottom) {
                              vel.y =
                                    vel.y > 0
                                          ? Math.max(vel.y, minWallExitSpeed)
                                          : Math.min(vel.y, -minWallExitSpeed);
                        }

                        if (hitWall) {
                              char.playSound("body-bounce");
                              this._applyImpactDamage(
                                    char,
                                    incomingSpeed,
                                    Date.now(),
                              );
                              const currentAngle = Math.atan2(vel.y, vel.x);
                              const jitter =
                                    (Math.random() - 0.5) *
                                    ((16 * Math.PI) / 180);
                              const newAngle = currentAngle + jitter;
                              const speed =
                                    Math.sqrt(vel.x * vel.x + vel.y * vel.y) ||
                                    char.getMovementSpeed(now);
                              vel.x = Math.cos(newAngle) * speed;
                              vel.y = Math.sin(newAngle) * speed;
                        }

                        const currentSpeed = Math.sqrt(
                              vel.x * vel.x + vel.y * vel.y,
                        );
                        if (currentSpeed > 0) {
                              const ratio =
                                    char.getMovementSpeed(now) / currentSpeed;
                              vel.x *= ratio;
                              vel.y *= ratio;
                        }

                        Body.setVelocity(char.body, { x: vel.x, y: vel.y });
                  });
            });
      }

      _charFromBody(body: Body): Fighter | null {
            return this.characters.find((c) => c.body === body) || null;
      }

      _projectileFromBody(body: Body): Projectile | null {
            return this.projectiles.find((p) => p.body === body) || null;
      }

      _applyImpactDamage(
            character: Fighter,
            speed: number,
            nowMs: number,
      ): boolean {
            if (character.isDead) return false;

            const cfg = this.runtimeConfig.game.physics
                  .impactDamage as ImpactDamageSettings;
            const minSpeed =
                  cfg.minSpeed ??
                  character.baseSpeed * (cfg.minSpeedMultiplier ?? 2.8);
            if (speed < minSpeed) return false;

            const damage = cfg.damage ?? 45;
            const didDamage = character.takeDamage(
                  damage,
                  nowMs,
                  this.COLLISION_COOLDOWN,
            );
            if (!didDamage) return false;

            character.playSound("hurt");
            this.indicators.spawnDamageIndicator(character, damage);
            this.indicators.spawnHitSpark(
                  character.body.position,
                  character.color,
            );
            return true;
      }

      _handleCharacterImpact(
            charA: Fighter,
            charB: Fighter,
            nowMs: number,
      ): void {
            const speedA = Math.hypot(
                  charA.body.velocity.x,
                  charA.body.velocity.y,
            );
            const speedB = Math.hypot(
                  charB.body.velocity.x,
                  charB.body.velocity.y,
            );
            // Suppress impact damage when the fast-moving fighter was launched by the
            // potential victim — prevents slap-into-self-bounce damage.
            if (!charB.isKnockbackFrom(charA.id, nowMs)) {
                  this._applyImpactDamage(charA, speedB, nowMs);
            }
            if (!charA.isKnockbackFrom(charB.id, nowMs)) {
                  this._applyImpactDamage(charB, speedA, nowMs);
            }
      }

      _updateProjectiles() {
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                  const projectile = this.projectiles[i];
                  projectile.update();
                  if (projectile.expired) {
                        projectile.dead = true;
                        World.remove(this.world, projectile.body);
                        this.projectiles.splice(i, 1);
                  }
            }
      }

      _updateCharacterAudio() {
            const now = performance.now();
            this.characters.forEach((character) => {
                  character.updateAudio(now);
            });
      }

      _updateCharacterLines() {
            const now = performance.now();
            this.characters.forEach((character) => {
                  if (character.isDead) return;
                  const lines = character.lines ?? {};
                  if (
                        !Array.isArray(lines.ambient) ||
                        lines.ambient.length === 0
                  )
                        return;
                  const interval = lines.ambientIntervalMs ?? 6000;
                  const chance = lines.ambientChance ?? 0.25;
                  if (now - character.lastAmbientLineTime < interval) return;
                  character.lastAmbientLineTime = now;
                  if (Math.random() > chance) return;
                  this.indicators.spawnCharacterLine(character, "ambient");
            });
      }

      _startRenderLoop() {
            const ctx = this.ctx;
            const loop = () => {
                  this._animId = requestAnimationFrame(loop);

                  if (!this.paused) {
                        this.weaponSystem.update();
                        this.weaponSystem.updateFaceTargeting();
                        this._updateCharacterAudio();
                        this._updateCharacterLines();
                        Runner.tick(
                              this.runner,
                              this.engine,
                              performance.now(),
                        );
                        this.indicators.updateDamageIndicators();
                        this.indicators.updateDialogueIndicators();
                        this.indicators.updateHitSparks();
                        this._updateProjectiles();
                  }

                  ctx.clearRect(0, 0, this.W, this.H);
                  this._drawArenaBorder(ctx);
                  this._drawProjectiles(ctx);
                  this._drawCharacters(ctx);
                  this.indicators.drawDamageIndicators(ctx);
                  this.indicators.drawDialogueIndicators(ctx);
                  this.indicators.drawHitSparks(ctx);
                  if (!this.gameOver) this._checkWinCondition();
            };

            loop();
      }

      _drawArenaBorder(ctx: CanvasRenderingContext2D): void {
            const { ax, ay, aw, ah } = this._getArena();
            const b = this.ARENA_BORDER;
            ctx.save();
            ctx.strokeStyle = this.runtimeConfig.game.arena.borderColor;
            ctx.lineWidth = b * 2;
            ctx.strokeRect(ax, ay, aw, ah);
            ctx.restore();
      }

      _drawProjectiles(ctx: CanvasRenderingContext2D): void {
            this.projectiles.forEach((projectile) => {
                  const pos = projectile.body.position;
                  const r = projectile.radius;
                  ctx.save();
                  ctx.translate(pos.x, pos.y);
                  if (projectile.angle) {
                        ctx.rotate(projectile.angle);
                  }

                  if (projectile.image) {
                        const maxSide = Math.max(
                              projectile.image.naturalWidth,
                              projectile.image.naturalHeight,
                        );
                        const scale = (r * 2 * projectile.imageScale) / maxSide;
                        const width = projectile.image.naturalWidth * scale;
                        const height = projectile.image.naturalHeight * scale;
                        ctx.drawImage(
                              projectile.image,
                              -width / 2,
                              -height / 2,
                              width,
                              height,
                        );
                  } else {
                        ctx.fillStyle = "#9ad6ff";
                        ctx.beginPath();
                        ctx.arc(0, 0, r, 0, Math.PI * 2);
                        ctx.fill();
                  }

                  ctx.restore();
            });
      }

      _drawCharacters(ctx: CanvasRenderingContext2D): void {
            this.characters.forEach((char) => {
                  if (char.isDead) return;

                  const pos = char.visualPosition;
                  const r = char.radius;
                  const ang = char.body.angle;

                  if (!this.paused) {
                        if (char.hitFlashTimer > 0) char.hitFlashTimer--;
                        if (char.attackTimer > 0) char.attackTimer--;
                  }

                  const shouldFlip = char.facing !== char.defaultFacing;
                  const isFlashing = char.hitFlashTimer > 0;
                  const spriteVisual = char.getCurrentSprite();

                  if (spriteVisual) {
                        const { image, imageScale, imageOffset, imageCrop } =
                              spriteVisual;
                        const drawR = r * imageScale;
                        const { crop, dx, dy, dw, dh } = char._getCropDrawRect(
                              image,
                              imageCrop,
                              drawR,
                        );
                        ctx.save();
                        ctx.translate(
                              pos.x + imageOffset.x,
                              pos.y + imageOffset.y,
                        );
                        ctx.rotate(ang);
                        ctx.scale(shouldFlip ? -1 : 1, 1);
                        ctx.drawImage(
                              image,
                              crop.x,
                              crop.y,
                              crop.width,
                              crop.height,
                              dx,
                              dy,
                              dw,
                              dh,
                        );

                        if (isFlashing) {
                              ctx.globalCompositeOperation = "source-atop";
                              ctx.fillStyle = "rgba(255, 0, 0, 0.55)";
                              ctx.fillRect(dx, dy, dw, dh);
                        }

                        ctx.restore();
                  } else {
                        ctx.save();
                        const grad = ctx.createRadialGradient(
                              pos.x - r * 0.3,
                              pos.y - r * 0.3,
                              r * 0.05,
                              pos.x,
                              pos.y,
                              r,
                        );
                        grad.addColorStop(0, "rgba(255,255,255,0.35)");
                        grad.addColorStop(1, "rgba(0,0,0,0.25)");
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
                        ctx.fillStyle = grad;
                        ctx.fill();

                        if (isFlashing) {
                              ctx.globalCompositeOperation = "source-atop";
                              ctx.fillStyle = "rgba(255, 0, 0, 0.55)";
                              ctx.fill();
                        }

                        ctx.strokeStyle = isFlashing ? "#ff4d4d" : char.color;
                        ctx.lineWidth = 2.5;
                        ctx.stroke();
                        ctx.restore();
                  }

                  this._drawInlineHealthBar(ctx, char, pos, r);
            });
      }

      _tracePlusPath(
            ctx: CanvasRenderingContext2D,
            x: number,
            y: number,
            size: number,
      ): void {
            const unit = size / 3;
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

      _drawInlineHealthBar(
            ctx: CanvasRenderingContext2D,
            char: Fighter,
            pos: Point,
            r: number,
      ): void {
            const indicatorCfg = this.runtimeConfig.indicators;
            const ratio = char.healthRatio;
            const size = r * 2;
            const x = pos.x - size / 2 + char.healthBarOffset.x;
            const y = pos.y - r - 20 + char.healthBarOffset.y;
            const hue = ratio > 0.5 ? 120 : ratio > 0.25 ? 50 : 0;
            const fill = `hsl(${hue}, 90%, 40%)`;
            const fillHeight = Math.max(0, Math.round(ratio * size));

            ctx.save();
            this._tracePlusPath(ctx, x, y, size);
            ctx.fillStyle = "#222222";
            ctx.fill();

            ctx.save();
            this._tracePlusPath(ctx, x, y, size);
            ctx.clip();
            ctx.fillStyle = fill;
            ctx.fillRect(x, y + size - fillHeight, size, fillHeight);
            ctx.restore();

            this._tracePlusPath(ctx, x, y, size);
            ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
            ctx.lineWidth = 1.5;
            ctx.lineJoin = "round";
            ctx.stroke();

            const textCfg = indicatorCfg.text;
            const healthCfg = indicatorCfg.health;
            const fontSize = Math.max(
                  healthCfg.minFontSize,
                  size * healthCfg.sizeMultiplier,
            );
            ctx.fillStyle = healthCfg.fillColor;
            ctx.strokeStyle = healthCfg.strokeColor;
            ctx.lineWidth = healthCfg.strokeWidth;
            ctx.font = `${textCfg.weight} ${fontSize}px ${textCfg.family}`;
            ctx.textAlign = textCfg.align;
            ctx.textBaseline = textCfg.baseline;
            ctx.strokeText(
                  String(Math.ceil(char.currentHealth)),
                  x + size / 2,
                  y + size / 2,
            );
            ctx.fillText(
                  String(Math.ceil(char.currentHealth)),
                  x + size / 2,
                  y + size / 2,
            );
            ctx.restore();
      }

      _checkWinCondition() {
            const alive = this.characters.filter((c) => !c.isDead);
            if (alive.length > 1) return;

            this.gameOver = true;
            this.characters.filter((c) => c.isDead).forEach((c) => c.onDeath());
            if (alive.length === 1 && !this.victorySoundPlayed) {
                  this.victorySoundPlayed = true;
                  this._playSharedSound("victory");
            }
      }

      _restart() {
            this.hudEls.status.textContent =
                  this.runtimeConfig.game.text.statusFight;
            this.gameOver = false;
            this.victorySoundPlayed = false;
            this.paused = false;

            if (this._animId) cancelAnimationFrame(this._animId);

            World.clear(this.world, false);
            this._cleanupCharacters();
            this.projectiles = [];
            this.indicators.reset();
            this._spawnCharacters();
            this._startRenderLoop();
      }

      getSelectedCharacterIds() {
            return [...this.selectedCharacterIds];
      }

      setSelectedCharacterIds(ids: readonly string[]): void {
            const validIds = new Set(
                  this.fighterRoster.map((config) => config.id),
            );
            const nextIds = ids
                  .filter(
                        (id, index) =>
                              validIds.has(id) && ids.indexOf(id) === index,
                  )
                  .slice(0, 2);

            while (nextIds.length < 2) {
                  const fallback = this.fighterRoster.find(
                        (config) => !nextIds.includes(config.id),
                  );
                  if (!fallback) break;
                  nextIds.push(fallback.id);
            }

            const changed =
                  nextIds.join("|") !== this.selectedCharacterIds.join("|");
            this.selectedCharacterIds = nextIds;

            if (changed && this.selectedCharacterIds.length === 2) {
                  this._restart();
            }
      }

      start() {
            if (this.gameOver) return;
            this.paused = false;
      }

      pause() {
            if (this.gameOver) return;
            this.paused = true;
      }

      restart() {
            this._restart();
      }

      openCharacterSelect() {
            this.characterSelectPanel?.open();
      }

      _init() {
            this._spawnCharacters();
            this._registerCollisionEvents();
            this._startRenderLoop();
      }
}
