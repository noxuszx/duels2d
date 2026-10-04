import { Body } from "matter-js";
import { Simulation, SIMULATION_STEP_MS } from "../engine/simulation";
import { createFighter } from "../gameplay/fighter-factory";
import { fighterBlueprints } from "../content/manifest";
import { CanvasRenderer } from "../presentation/canvas-renderer";
import { entityView } from "../presentation/view";
import { EntityAudio, type SoundPlayback } from "../presentation/audio";
import { FighterSelectPanel } from "../ui/fighter-select-panel";
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

/** Browser shell. Physics, combat, components and lifetimes live in Simulation. */
export class GameApp {
      paused = false;
      simulation!: Simulation;
      private readonly canvas: HTMLCanvasElement;
      private readonly container: HTMLElement;
      private readonly renderer: CanvasRenderer;
      private readonly selection: FighterSelectPanel;
      private readonly width: number;
      private readonly height: number;
      private readonly arenaWidth: number;
      private readonly arenaHeight: number;
      private readonly overflow: number;
      private selected: string[];
      private participantTeams: string[] | null = null;
      private previousFrame = 0;
      private accumulator = 0;
      private readonly voices = new Map<string, EntityAudio>();
      private readonly boundSounds = new Map<string, SoundPlayback & { entityId: string }>();
      readonly seed = 1;

