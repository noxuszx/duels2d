/* ============================================================================
   game.js -- Duels2D  |  Matter.js Physics Battle Simulator
   ============================================================================

   ARCHITECTURE OVERVIEW
   CharacterConfigs  ->  Character (class)  ->  GameManager (class)

   CharacterConfigs : data-driven registry (add new fighters here)
   Character        : wraps a Matter.js Body + game state + Howl audio
   GameManager      : owns Engine, World, Runner, Canvas render loop

   PLANS IMPLEMENTED
   [1] 9:16 Container  -- _resizeCanvas() reads #game-container, not window
   [2] Decoupled Hitboxes -- drawImage() with imageScale / imageOffset support
   [3] Howler.js Audio    -- Howl instances per character for clash sounds
   [4] 2-Pose Weapons     -- weaponIdle / weaponAttack image swap on hit
   ============================================================================ */

'use strict';

const { Engine, Runner, Bodies, Body, World, Events } = Matter;

/* ============================================================================
   S1  CHARACTER CONFIG REGISTRY
   ============================================================================

   FIELDS
   id          {string}   Unique key; also used as the Matter.js body label.
   name        {string}   Display name rendered above the ball.
   maxHealth   {number}   Starting HP.
   color       {string}   Fallback fill colour when no sprite is provided.
   glowColor   {string}   Canvas shadow colour for the aura effect.
   radius      {number}   Visual sizing base used by sprites and health bars.
   hitbox      {object?}  Physics shape. Supports circle or box.
   baseDamage  {number}   HP removed per valid hit.
   speed       {number}   Initial launch speed (px/frame).

   PLAN 2 -- sprite / hitbox decoupling
   image       {string?}  Path to character body image. e.g. 'assets/characters/nova/body.png'
   imageScale  {number?}  Draw size multiplier relative to radius. Default 1.0.
                          Set > 1 to make the art larger than the hitbox.
   imageOffset {object?}  { x, y } pixel nudge applied after centering. Default {x:0,y:0}.

   PLAN 3 -- Howler.js audio
   sfxClash    {string?}  Path to clash / hit sound. e.g. 'assets/sfx/nova_clash.mp3'
   sfxDeath    {string?}  Path to KO / death sound.

   PLAN 4 -- 2-Pose Weapons
   weaponIdle   {string?} Path to weapon-idle overlay image.
   weaponAttack {string?} Path to weapon-attack overlay image (shown during hitFlash).
   weaponOffset {object?} { x, y } pixel offset for the weapon anchor point.
   weaponScale  {number?} Draw size multiplier for the weapon relative to radius.
*/
/* CharacterConfigs is now loaded globally from config/characters.js */
/* ============================================================================
   S2  CHARACTER CLASS
   Wraps a Matter.js Body, game state, image assets, and Howl audio.
   ============================================================================ */

