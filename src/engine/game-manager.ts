// This module retains the original game-loop implementation while the physics
// collaborators are migrated in parallel. Its public module boundary is typed.
import { Engine, World } from "matter-js";
import { Fighter } from "../entities/fighter";
import { FighterAudio, type SoundPlayback } from "../entities/fighter-audio";
import { Projectile } from "../entities/projectile";
import { IndicatorSystem } from "../systems/indicator-system";
import { AbilitySystem } from "../abilities/ability-system";
import { FighterSelectPanel } from "../ui/fighter-select-panel";
import { ArenaRenderer } from "../rendering/arena-renderer";
import { CombatSystem } from "./combat-system";
import type { FighterConfig } from "../types/fighter";
import type { RuntimeConfig } from "../config/runtime-config";

export interface RecordingView {
      canvas: HTMLCanvasElement;
      logicalWidth: number;
      logicalHeight: number;
      visualOverflow: number;
      backgroundColor: string;
      arenaBackgroundColor: string;
      arenaWidth: number;
      arenaHeight: number;
      fighterNames: string[];
      targets: Array<{ x: number; y: number }>;
}
const SIMULATION_STEP_MS = 1000 / 120;
const GAME_SPEED = 1;
const MAX_FRAME_DELTA_MS = 250;

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
      private readonly container: HTMLElement;
      private readonly canvas: HTMLCanvasElement;
      private readonly ctx: CanvasRenderingContext2D;
      private readonly hudEls: { status: HTMLElement };
      private readonly abilitySystem: AbilitySystem;
      private readonly characterSelectPanel: FighterSelectPanel;
      private readonly renderer: ArenaRenderer;
      private readonly combatSystem: CombatSystem;
      private readonly arenaBackgroundColor: string;
      private arenaW = 0;
      private arenaH = 0;
      private W = 0;
      private H = 0;
      private simulationTimeMs = 0;
      private frameAccumulatorMs = 0;
      private previousFrameTimeMs = 0;

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
            this.arenaBackgroundColor = getComputedStyle(container).backgroundColor;
            this.hudEls = { status };
            this.abilitySystem = new AbilitySystem(this);
            this.combatSystem = new CombatSystem(
                  this.engine,
                  this,
                  this.abilitySystem,
                  this.indicators,
                  this.runtimeConfig.game,
            );
            this.renderer = new ArenaRenderer(
                  this.ctx,
                  this.runtimeConfig,
                  this.abilitySystem,
                  this.indicators,
            );
            this.characterSelectPanel = new FighterSelectPanel(this);

            this._resizeCanvas();
            const ro = new ResizeObserver(() => this._resizeCanvas());
            ro.observe(this.container);
            this._applyConfigDOM();
            this._init();
      }

      now(): number {
            return this.simulationTimeMs;
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

      getArena() {
            return {
                  ax: this.VISUAL_OVERFLOW,
                  ay: this.VISUAL_OVERFLOW,
                  aw: this.arenaW,
                  ah: this.arenaH,
            };
      }

      isGameOver(): boolean {
            return this.gameOver;
      }

      getRecordingView(): RecordingView {
            const alive = this.characters.filter((c) => !c.isDead);
            const activeTargets = alive.length > 0 ? alive : this.characters;
            return {
                  canvas: this.canvas,
                  logicalWidth: this.W,
                  logicalHeight: this.H,
                  visualOverflow: this.VISUAL_OVERFLOW,
                  backgroundColor: this.runtimeConfig.game.arena.backgroundColor,
                  arenaBackgroundColor: this.arenaBackgroundColor,
                  arenaWidth: this.arenaW,
                  arenaHeight: this.arenaH,
                  fighterNames: this.characters.map(
                        (character) => character.config.name,
                  ),
                  targets: activeTargets.map((character) => ({
                        x: character.body.position.x,
                        y: character.body.position.y,
                  })),
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

      _playSharedSound(type: string): SoundPlayback | null {
            return FighterAudio.playShared(
                  type,
                  this.runtimeConfig.sounds,
                  this.runtimeConfig.game,
            );
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
            const { ax, ay, aw, ah } = this.getArena();
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
                        () => this.now(),
                  );
                  World.add(this.world, character.body);
                  return character;
            });

            const title = document.getElementById("hud-title");
            if (title)
                  title.innerHTML = `${this.characters[0]!.config.name} <span class="accent">VS</span> ${this.characters[1]!.config.name}`;
      }

      _updateCharacterAudio() {
            const now = this.now();
            this.characters.forEach((character) => {
                  character.updateAudio(now);
            });
      }

      _updateCharacterLines() {
            const now = this.now();
            this.characters.forEach((character) => {
                  if (character.isDead) return;
                  const lines = character.config.lines ?? {};
                  if (
                        !Array.isArray(lines.ambient) ||
                        lines.ambient.length === 0
                  )
                        return;
                  const interval = lines.ambientIntervalMs ?? 6000;
                  const chance = lines.ambientChance ?? 0.25;
                  if (now - character.lastAmbientLineTime < interval)
                        return;
                  character.lastAmbientLineTime = now;
                  if (Math.random() > chance) return;
                  this.indicators.spawnCharacterLine(character, "ambient");
            });
      }

      _startRenderLoop() {
            this.previousFrameTimeMs = performance.now();
            this.frameAccumulatorMs = 0;
            const loop = (frameTime: number) => {
                  this._animId = requestAnimationFrame(loop);
                  const deltaMs = Math.min(
                        MAX_FRAME_DELTA_MS,
                        Math.max(0, frameTime - this.previousFrameTimeMs),
                  );
                  this.previousFrameTimeMs = frameTime;

                  if (!this.paused) {
                        this.frameAccumulatorMs += deltaMs * GAME_SPEED;
                        while (this.frameAccumulatorMs >= SIMULATION_STEP_MS) {
                              this._stepSimulation(SIMULATION_STEP_MS);
                              this.frameAccumulatorMs -= SIMULATION_STEP_MS;
                        }
                  }

                  this.renderer.render({
                        width: this.W,
                        height: this.H,
                        arena: this.getArena(),
                        characters: this.characters,
                        projectiles: this.projectiles,
                        paused: this.paused,
                  });
            };

            this._animId = requestAnimationFrame(loop);
      }

      private _stepSimulation(deltaMs: number): void {
            this.simulationTimeMs += deltaMs;
            this.abilitySystem.update(deltaMs);
            this.abilitySystem.updateFaceTargeting();
            this._updateCharacterAudio();
            this._updateCharacterLines();
            Engine.update(this.engine, deltaMs);
            this.indicators.updateDamageIndicators();
            this.indicators.updateDialogueIndicators();
            this.indicators.updateHitSparks();
            this.combatSystem.updateProjectiles(deltaMs);
            this._checkWinCondition();
      }

      _checkWinCondition() {
            if (this.gameOver) return;
            const alive = this.characters.filter((c) => !c.isDead);
            if (alive.length > 1) return;

            this.gameOver = true;
            this.characters.filter((c) => c.isDead).forEach((c) => c.onDeath());
            this.combatSystem.updateProjectiles(0);
            let victoryPlayback: SoundPlayback | null = null;
            if (alive.length === 1 && !this.victorySoundPlayed) {
                  this.victorySoundPlayed = true;
                  victoryPlayback = this._playSharedSound("victory");
            }
            window.dispatchEvent(
                  new CustomEvent("duels2d:gameover", {
                        detail: { victoryPlayback },
                  }),
            );
            this._dispatchPlaybackState();
      }

      _restart() {
            this.hudEls.status.textContent =
                  this.runtimeConfig.game.text.statusFight;
            this.gameOver = false;
            this.victorySoundPlayed = false;
            this.paused = false;
            this.simulationTimeMs = 0;
            this.frameAccumulatorMs = 0;

            if (this._animId !== null) cancelAnimationFrame(this._animId);

            this.abilitySystem.resetAll();
            this.combatSystem.clearProjectiles("reset");
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
                  this.pause();
            }
      }

      start() {
            if (this.gameOver) return;
            this.paused = false;
            this._dispatchPlaybackState();
      }

      pause() {
            if (this.gameOver) return;
            this.paused = true;
            this._dispatchPlaybackState();
      }

      restart() {
            this._restart();
            this._dispatchPlaybackState();
      }

      private _dispatchPlaybackState(): void {
            window.dispatchEvent(
                  new CustomEvent("duels2d:playback", {
                        detail: {
                              paused: this.paused,
                              gameOver: this.gameOver,
                        },
                  }),
            );
      }

      openCharacterSelect() {
            this.characterSelectPanel?.open();
      }

      _init() {
            this._spawnCharacters();
            this.combatSystem.register();
            this._startRenderLoop();
      }
}
