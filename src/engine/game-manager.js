"use strict";

const { Engine, Runner, Bodies, Body, World, Events } = Matter;

class GameManager {
  constructor() {
    const cfg = window.GameConfig;
    this.COLLISION_COOLDOWN = cfg.physics.collisionCooldownMs;
    this.ARENA_BORDER = cfg.arena.borderWidth;
    this.VISUAL_OVERFLOW = cfg.arena.visualOverflow ?? 160;
    this.paused = false;
    this.characters = [];
    this.projectiles = [];
    this.indicators = new IndicatorSystem();
    this.gameOver = false;
    this.victorySoundPlayed = false;
    this._animId = null;
    this.selectedCharacterIds = this._defaultSelectedCharacterIds();

    this.engine = Engine.create({
      gravity: { x: 0, y: 0 },
      enableSleeping: false,
    });
    this.world = this.engine.world;
    this.runner = Runner.create({ isFixed: true });
    this.container = document.getElementById("game-container");
    this.canvas = document.getElementById("arena-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.hudEls = { status: document.getElementById("hud-status") };
    this.weaponSystem = new WeaponSystem(this);
    this.characterSelectPanel =
      typeof FighterSelectPanel === "undefined"
        ? null
        : new FighterSelectPanel(this);

    this._resizeCanvas();
    const ro = new ResizeObserver(() => this._resizeCanvas());
    ro.observe(this.container);
    this._applyConfigDOM();
    this._init();
  }

  _defaultSelectedCharacterIds() {
    return window.FighterRoster.slice(0, 2).map((config) => config.id);
  }

  _applyConfigDOM() {
    const cfg = window.GameConfig;
    document.body.style.background = cfg.arena.backgroundColor;
    this.hudEls.status.textContent = cfg.text.statusFight;
    document.getElementById("game-footer").textContent = cfg.text.footer;
  }

  _resizeCanvas() {
    const rect = this.container.getBoundingClientRect();
    const overflow = this.VISUAL_OVERFLOW;
    this.arenaW = Math.round(rect.width);
    this.arenaH = Math.round(rect.height);
    this.W = this.canvas.width = this.arenaW + overflow * 2;
    this.H = this.canvas.height = this.arenaH + overflow * 2;
    this.canvas.style.left = `${-overflow}px`;
    this.canvas.style.top = `${-overflow}px`;
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
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
      window.FighterRoster.map((config) => [config.id, config]),
    );
    const selectedConfigs = this.selectedCharacterIds
      .map((id) => byId.get(id))
      .filter(Boolean);

    if (selectedConfigs.length >= 2) {
      return selectedConfigs.slice(0, 2);
    }

    return window.FighterRoster.slice(0, 2);
  }

  _cleanupCharacters() {
    this.characters.forEach((c) => c.destroy());
    this.characters = [];
  }

  _playSharedSound(type) {
    const pool = Character._getSharedSoundPools()?.[type];
    if (!pool || pool.length === 0) return;
    pool[Math.floor(Math.random() * pool.length)].play();
  }

  _spawnCharacters() {
    const configs = this._getSelectedCharacterConfigs();
    const m = window.GameConfig.physics.globalSpeedMultiplier || 1.0;
    const { ax, ay, aw, ah } = this._getArena();
    const spawnData = [
      {
        x: ax + aw * 0.25,
        y: ay + ah * 0.5,
        vx: configs[0].speed * m,
        vy: configs[0].speed * 0.6 * m,
      },
      {
        x: ax + aw * 0.75,
        y: ay + ah * 0.5,
        vx: -configs[1].speed * m,
        vy: -configs[1].speed * 0.7 * m,
      },
    ];

    this.characters = configs.map((cfg, i) => {
      const sd = spawnData[i];
      const character = new Character(cfg, sd.x, sd.y, sd.vx, sd.vy);
      World.add(this.world, character.body);
      return character;
    });

    document.getElementById("hud-title").innerHTML =
      `${this.characters[0].name} <span class="accent">VS</span> ${this.characters[1].name}`;
  }