      constructor(public readonly fighterRoster: FighterConfig[], private readonly config: RuntimeConfig) {
            const canvas = document.getElementById("arena-canvas");
            const container = document.getElementById("game-container");
            if (!(canvas instanceof HTMLCanvasElement) || !(container instanceof HTMLElement))
                  throw new Error("Arena markup is missing");
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas 2D rendering unavailable");
            this.canvas = canvas; this.container = container;
            this.arenaWidth = Math.round(container.getBoundingClientRect().width);
            this.arenaHeight = Math.round(container.getBoundingClientRect().height);
            this.overflow = config.game.arena.visualOverflow;
            this.width = this.arenaWidth + this.overflow * 2;
            this.height = this.arenaHeight + this.overflow * 2;
            const scale = config.game.rendering.scale;
            canvas.width = Math.round(this.width * scale); canvas.height = Math.round(this.height * scale);
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            this.renderer = new CanvasRenderer(ctx, config);
            const selectable = fighterRoster.filter(fighter => fighter.selectable !== false);
            const first = selectable.find(fighter => fighterBlueprints.has(fighter.id)) ?? selectable[0];
            const second = selectable.find(fighter => fighter !== first);
            if (!first || !second) throw new Error("Two fighter configurations are required");
            this.selected = [first.id, second.id];
            this.selection = new FighterSelectPanel(this);
            new ResizeObserver(() => this.resizeView()).observe(container);
            this.resizeView();
            document.body.style.background = config.game.arena.backgroundColor;
            this.restart();
            requestAnimationFrame(time => this.frame(time));
      }
      get gameOver(): boolean { return this.simulation.state === "ended"; }
      private resizeView(): void {
            const size = this.container.getBoundingClientRect();
            const scale = Math.min(size.width / this.arenaWidth, size.height / this.arenaHeight);
            this.canvas.style.width = `${this.width * scale}px`;
            this.canvas.style.height = `${this.height * scale}px`;
            this.canvas.style.left = `${-this.overflow * scale}px`;
            this.canvas.style.top = `${-this.overflow * scale}px`;
      }
      private frame(time: number): void {
            const delta = this.previousFrame ? Math.min(250, Math.max(0, time - this.previousFrame)) : 0;
            this.previousFrame = time;
            if (!this.paused && !this.gameOver) {
                  this.accumulator += delta;
                  while (this.accumulator >= SIMULATION_STEP_MS && !this.gameOver) {
                        this.simulation.step();
                        this.consumeEffects();
                        this.accumulator -= SIMULATION_STEP_MS;
                  }
            }
            const views = this.simulation.entities.all().map(entityView);
            this.renderer.render(this.width, this.height, { ax: this.overflow, ay: this.overflow,
                  aw: this.arenaWidth, ah: this.arenaHeight }, views, this.simulation.nowMs);
            requestAnimationFrame(next => this.frame(next));
      }
      private consumeEffects(): void {
            const world = this.simulation;
            for (const event of world.events.splice(0)) {
                  if (event.kind === "damage") {
                        const entity = world.entities.get(event.targetId);
                        if (entity) { this.renderer.hit(event.targetId, event.amount, entityView(entity), world.nowMs);
                              this.voices.get(event.targetId)?.play("hurt"); }
                  } else if (event.kind === "match-ended") {
                        const outcome = event.outcome;
                        const status = document.getElementById("hud-status");
                        if (status) status.textContent = outcome.kind === "draw" ? "DRAW"
                              : world.entities.all().filter(entity => entity.teamId === outcome.teamId &&
                                    entity.tags.has("contestant")).map(entity => entity.config.name).join(" & ") + " WINS";
                        const victoryPlayback = event.outcome.kind === "winner"
                              ? EntityAudio.playShared("victory", this.config.sounds, this.config.game) : null;
                        window.dispatchEvent(new CustomEvent("duels2d:gameover", { detail: { victoryPlayback } }));
                        this.dispatchPlayback();
                  }
            }
            for (const entity of world.entities.all()) {
                  let voice = this.voices.get(entity.runtimeId);
                  if (!voice) {
                        voice = new EntityAudio(entity.configId, this.config.game, this.config.sounds, () => world.nowMs);
                        this.voices.set(entity.runtimeId, voice);
                  }
                  for (const event of entity.presentation.drainEvents()) {
                        const payload = event.payload as { cue?: string; token?: string } | undefined;
                        if (event.type === "sound" && payload?.cue) {
                              const playback = voice.play(payload.cue);
                              if (payload.token && playback && voice.isActionBound(payload.cue))
                                    this.boundSounds.set(payload.token, { ...playback, entityId: entity.runtimeId });
                        } else if (event.type === "sound-stop" && payload?.token) {
                              const playback = this.boundSounds.get(payload.token);
                              playback?.sound.stop(playback.playbackId);
                              this.boundSounds.delete(payload.token);
                        }
                  }
                  voice.update(world.nowMs, entity.isAlive && !entity.behavior?.isRunning && !this.gameOver);
            }
            for (const [id, voice] of this.voices) if (!world.entities.get(id)) {
                  for (const [token, playback] of this.boundSounds) if (playback.entityId === id) {
                        playback.sound.stop(playback.playbackId);
                        this.boundSounds.delete(token);
                  }
                  voice.destroy(); this.voices.delete(id);
            }
      }
      restart(): void {
            this.simulation?.dispose();
            for (const playback of this.boundSounds.values()) playback.sound.stop(playback.playbackId);
            for (const voice of this.voices.values()) voice.destroy();
            this.voices.clear(); this.boundSounds.clear(); this.renderer.reset();
            const border = this.config.game.arena.borderWidth;
            this.simulation = new Simulation({ arena: { minX: this.overflow + border, minY: this.overflow + border,
                  maxX: this.overflow + this.arenaWidth - border, maxY: this.overflow + this.arenaHeight - border },
                  seed: this.seed, impact: this.config.game.physics.impactDamage,
                  collisionCooldownMs: this.config.game.physics.collisionCooldownMs,
                  globalSpeedMultiplier: this.config.game.physics.globalSpeedMultiplier });
            const groups = new Map<string, number>();
            for (let slot = 0; slot < this.selected.length; slot++) {
                  const config = this.fighterRoster.find(fighter => fighter.id === this.selected[slot])!;
                  const team = this.participantTeams?.[slot] ?? `team:${slot}`;
                  if (!groups.has(team)) groups.set(team, Body.nextGroup(true));
                  const speed = config.speed * this.config.game.physics.globalSpeedMultiplier;
                  createFighter(this.simulation, config, { runtimeId: `fighter:${slot}`, teamId: team,
                        collisionGroup: groups.get(team),
                        position: { x: this.overflow + this.arenaWidth * (slot ? .75 : .25), y: this.overflow + this.arenaHeight / 2 },
                        velocity: { x: slot ? -speed : speed, y: speed * (slot ? -.7 : .6) },
                  }, fighterBlueprints.get(config.id));
            }
            const title = document.getElementById("hud-title");
            if (title) title.textContent = this.selected.map(id => this.fighterRoster.find(fighter => fighter.id === id)!.name).join(" VS ");
            const status = document.getElementById("hud-status");
            if (status) status.textContent = this.config.game.text.statusFight;
            this.paused = false; this.accumulator = 0; this.previousFrame = 0;
            this.dispatchPlayback();
      }
      start(): void { if (!this.gameOver) { this.paused = false; this.dispatchPlayback(); } }
      pause(): void { if (!this.gameOver) { this.paused = true; this.dispatchPlayback(); } }
      openCharacterSelect(): void { this.selection.open(); }
      getSelectedCharacterIds(): string[] { return [...this.selected]; }
      setSelectedCharacterIds(ids: readonly string[]): void {
            const valid = ids.filter((id, index) => ids.indexOf(id) === index && this.fighterRoster.some(fighter => fighter.id === id && fighter.selectable !== false)).slice(0, 2);
            if (valid.length !== 2) return;
            this.selected = valid; this.participantTeams = null; this.restart(); this.pause();
      }
      setMatchParticipants(participants: readonly { configId: string; teamId: string }[]): void {
            if (participants.length !== 2 || participants.some(participant => !participant.teamId ||
                  !this.fighterRoster.some(fighter => fighter.id === participant.configId && fighter.selectable !== false)))
                  throw new Error("A match requires two selectable participants with teams");
            this.selected = participants.map(participant => participant.configId);
            this.participantTeams = participants.map(participant => participant.teamId);
            this.restart(); this.pause();
      }
      getRecordingView(): RecordingView {
            const views = this.simulation.entities.all().map(entityView);
            return { canvas: this.canvas, logicalWidth: this.width, logicalHeight: this.height, visualOverflow: this.overflow,
                  backgroundColor: this.config.game.arena.backgroundColor, arenaBackgroundColor: getComputedStyle(this.container).backgroundColor,
                  arenaWidth: this.arenaWidth, arenaHeight: this.arenaHeight,
                  fighterNames: views.map(view => view.config.name), targets: views.filter(view => !view.dead).map(view => ({ x: view.x, y: view.y })) };
      }
      private dispatchPlayback(): void {
            window.dispatchEvent(new CustomEvent("duels2d:playback", { detail: { paused: this.paused, gameOver: this.gameOver } }));
      }
}
