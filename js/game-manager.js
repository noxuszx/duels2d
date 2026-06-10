'use strict';

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
    this.damageIndicators = [];
    this.hitSparks = [];
    this.gameOver = false;
    this._animId = null;
    this.selectedCharacterIds = this._defaultSelectedCharacterIds();

    this.engine = Engine.create({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    this.world = this.engine.world;
    this.runner = Runner.create({ isFixed: true });
    this.container = document.getElementById('game-container');
    this.canvas = document.getElementById('arena-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.hudEls = { status: document.getElementById('hud-status') };
    this.characterSelectPanel = typeof CharacterSelectPanel === 'undefined'
      ? null
      : new CharacterSelectPanel(this);

    this._resizeCanvas();
    const ro = new ResizeObserver(() => this._resizeCanvas());
    ro.observe(this.container);
    this._applyConfigDOM();
    this._init();
  }

  _defaultSelectedCharacterIds() {
    return window.CharacterConfigs.slice(0, 2).map((config) => config.id);
  }

  _applyConfigDOM() {
    const cfg = window.GameConfig;
    document.body.style.background = cfg.arena.backgroundColor;
    this.hudEls.status.textContent = cfg.text.statusFight;
    document.getElementById('game-footer').textContent = cfg.text.footer;
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
    const byId = new Map(window.CharacterConfigs.map((config) => [config.id, config]));
    const selectedConfigs = this.selectedCharacterIds.map((id) => byId.get(id)).filter(Boolean);

    if (selectedConfigs.length >= 2) {
      return selectedConfigs.slice(0, 2);
    }

    return window.CharacterConfigs.slice(0, 2);
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

    document.getElementById('hud-title').innerHTML =
      `${this.characters[0].name} <span class="accent">VS</span> ${this.characters[1].name}`;
  }

  _registerCollisionEvents() {
    Events.on(this.engine, 'collisionStart', (event) => {
      if (this.gameOver) return;
      const now = Date.now();

      event.pairs.forEach(({ bodyA, bodyB }) => {
        const projectile = this._projectileFromBody(bodyA) ?? this._projectileFromBody(bodyB);
        const character = this._charFromBody(bodyA) ?? this._charFromBody(bodyB);

        if (projectile && character) {
          if (projectile.ownerId === character.id) return;

          character.takeDamage(projectile.damage, now, this.COLLISION_COOLDOWN);
          character.playSound('hurt');
          this._spawnDamageIndicator(character, projectile.damage);
          this._spawnHitSpark(character.body.position, character.color);
          projectile.dead = true;
          World.remove(this.world, projectile.body);
          this.projectiles = this.projectiles.filter((p) => p !== projectile);
          return;
        }


      });
    });

    Events.on(this.engine, 'beforeUpdate', () => {
      const { ax, ay, aw, ah } = this._getArena();
      const bPadding = this.ARENA_BORDER || 0;

      this.characters.forEach((char) => {
        if (char.isDead) return;

        let pos = char.body.position;
        const vel = { ...char.body.velocity };
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
          vel.x = vel.x > 0 ? Math.max(vel.x, minWallExitSpeed) : Math.min(vel.x, -minWallExitSpeed);
        }
        if (hitTopBottom) {
          vel.y = vel.y > 0 ? Math.max(vel.y, minWallExitSpeed) : Math.min(vel.y, -minWallExitSpeed);
        }

        if (hitWall) {
          char.playSound('body-bounce');
          const currentAngle = Math.atan2(vel.y, vel.x);
          const jitter = (Math.random() - 0.5) * (16 * Math.PI / 180);
          const newAngle = currentAngle + jitter;
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y) || char.baseSpeed;
          vel.x = Math.cos(newAngle) * speed;
          vel.y = Math.sin(newAngle) * speed;
        }

        const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        if (currentSpeed > 0) {
          const ratio = char.baseSpeed / currentSpeed;
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

  _spawnProjectile(config, owner, x, y, vx, vy) {
    const projectile = new Projectile(config, owner, x, y, vx, vy);
    this.projectiles.push(projectile);
    World.add(this.world, projectile.body);
    return projectile;
  }

  _spawnDamageIndicator(char, amount) {
    const pos = char.visualPosition;
    const cfg = window.IndicatorConfig.damage;
    this.damageIndicators.push({
      text: `-${amount}`,
      x: pos.x + (Math.random() - 0.5) * char.radius,
      y: pos.y - char.hitbox.halfHeight * 0.35,
      vy: cfg.driftY,
      life: 1,
      decay: cfg.fadeRate,
      color: cfg.color,
      fontSize: Math.max(cfg.minFontSize, char.radius * cfg.sizeMultiplier),
    });
  }

  _spawnHitSpark(pos, color) {
    if (window.GameConfig.effects?.hitSpark === false) return;

    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 2;
      this.hitSparks.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.12 + Math.random() * 0.04,
        color,
      });
    }
  }

  _updateDamageIndicators() {
    for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
      const indicator = this.damageIndicators[i];
      indicator.y += indicator.vy;
      indicator.vy *= window.IndicatorConfig.damage.velocityDamping;
      indicator.life -= indicator.decay;
      if (indicator.life <= 0) this.damageIndicators.splice(i, 1);
    }
  }

  _updateHitSparks() {
    for (let i = this.hitSparks.length - 1; i >= 0; i--) {
      const spark = this.hitSparks[i];
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vx *= 0.92;
      spark.vy *= 0.92;
      spark.life -= spark.decay;
      if (spark.life <= 0) this.hitSparks.splice(i, 1);
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

  _updateWeapons() {
    const now = performance.now();
    this.characters.forEach((character) => {
      character.updateWeaponState();
      if (character.isDead || !character.weapon) return;
      if (!character.canUseWeapon(now)) return;

      if (character.weapon.type === 'projectile') {
        const target = this._findNearestEnemy(character);
        if (!target) return;
        this._fireProjectileWeapon(character, target);
        return;
      }

      if (character.weapon.type === 'proximity-melee') {
        const target = this._findTargetInMeleeRange(character);
        if (!target) return;
        this._triggerMeleeWeapon(character, target);
      }
    });
  }

  _findNearestEnemy(character) {
    let best = null;
    let bestDist = Infinity;

    this.characters.forEach((enemy) => {
      if (enemy === character || enemy.isDead) return;
      const dx = enemy.body.position.x - character.body.position.x;
      const dy = enemy.body.position.y - character.body.position.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    });

    return best;
  }

  _findTargetInMeleeRange(character) {
    const attackBox = this._getMeleeAttackBox(character);
    return this.characters.find((enemy) => (
      enemy !== character
      && !enemy.isDead
      && this._rectsOverlap(attackBox, this._getCharacterBox(enemy))
    )) ?? null;
  }

  _getCharacterBox(character) {
    return {
      x: character.body.position.x - character.hitbox.halfWidth,
      y: character.body.position.y - character.hitbox.halfHeight,
      width: character.hitbox.halfWidth * 2,
      height: character.hitbox.halfHeight * 2,
    };
  }

  _getMeleeAttackBox(character) {
    const padding = character.weapon?.rangePadding ?? 0;
    return {
      x: character.body.position.x - character.hitbox.halfWidth - padding,
      y: character.body.position.y - character.hitbox.halfHeight - padding,
      width: character.hitbox.width + padding * 2,
      height: character.hitbox.height + padding * 2,
    };
  }

  _rectsOverlap(a, b) {
    return a.x < b.x + b.width
      && a.x + a.width > b.x
      && a.y < b.y + b.height
      && a.y + a.height > b.y;
  }

  _triggerMeleeWeapon(character, target) {
    const weapon = character.weapon;
    if (!weapon) return;

    const damage = weapon.damage ?? character.baseDamage;
    character.startWeaponAnimation();
    target.takeDamage(damage, Date.now(), this.COLLISION_COOLDOWN);
    target.playSound('hurt');
    character.playSound('weapon-slap');
    this._spawnDamageIndicator(target, damage);
    this._spawnHitSpark(target.body.position, target.color);
  }

  _fireProjectileWeapon(character, target) {
    const weapon = character.weapon;
    const projectile = weapon.projectile;
    if (!projectile) return;

    const dx = target.body.position.x - character.body.position.x;
    const dy = target.body.position.y - character.body.position.y;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * projectile.speed;
    const vy = (dy / len) * projectile.speed;
    const startX = character.body.position.x + (dx / len) * (character.hitbox.halfWidth + projectile.radius + 2);
    const startY = character.body.position.y + (dy / len) * (character.hitbox.halfHeight + projectile.radius + 2);

    this._spawnProjectile(projectile, character, startX, startY, vx, vy);
    character.startWeaponAnimation();
    character.playSound('weapon-fire');
  }

  _startRenderLoop() {
    const ctx = this.ctx;
    const loop = () => {
      this._animId = requestAnimationFrame(loop);

      if (!this.paused) {
        this._updateWeapons();
        Runner.tick(this.runner, this.engine, performance.now());
        this._updateDamageIndicators();
        this._updateHitSparks();
        this._updateProjectiles();
      }

      ctx.clearRect(0, 0, this.W, this.H);
      this._drawArenaBorder(ctx);
      this._drawProjectiles(ctx);
      this._drawCharacters(ctx);
      this._drawDamageIndicators(ctx);
      this._drawHitSparks(ctx);
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

  _drawDamageIndicators(ctx) {
    const textCfg = window.IndicatorConfig.text;
    this.damageIndicators.forEach((indicator) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, indicator.life);
      ctx.fillStyle = indicator.color;
      ctx.strokeStyle = textCfg.strokeColor;
      ctx.lineWidth = textCfg.strokeWidth;
      ctx.font = `${textCfg.weight} ${indicator.fontSize}px ${textCfg.family}`;
      ctx.textAlign = textCfg.align;
      ctx.textBaseline = textCfg.baseline;
      ctx.strokeText(indicator.text, indicator.x, indicator.y);
      ctx.fillText(indicator.text, indicator.x, indicator.y);
      ctx.restore();
    });
  }

  _drawHitSparks(ctx) {
    this.hitSparks.forEach((spark) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, spark.life);
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - spark.vx * 2, spark.y - spark.vy * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  _drawProjectiles(ctx) {
    this.projectiles.forEach((projectile) => {
      const pos = projectile.body.position;
      const r = projectile.radius;
      ctx.save();

      if (projectile.image) {
        ctx.drawImage(projectile.image, pos.x - r, pos.y - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = '#9ad6ff';
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

      const isFlashing = char.hitFlashTimer > 0;
      const spriteVisual = char.getCurrentSprite();

      if (spriteVisual) {
        const { image, imageScale, imageOffset, imageCrop } = spriteVisual;
        const drawR = r * imageScale;
        const { crop, dx, dy, dw, dh } = char._getCropDrawRect(image, imageCrop, drawR);
        ctx.save();
        ctx.translate(pos.x + imageOffset.x, pos.y + imageOffset.y);
        ctx.rotate(ang);
        ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, dx, dy, dw, dh);

        if (isFlashing) {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255, 0, 0, 0.55)';
          ctx.fillRect(dx, dy, dw, dh);
        }

        ctx.restore();
      } else {
        ctx.save();
        const grad = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, r * 0.05, pos.x, pos.y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.35)');
        grad.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        if (isFlashing) {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255, 0, 0, 0.55)';
          ctx.fill();
        }

        ctx.strokeStyle = isFlashing ? '#ff4d4d' : char.color;
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
    ctx.fillStyle = '#222222';
    ctx.fill();

    ctx.save();
    this._tracePlusPath(ctx, x, y, size);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y + size - fillHeight, size, fillHeight);
    ctx.restore();

    this._tracePlusPath(ctx, x, y, size);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const textCfg = indicatorCfg.text;
    const fontSize = Math.max(indicatorCfg.health.minFontSize, size * indicatorCfg.health.sizeMultiplier);
    ctx.fillStyle = textCfg.fillColor;
    ctx.strokeStyle = textCfg.strokeColor;
    ctx.lineWidth = textCfg.strokeWidth;
    ctx.font = `${textCfg.weight} ${fontSize}px ${textCfg.family}`;
    ctx.textAlign = textCfg.align;
    ctx.textBaseline = textCfg.baseline;
    ctx.strokeText(String(Math.ceil(char.currentHealth)), x + size / 2, y + size / 2);
    ctx.fillText(String(Math.ceil(char.currentHealth)), x + size / 2, y + size / 2);
    ctx.restore();
  }

  _checkWinCondition() {
    const dead = this.characters.filter((c) => c.isDead);
    if (dead.length === 0) return;

    this.gameOver = true;
    dead.forEach((c) => c.onDeath());
  }

  _restart() {
    this.hudEls.status.textContent = window.GameConfig.text.statusFight;
    this.gameOver = false;
    this.paused = false;

    if (this._animId) cancelAnimationFrame(this._animId);

    World.clear(this.world, false);
    this.projectiles = [];
    this.damageIndicators = [];
    this.hitSparks = [];
    this._spawnCharacters();
    this._startRenderLoop();
  }

  getSelectedCharacterIds() {
    return [...this.selectedCharacterIds];
  }

  setSelectedCharacterIds(ids) {
    const validIds = new Set(window.CharacterConfigs.map((config) => config.id));
    const nextIds = ids.filter((id, index) => validIds.has(id) && ids.indexOf(id) === index).slice(0, 2);

    while (nextIds.length < 2) {
      const fallback = window.CharacterConfigs.find((config) => !nextIds.includes(config.id));
      if (!fallback) break;
      nextIds.push(fallback.id);
    }

    const changed = nextIds.join('|') !== this.selectedCharacterIds.join('|');
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