  _registerCollisionEvents() {
    Events.on(this.engine, "collisionStart", (event) => {
      if (this.gameOver) return;
      const now = Date.now();

      event.pairs.forEach(({ bodyA, bodyB }) => {
        const projectile =
          this._projectileFromBody(bodyA) ?? this._projectileFromBody(bodyB);
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
            this.indicators.spawnDamageIndicator(character, projectile.damage);
            this.indicators.spawnHitSpark(character.body.position, character.color);
            const owner = this.characters.find(
              (c) => c.id === projectile.ownerId,
            );
            if (owner) this.indicators.spawnCharacterLine(owner, "weaponHit");
          }
          projectile.dead = true;
          World.remove(this.world, projectile.body);
          this.projectiles = this.projectiles.filter((p) => p !== projectile);
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
        const maxY = ay + ah - char.hitbox.halfHeight - bPadding;
        let hitWall = false;
        let hitLeftRight = false;
        let hitTopBottom = false;

        if (pos.x < minX) {
          Body.setPosition(char.body, { x: minX, y: pos.y });
          vel.x = Math.abs(vel.x);
          hitWall = true;
          hitLeftRight = true;
        } else if (pos.x > maxX) {
          Body.setPosition(char.body, { x: maxX, y: pos.y });
          vel.x = -Math.abs(vel.x);
          hitWall = true;
          hitLeftRight = true;
        }

        pos = char.body.position;
        if (pos.y < minY) {
          Body.setPosition(char.body, { x: pos.x, y: minY });
          vel.y = Math.abs(vel.y);
          hitWall = true;
          hitTopBottom = true;
        } else if (pos.y > maxY) {
          Body.setPosition(char.body, { x: pos.x, y: maxY });
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
          this._applyImpactDamage(char, incomingSpeed, Date.now());
          const currentAngle = Math.atan2(vel.y, vel.x);
          const jitter = (Math.random() - 0.5) * ((16 * Math.PI) / 180);
          const newAngle = currentAngle + jitter;
          const speed =
            Math.sqrt(vel.x * vel.x + vel.y * vel.y) ||
            char.getMovementSpeed(now);
          vel.x = Math.cos(newAngle) * speed;
          vel.y = Math.sin(newAngle) * speed;
        }

        const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        if (currentSpeed > 0) {
          const ratio = char.getMovementSpeed(now) / currentSpeed;
          vel.x *= ratio;
          vel.y *= ratio;
        }

        Body.setVelocity(char.body, { x: vel.x, y: vel.y });
      });
    });
  }

  _charFromBody(body) {
    return this.characters.find((c) => c.body === body) || null;
  }

  _projectileFromBody(body) {
    return this.projectiles.find((p) => p.body === body) || null;
  }

  _applyImpactDamage(character, speed, nowMs) {
    if (character.isDead) return false;

    const cfg = window.GameConfig.physics.impactDamage ?? {};
    const minSpeed =
      cfg.minSpeed ?? character.baseSpeed * (cfg.minSpeedMultiplier ?? 2.8);
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
    this.indicators.spawnHitSpark(character.body.position, character.color);
    return true;
  }

  _handleCharacterImpact(charA, charB, nowMs) {
    const speedA = Math.hypot(charA.body.velocity.x, charA.body.velocity.y);
    const speedB = Math.hypot(charB.body.velocity.x, charB.body.velocity.y);
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
      if (!Array.isArray(lines.ambient) || lines.ambient.length === 0) return;
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
        Runner.tick(this.runner, this.engine, performance.now());
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

  _drawArenaBorder(ctx) {
    const { ax, ay, aw, ah } = this._getArena();
    const b = this.ARENA_BORDER;
    ctx.save();
    ctx.strokeStyle = window.GameConfig.arena.borderColor;
    ctx.lineWidth = b * 2;
    ctx.strokeRect(ax, ay, aw, ah);
    ctx.restore();
  }

  _drawProjectiles(ctx) {
    this.projectiles.forEach((projectile) => {
      const pos = projectile.body.position;
      const r = projectile.radius;
      ctx.save();

      if (projectile.image) {
        ctx.drawImage(projectile.image, pos.x - r, pos.y - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = "#9ad6ff";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  _drawCharacters(ctx) {
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
        const { image, imageScale, imageOffset, imageCrop } = spriteVisual;
        const drawR = r * imageScale;
        const { crop, dx, dy, dw, dh } = char._getCropDrawRect(
          image,
          imageCrop,
          drawR,
        );
        ctx.save();
        ctx.translate(pos.x + imageOffset.x, pos.y + imageOffset.y);
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

  _tracePlusPath(ctx, x, y, size) {
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

  _drawInlineHealthBar(ctx, char, pos, r) {
    const indicatorCfg = window.IndicatorConfig;
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
    this.characters
      .filter((c) => c.isDead)
      .forEach((c) => c.onDeath());
    if (alive.length === 1 && !this.victorySoundPlayed) {
      this.victorySoundPlayed = true;
      this._playSharedSound("victory");
    }
  }

  _restart() {
    this.hudEls.status.textContent = window.GameConfig.text.statusFight;
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

  setSelectedCharacterIds(ids) {
    const validIds = new Set(
      window.FighterRoster.map((config) => config.id),
    );
    const nextIds = ids
      .filter((id, index) => validIds.has(id) && ids.indexOf(id) === index)
      .slice(0, 2);

    while (nextIds.length < 2) {
      const fallback = window.FighterRoster.find(
        (config) => !nextIds.includes(config.id),
      );
      if (!fallback) break;
      nextIds.push(fallback.id);
    }

    const changed = nextIds.join("|") !== this.selectedCharacterIds.join("|");
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