class Character {
  /**
   * @param {object} config   A CharacterConfig entry.
   * @param {number} spawnX   Initial X (pixels inside the container).
   * @param {number} spawnY   Initial Y.
   * @param {number} velX     Starting velocity X.
   * @param {number} velY     Starting velocity Y.
   */
  constructor(config, spawnX, spawnY, velX, velY) {
    /* -- Identity & Stats -------------------------------------------------- */
    this.id            = config.id;
    this.name          = config.name;
    this.maxHealth     = config.maxHealth;
    this.currentHealth = config.maxHealth;
    this.color         = config.color;
    this.glowColor     = config.glowColor;
    this.radius        = config.radius;
    this.hitbox        = this._normalizeHitbox(config);
    this.baseDamage    = config.baseDamage;
    this.baseSpeed     = Math.sqrt(velX * velX + velY * velY); // lock speed to launch velocity

    /* -- Visual timers ----------------------------------------------------- */
    this.hitFlashTimer = 0;   // render frames remaining for white-flash
    this.attackTimer   = 0;   // render frames to show weaponAttack pose (Plan 4)

    /* -- Collision cooldown ------------------------------------------------- */
    this._lastHitTime = 0;    // ms timestamp of last valid hit received

    /* -- Matter.js physics body -------------------------------------------- */
    const bodyOptions = {
      restitution:    1.0,   // perfect elastic bounce
      friction:       0,
      frictionAir:    0,
      frictionStatic: 0,
      inertia:        Infinity, // prevent rotation absorbing bounce energy
      inverseInertia: 0,
      label:          this.id,
      collisionFilter: { category: 0x0001, mask: 0x0001 | 0x0002 },
    };

    this.body = this.hitbox.type === 'box'
      ? Bodies.rectangle(spawnX, spawnY, this.hitbox.width, this.hitbox.height, bodyOptions)
      : Bodies.circle(spawnX, spawnY, this.hitbox.radius, bodyOptions);
    Body.setVelocity(this.body, { x: velX, y: velY });

    /* -- PLAN 2: Sprite / image assets ------------------------------------- */
    this.imageScale  = config.imageScale  ?? 1.0;
    this.imageOffset = config.imageOffset ?? { x: 0, y: 0 };
    this.sprite      = null;   // loaded HTMLImageElement (body art)
    if (config.image) this._loadImage('sprite', config.image);

    /* -- PLAN 4: Weapon pose images ---------------------------------------- */
    this.weaponOffset = config.weaponOffset ?? { x: 0, y: 0 };
    this.weaponScale  = config.weaponScale  ?? 1.0;
    this.weaponIdle   = null;   // loaded HTMLImageElement
    this.weaponAttack = null;
    if (config.weaponIdle)   this._loadImage('weaponIdle',   config.weaponIdle);
    if (config.weaponAttack) this._loadImage('weaponAttack', config.weaponAttack);

    /* -- UI Offsets -------------------------------------------------------- */
    this.healthBarOffset = config.healthBarOffset ?? { x: 0, y: 0 };
    this.nameOffset      = config.nameOffset      ?? { x: 0, y: 0 };

    /* -- PLAN 3: Howler.js audio ------------------------------------------- */
    /*
     * Howl instances prevent audio clipping via dedicated channels.
     * Each character carries its own sounds so the right voice plays.
     *
     * To activate: uncomment sfxClash / sfxDeath in CharacterConfigs above
     * and drop the audio files into assets/sfx/.
     *
     * Howler auto-unlocks the AudioContext on first user gesture, so sounds
     * will work correctly even on mobile browsers.
     */
    this.sfxClash = null;
    this.sfxDeath = null;
    if (typeof Howl !== 'undefined') {
      if (config.sfxClash) {
        this.sfxClash = new Howl({
          src:    [config.sfxClash],
          volume: 0.7,
          /*
           * PLAN 3 extension: use Howler sprite sheets for multiple
           * clash variations. Example:
           * sprite: { hit1: [0, 300], hit2: [400, 300] }
           */
        });
      }
      if (config.sfxDeath) {
        this.sfxDeath = new Howl({ src: [config.sfxDeath], volume: 0.9 });
      }
    }
  }

  /* Private: generic image loader (sets this[key] on load) */
  _loadImage(key, src) {
    const img = new Image();
    img.onload = () => { this[key] = img; };
    img.onerror = () => { console.warn(`[Duels2D] Could not load image: ${src}`); };
    img.src = src;
  }

  _normalizeHitbox(config) {
    const fallbackRadius = config.radius ?? 30;
    const hitbox = config.hitbox ?? {};

    if (hitbox.type === 'box') {
      const width = hitbox.width ?? fallbackRadius * 1.4;
      const height = hitbox.height ?? fallbackRadius * 2.6;
      return {
        type: 'box',
        width,
        height,
        halfWidth: width / 2,
        halfHeight: height / 2,
      };
    }

    const radius = hitbox.radius ?? fallbackRadius;
    return {
      type: 'circle',
      radius,
      halfWidth: radius,
      halfHeight: radius,
    };
  }

  /**
   * Apply damage, respecting collision cooldown.
   * @param {number} amount     HP to subtract.
   * @param {number} nowMs      Current timestamp (Date.now()).
   * @param {number} cooldownMs Minimum ms between hits.
   * @returns {boolean} True if damage was actually applied.
   */
  takeDamage(amount, nowMs, cooldownMs) {
    if (nowMs - this._lastHitTime < cooldownMs) return false;

    this._lastHitTime  = nowMs;
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.hitFlashTimer = 8;   // 8-frame body flash
    this.attackTimer   = 12;  // PLAN 4: show weaponAttack pose for 12 frames

    /* PLAN 3: play clash sound via Howler (non-clipping) */
    if (this.sfxClash) this.sfxClash.play();

    /*
     * UNIQUE ATTACK HOOK -- extend per-character here:
     *   'ember' -> apply burn DoT via setInterval
     *   'nova'  -> freeze opponent: Body.setVelocity(opponent.body, {x:0,y:0})
     *   'volt'  -> chain-lightning to a third body
     */

    return true;
  }

  /** Called when this character dies. */
  onDeath() {
    /* PLAN 3: play death sound */
    if (this.sfxDeath) this.sfxDeath.play();

    /*
     * FUTURE VOICELINE HOOK:
     *   playVoiceline(this.id, 'death');
     */
  }

  /** @returns {boolean} True when HP has reached zero. */
  get isDead() { return this.currentHealth <= 0; }

  /** Normalised health 0-1. */
  get healthRatio() { return this.currentHealth / this.maxHealth; }
}


/* ============================================================================
   S3  GAME MANAGER CLASS
   ============================================================================ */

class GameManager {
  constructor() {
    /* -- Constants --------------------------------------------------------- */
    const cfg = window.GameConfig;
    this.WALL_THICKNESS     = cfg.physics.wallThickness;
    this.COLLISION_COOLDOWN = cfg.physics.collisionCooldownMs;  // ms
    this.ARENA_BORDER       = cfg.arena.borderWidth;    // border width (px)

    /* -- State ------------------------------------------------------------- */
    this.started    = true;
    this.paused     = false;
    this.characters = [];
    this.damageIndicators = [];
    this.gameOver   = false;
    this.selectedCharacterIds = ['womanguy', 'chefguy']; // Default based on config index
    this._animId    = null;

    /* -- Matter.js --------------------------------------------------------- */
    this.engine = Engine.create({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    this.world  = this.engine.world;
    this.runner = Runner.create({ isFixed: true });

    /* -- Canvas (PLAN 1: read container, not window) ----------------------- */
    this.container = document.getElementById('game-container');
    this.canvas    = document.getElementById('arena-canvas');
    this.ctx       = this.canvas.getContext('2d');
    this._resizeCanvas();

    /* -- HUD refs ---------------------------------------------------------- */
    this.hudEls = {
      status:    document.getElementById('hud-status'),
    };

    /*
     * PLAN 1: resize observer watches the container box, not the window,
     * so physics walls stay in sync as the viewport changes shape.
     */
    const ro = new ResizeObserver(() => {
      this._resizeCanvas();
      this._rebuildWalls();
    });
    ro.observe(this.container);

    /* -- Start ------------------------------------------------------------- */
    this._applyConfigDOM();
    this._init();
  }

  _applyConfigDOM() {
    const cfg = window.GameConfig;
    document.body.style.background = cfg.arena.backgroundColor;
    this.container.style.background = cfg.arena.containerColor;
    
    this.hudEls.status.textContent = cfg.text.statusFight;
    document.getElementById('game-footer').textContent = cfg.text.footer;
  }

  /* -------------------------------------------------------------------------
     PLAN 1: _resizeCanvas
     Sizes the canvas pixel buffer to match the #game-container's layout box.
     ------------------------------------------------------------------------- */
  _resizeCanvas() {
    const rect  = this.container.getBoundingClientRect();
    this.W      = this.canvas.width  = Math.round(rect.width);
    this.H      = this.canvas.height = Math.round(rect.height);
  }

  /* Arena fills the full canvas (the container IS the arena now) */
  _getArena() {
    return { ax: 0, ay: 0, aw: this.W, ah: this.H };
  }

  /* -------------------------------------------------------------------------
     Walls sit flush with the container edges
     ------------------------------------------------------------------------- */
  _rebuildWalls() {
    const old = this.world.bodies.filter(b => b.isStatic && b.label === 'wall');
    World.remove(this.world, old);
    // Removed Matter.js wall bodies per Plan step 6.
  }

  /* -------------------------------------------------------------------------
     Spawn characters
     ------------------------------------------------------------------------- */
  _spawnCharacters() {
    const configs = window.CharacterConfigs.slice(0, 2);
    const m = window.GameConfig.physics.globalSpeedMultiplier || 1.0;
    const { ax, ay, aw, ah } = this._getArena();

    const spawnData = [
      { x: ax + aw * 0.25, y: ay + ah * 0.5,  vx:  configs[0].speed * m, vy:  configs[0].speed * 0.6 * m },
      { x: ax + aw * 0.75, y: ay + ah * 0.5,  vx: -configs[1].speed * m, vy: -configs[1].speed * 0.7 * m },
    ];

    this.characters = configs.map((cfg, i) => {
      const sd = spawnData[i];
      const c  = new Character(cfg, sd.x, sd.y, sd.vx, sd.vy);
      World.add(this.world, c.body);
      return c;
    });

    if (this.characters.length >= 2) {
      document.getElementById('hud-title').innerHTML = `${this.characters[0].name} <span class="accent">VS</span> ${this.characters[1].name}`;
    }
  }

  /* -------------------------------------------------------------------------
     Collision events
     ------------------------------------------------------------------------- */
  _registerCollisionEvents() {
    Events.on(this.engine, 'collisionStart', (event) => {
      if (this.gameOver) return;
      const now = Date.now();

      event.pairs.forEach(({ bodyA, bodyB }) => {
        const charA = this._charFromBody(bodyA);
        const charB = this._charFromBody(bodyB);
        if (!charA || !charB) return;

        const hitA = charA.takeDamage(charB.baseDamage, now, this.COLLISION_COOLDOWN);
        const hitB = charB.takeDamage(charA.baseDamage, now, this.COLLISION_COOLDOWN);

        if (hitA) this._spawnDamageIndicator(charA, charB.baseDamage);
        if (hitB) this._spawnDamageIndicator(charB, charA.baseDamage);
      });
    });

    /* Enforce constant velocity and manual bounds */
    Events.on(this.engine, 'beforeUpdate', () => {
      if (this.gameOver) return;
      
      const { ax, ay, aw, ah } = this._getArena();
      const bPadding = this.ARENA_BORDER || 0;
      
      this.characters.forEach(char => {
        if (char.isDead) return;
        
        let pos = char.body.position;
        let vel = { ...char.body.velocity };
        
        const minX = ax + char.hitbox.halfWidth + bPadding;
        const maxX = ax + aw - char.hitbox.halfWidth - bPadding;
        const minY = ay + char.hitbox.halfHeight + bPadding;
        const maxY = ay + ah - char.hitbox.halfHeight - bPadding;
        
        let hitWall = false;
        let hitLeftRight = false;
        let hitTopBottom = false;

        // 1. Clamp bounds and 2. Flip velocity
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

        // 3. Enforce minimum inward angle
        const minWallExitSpeed = char.baseSpeed * 0.2;
        if (hitLeftRight) {
           vel.x = vel.x > 0 ? Math.max(vel.x, minWallExitSpeed) : Math.min(vel.x, -minWallExitSpeed);
        }
        if (hitTopBottom) {
           vel.y = vel.y > 0 ? Math.max(vel.y, minWallExitSpeed) : Math.min(vel.y, -minWallExitSpeed);
        }
        
        // 4. Add tiny random deflection
        if (hitWall) {
           const currentAngle = Math.atan2(vel.y, vel.x);
           const jitter = (Math.random() - 0.5) * (16 * Math.PI / 180);
           const newAngle = currentAngle + jitter;
           const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y) || char.baseSpeed;
           vel.x = Math.cos(newAngle) * speed;
           vel.y = Math.sin(newAngle) * speed;
        }

        // 5. Normalize back to constant speed
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
    return this.characters.find(c => c.body === body) || null;
  }

  /* -------------------------------------------------------------------------
     Damage indicators
     ------------------------------------------------------------------------- */
  _spawnDamageIndicator(char, amount) {
    const pos = char.body.position;
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

  _updateDamageIndicators() {
    for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
      const indicator = this.damageIndicators[i];
      indicator.y += indicator.vy;
      indicator.vy *= window.IndicatorConfig.damage.velocityDamping;
      indicator.life -= indicator.decay;
      if (indicator.life <= 0) this.damageIndicators.splice(i, 1);
    }
  }

  /* -------------------------------------------------------------------------
     Render Loop
     ------------------------------------------------------------------------- */
  _startRenderLoop() {
    const ctx  = this.ctx;
    const loop = () => {
      this._animId = requestAnimationFrame(loop);
      if (!this.paused) {
        Runner.tick(this.runner, this.engine, performance.now());
        this._updateDamageIndicators();
      }

      const W = this.W, H = this.H;

      /* White fill */
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      /* Red arena border (drawn around the canvas edges) */
      this._drawArenaBorder(ctx, W, H);

      /* Characters (bodies + weapons + health bars) */
      this._drawCharacters(ctx);

      /* Floating damage numbers */
      this._drawDamageIndicators(ctx);

      /* Win check */
      if (!this.gameOver) this._checkWinCondition();
    };
    loop();
  }

  /* Border around the canvas */
  _drawArenaBorder(ctx, W, H) {
    const b = this.ARENA_BORDER;
    ctx.save();
    ctx.strokeStyle = window.GameConfig.arena.borderColor;
    ctx.lineWidth   = b * 2;   // double so the half inside is visible
    ctx.strokeRect(0, 0, W, H);
    ctx.restore();
  }

  _drawDamageIndicators(ctx) {
    const textCfg = window.IndicatorConfig.text;
    this.damageIndicators.forEach(indicator => {
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

  /* -------------------------------------------------------------------------
     PLAN 2 + PLAN 4: Draw Characters
     Body art is drawn via drawImage() if a sprite is loaded; otherwise falls
     back to the coloured circle. Weapon overlay is drawn on top.
     ------------------------------------------------------------------------- */
  _drawCharacters(ctx) {
    this.characters.forEach(char => {
      if (char.isDead) return;

      const pos = char.body.position;
      const r   = char.radius;
      const ang = char.body.angle;

      /* Decrement timers */
      if (!this.paused) {
        if (char.hitFlashTimer > 0) char.hitFlashTimer--;
        if (char.attackTimer   > 0) char.attackTimer--;
      }

      const isFlashing = char.hitFlashTimer > 0;
      const drawColor  = isFlashing ? '#ffffff'              : char.color;
      const glowColor  = isFlashing ? 'rgba(255,255,255,0.8)' : char.glowColor;

      /* -- Glow aura removed per request -------------------------------------------------------- */

      /* -- PLAN 2: Body art or fallback circle ------------------------------ */
      if (char.sprite) {
        /*
         * Draw the sprite, scaled and offset independently of the hitbox.
         * The canvas is rotated to match the physics body angle, so art
         * spins naturally with collisions.
         */
        const drawR = r * char.imageScale;
        ctx.save();
        ctx.translate(pos.x + char.imageOffset.x, pos.y + char.imageOffset.y);
        ctx.rotate(ang);
        ctx.drawImage(char.sprite, -drawR, -drawR, drawR * 2, drawR * 2);
        ctx.restore();
      } else {
        /* Fallback: coloured circle with radial highlight */
        ctx.save();
        const grad = ctx.createRadialGradient(
          pos.x - r * 0.3, pos.y - r * 0.3, r * 0.05,
          pos.x, pos.y, r,
        );
        grad.addColorStop(0, 'rgba(255,255,255,0.35)');
        grad.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        /* Stroke ring */
        ctx.strokeStyle = isFlashing ? '#fff' : char.color;
        ctx.lineWidth   = 2.5;
        ctx.stroke();
        ctx.restore();
      }

      /* -- PLAN 4: Weapon overlay ------------------------------------------- */
      /*
       * Select idle or attack pose based on attackTimer.
       * The weapon is drawn at weaponOffset from the body centre, rotated
       * with the physics body so it swings on impact.
       *
       * To activate: set weaponIdle / weaponAttack paths in CharacterConfigs.
       */
      const weaponImg = char.attackTimer > 0
        ? (char.weaponAttack || char.weaponIdle)
        : char.weaponIdle;

      if (weaponImg) {
        const wR = r * char.weaponScale;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(ang);
        ctx.translate(char.weaponOffset.x, char.weaponOffset.y);
        ctx.drawImage(weaponImg, -wR, -wR, wR * 2, wR * 2);
        ctx.restore();
      }

      /* -- Inline health bar ------------------------------------------------ */
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

  /* -------------------------------------------------------------------------
     Plus-shaped health indicator rendered above each character
     ------------------------------------------------------------------------- */
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
    const fontSize = Math.max(
      indicatorCfg.health.minFontSize,
      size * indicatorCfg.health.sizeMultiplier,
    );
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

  /* -------------------------------------------------------------------------
     Win condition
     ------------------------------------------------------------------------- */
  _checkWinCondition() {
    const dead = this.characters.filter(c => c.isDead);
    if (dead.length === 0) return;

    this.gameOver = true;

    /* PLAN 3: trigger death audio on the losing character */
    dead.forEach(c => c.onDeath());

    /* FUTURE VOICELINE HOOK:
     * play match-end audio here if needed. */
  }

  /* -------------------------------------------------------------------------
     Restart
     ------------------------------------------------------------------------- */
  _restart() {
    this.hudEls.status.textContent = window.GameConfig.text.statusFight;
    this.gameOver = false;
    this.started  = true;
    this.paused   = false;

    if (this._animId) cancelAnimationFrame(this._animId);

    const walls = this.world.bodies.filter(b => b.isStatic && b.label === 'wall');
    World.clear(this.world, false);
    World.add(this.world, walls);

    this.damageIndicators = [];
    this._spawnCharacters();
    this._startRenderLoop();
  }

  /* =========================================================================
     PUBLIC API (For Command Line)
     ========================================================================= */
  start() {
    if (this.gameOver) return;
    this.started = true;
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
    // Placeholder for future phase
    console.log('[Duels2D] Character select opened.');
  }

  /* -------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------- */
  _init() {
    this._rebuildWalls();
    this._spawnCharacters();
    this._registerCollisionEvents();
    this._startRenderLoop();
  }
}


/* ============================================================================
   S4  BOOT
   ============================================================================ */
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GameManager();
});
