"use strict";

class Fighter {
  constructor(config, spawnX, spawnY, velX, velY) {
    this.id = config.id;
    this.name = config.name;
    this.maxHealth = config.maxHealth;
    this.currentHealth = config.maxHealth;
    this.color = config.color;
    this.radius = config.radius;
    this.hitbox = this._normalizeHitbox(config);
    this.baseDamage = config.baseDamage;
    this.baseSpeed = Math.sqrt(velX * velX + velY * velY);
    this.velocityBoostMultiplier = 1;
    this.velocityBoostUntil = 0;
    this.knockbackOwnerId = null;
    this.knockbackUntil = 0;
    this.hitboxOffset = config.hitboxOffset ?? { x: 0, y: 0 };
    this.hitFlashTimer = 0;
    this.attackTimer = 0;
    this._lastHitTime = 0;
    this.weapon = config.weapon ?? null;
    this.weaponState = "idle";
    this.weaponTimer = 0;
    this.lastWeaponUseTime = -Infinity;
    this.lastIdleSoundTime = performance.now();
    this.defaultFacing = config.defaultFacing ?? "right";
    this.facing = this.defaultFacing;
    this.faceTarget = config.faceTarget ?? { mode: "never" };

    const bodyOptions = {
      restitution: 1.0,
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      inertia: Infinity,
      inverseInertia: 0,
      label: this.id,
      collisionFilter: { category: 0x0001, mask: 0x0001 | 0x0002 },
    };

    this.body =
      this.hitbox.type === "box"
        ? Bodies.rectangle(
            spawnX + this.hitboxOffset.x,
            spawnY + this.hitboxOffset.y,
            this.hitbox.width,
            this.hitbox.height,
            bodyOptions,
          )
        : Bodies.circle(
            spawnX + this.hitboxOffset.x,
            spawnY + this.hitboxOffset.y,
            this.hitbox.radius,
            bodyOptions,
          );
    Body.setVelocity(this.body, { x: velX, y: velY });

    this.imageScale = config.imageScale ?? 1.0;
    this.imageOffset = config.imageOffset ?? { x: 0, y: 0 };
    this.imageCrop = config.imageCrop ?? null;
    this.sprite = null;
    if (config.image) this._loadImage("sprite", config.image);

    this.sprites = {
      idle: null,
      attackWindup: null,
      attackActive: null,
    };
    // Normalise pose config: extract image paths and store per-pose visual overrides
    this._poseVisuals = {};
    const poseConfig = config.poses ?? null;
    if (poseConfig?.idle) {
      const idle = poseConfig.idle;
      const idlePath =
        typeof idle === "string" ? idle : (idle.image ?? config.image);
      if (idlePath) this._loadImage("sprites.idle", idlePath);
      this._poseVisuals.idle = typeof idle === "object" ? idle : {};
    }
    if (poseConfig?.attackWindup) {
      const wu = poseConfig.attackWindup;
      const wuPath = typeof wu === "string" ? wu : (wu.image ?? config.image);
      if (wuPath) this._loadImage("sprites.attackWindup", wuPath);
      this._poseVisuals.attackWindup = typeof wu === "object" ? wu : {};
    }
    if (poseConfig?.attackActive) {
      const aa = poseConfig.attackActive;
      const aaPath = typeof aa === "string" ? aa : (aa.image ?? config.image);
      if (aaPath) this._loadImage("sprites.attackActive", aaPath);
      this._poseVisuals.attackActive = typeof aa === "object" ? aa : {};
    }

    this.weaponOffset = config.weaponOffset ?? { x: 0, y: 0 };
    this.weaponScale = config.weaponScale ?? 1.0;
    this.weaponIdle = null;
    this.weaponAttack = null;
    if (config.weaponIdle) this._loadImage("weaponIdle", config.weaponIdle);
    if (config.weaponAttack)
      this._loadImage("weaponAttack", config.weaponAttack);

    this.healthBarOffset = config.healthBarOffset ?? { x: 0, y: 0 };
    this.soundPools = this._createSoundPools();
    this.sharedSoundPools = Fighter._getSharedSoundPools();
    this.soundCooldowns = {};
    this.lines = config.lines ?? {};
    this.lastAmbientLineTime = performance.now();
    this.lastAmbientSoundTime = performance.now();
  }

  _loadImage(key, src) {
    const img = new Image();
    img.onload = () => {
      if (key.startsWith("sprites.")) {
        const spriteKey = key.split(".")[1];
        this.sprites[spriteKey] = img;
      } else {
        this[key] = img;
      }
    };
    img.onerror = () => {
      console.warn(`[Duels2D] Could not load image: ${src}`);
    };
    img.src = src;
  }

  getCurrentSprite() {
    // Determine which sprite image and which pose key applies
    let spriteImg;
    let poseKey;

    if (this.weaponState === "windup") {
      spriteImg = this.sprites.attackWindup ?? this.sprites.idle ?? this.sprite;
      poseKey = this.sprites.attackWindup
        ? "attackWindup"
        : this.sprites.idle
          ? "idle"
          : null;
    } else if (this.weaponState === "active") {
      spriteImg =
        this.sprites.attackActive ??
        this.sprites.attackWindup ??
        this.sprites.idle ??
        this.sprite;
      poseKey = this.sprites.attackActive
        ? "attackActive"
        : this.sprites.attackWindup
          ? "attackWindup"
          : this.sprites.idle
            ? "idle"
            : null;
    } else {
      spriteImg = this.sprites.idle ?? this.sprite;
      poseKey = this.sprites.idle ? "idle" : null;
    }

    if (!spriteImg) return null;

    // Resolve per-pose visual overrides (fall back to top-level config)
    const poseVis = (poseKey && this._poseVisuals?.[poseKey]) ?? {};
    return {
      image: spriteImg,
      imageScale: poseVis.imageScale ?? this.imageScale,
      imageOffset: poseVis.imageOffset ?? this.imageOffset,
      imageCrop: poseVis.imageCrop ?? this.imageCrop,
    };
  }

  canUseWeapon(nowMs) {
    if (!this.weapon) return false;
    const cooldown = this.weapon.cooldownMs ?? 0;
    return nowMs - this.lastWeaponUseTime >= cooldown;
  }

  markWeaponUsed(nowMs = performance.now()) {
    this.lastWeaponUseTime = nowMs;
  }

  getMovementSpeed(nowMs = performance.now()) {
    if (nowMs < this.velocityBoostUntil) {
      return this.baseSpeed * this.velocityBoostMultiplier;
    }

    return this.baseSpeed;
  }

  applyVelocityBoost(direction, speedMultiplier, durationMs, sourceOwnerId = null) {
    const len = Math.hypot(direction.x, direction.y) || 1;
    const multiplier = Math.max(1, speedMultiplier ?? 1);
    const speed = this.baseSpeed * multiplier;
    const now = performance.now();
    const duration = Math.max(0, durationMs ?? 0);

    this.velocityBoostMultiplier = multiplier;
    this.velocityBoostUntil = now + duration;
    this.knockbackOwnerId = sourceOwnerId;
    this.knockbackUntil = sourceOwnerId ? now + duration : 0;
    Body.setVelocity(this.body, {
      x: (direction.x / len) * speed,
      y: (direction.y / len) * speed,
    });
  }

  startWeaponAnimation() {
    if (!this.weapon?.animation) return;
    this.weaponState = "windup";
    this.weaponTimer = this.weapon.animation.windupFrames ?? 0;
    this.attackTimer = this.weapon.animation.windupFrames ?? 0;
    this.playSound("attackWindup", 0);
  }

  updateWeaponState() {
    if (!this.weapon) return;
    if (this.weaponTimer <= 0) return;

    this.weaponTimer--;
    if (this.weaponState === "windup" && this.weaponTimer <= 0) {
      this.weaponState = "active";
      this.weaponTimer = this.weapon.animation?.activeFrames ?? 0;
      this.attackTimer = this.weapon.animation?.activeFrames ?? 0;
      this.playSound("attackActive", 0);
      return;
    }

    if (this.weaponState === "active" && this.weaponTimer <= 0) {
      this.weaponState = "recovery";
      this.weaponTimer = this.weapon.animation?.recoveryFrames ?? 0;
      return;
    }

    if (this.weaponState === "recovery" && this.weaponTimer <= 0) {
      this.weaponState = "idle";
    }
  }

  updateAudio(nowMs) {
    if (this.isDead) return;
    if (this.weaponState !== "idle") return;
    this._updateAmbientAudio(nowMs);

    const audioConfig = window.GameConfig.audio ?? {};
    const interval = audioConfig.idleIntervalMs ?? 4000;

    if (nowMs - this.lastIdleSoundTime < interval) return;

    this.lastIdleSoundTime = nowMs;
    this.playSound("idle", 0);
  }

  _updateAmbientAudio(nowMs) {
    const pool = this.soundPools.ambient;
    if (!pool || pool.length === 0) return;
    if (pool.some((sound) => sound.playing())) return;

    const audioConfig = window.GameConfig.audio ?? {};
    const interval =
      audioConfig.ambientIntervalMs ?? audioConfig.idleIntervalMs ?? 4000;

    if (nowMs - this.lastAmbientSoundTime < interval) return;

    this.lastAmbientSoundTime = nowMs;
    this.playSound("ambient", 0);
  }

  get visualPosition() {
    return {
      x: this.body.position.x - this.hitboxOffset.x,
      y: this.body.position.y - this.hitboxOffset.y,
    };
  }

  _getCropDrawRect(image, crop, drawR) {
    const fullW = drawR * 2;
    const fullH = drawR * 2;
    const safeCrop = this._getImageCrop(image, crop);
    return {
      dx: -drawR + (safeCrop.x / image.naturalWidth) * fullW,
      dy: -drawR + (safeCrop.y / image.naturalHeight) * fullH,
      dw: (safeCrop.width / image.naturalWidth) * fullW,
      dh: (safeCrop.height / image.naturalHeight) * fullH,
      crop: safeCrop,
    };
  }

  _normalizeHitbox(config) {
    const fallbackRadius = config.radius ?? 30;
    const hitbox = config.hitbox ?? {};
    if (hitbox.type === "box") {
      const width = hitbox.width ?? fallbackRadius * 1.4;
      const height = hitbox.height ?? fallbackRadius * 2.6;
      return {
        type: "box",
        width,
        height,
        halfWidth: width / 2,
        halfHeight: height / 2,
      };
    }
    const radius = hitbox.radius ?? fallbackRadius;
    return { type: "circle", radius, halfWidth: radius, halfHeight: radius };
  }

  _getImageCrop(image, crop) {
    const fallback = {
      x: 0,
      y: 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    if (!crop) return fallback;
    const nw = image.naturalWidth || fallback.width || 1;
    const nh = image.naturalHeight || fallback.height || 1;
    const x = Math.max(0, Math.min(crop.x ?? 0, nw - 1));
    const y = Math.max(0, Math.min(crop.y ?? 0, nh - 1));
    const width = Math.max(1, Math.min(crop.width ?? nw, nw - x));
    const height = Math.max(1, Math.min(crop.height ?? nh, nh - y));
    return { x, y, width, height };
  }

  static _resolveSoundSrc(entry) {
    return typeof entry === "string" ? entry : entry.path;
  }

  _createSoundPools() {
    if (typeof Howl === "undefined") return {};
    const manifest = window.SoundManifest?.characters?.[this.id] ?? {};
    const pools = {};
    Object.entries(manifest).forEach(([type, paths]) => {
      if (!Array.isArray(paths) || paths.length === 0) return;
      pools[type] = paths.map(
        (entry) =>
          new Howl({ src: [Fighter._resolveSoundSrc(entry)], volume: Fighter._volumeForSoundType(type) }),
      );
    });
    return pools;
  }

  static _getSharedSoundPools() {
    if (typeof Howl === "undefined") return {};
    if (Fighter._sharedSoundPoolCache) return Fighter._sharedSoundPoolCache;
    Fighter._sharedSoundPoolCache = Fighter._buildSoundPools(
      window.SoundManifest?.shared ?? {},
    );
    return Fighter._sharedSoundPoolCache;
  }

  static _buildSoundPools(manifest) {
    const pools = {};
    Object.entries(manifest).forEach(([type, paths]) => {
      if (!Array.isArray(paths) || paths.length === 0) return;
      pools[type] = paths.map(
        (entry) =>
          new Howl({ src: [Fighter._resolveSoundSrc(entry)], volume: Fighter._volumeForSoundType(type) }),
      );
    });
    return pools;
  }

  static _volumeForSoundType(type) {
    const audioConfig = window.GameConfig.audio ?? {};
    const volumes = audioConfig.volumes ?? {};
    if (volumes[type] != null) return volumes[type];
    if (type === "body-bounce") return audioConfig.bounceVolume ?? 0.55;
    if (type === "death") return 0.9;
    return 0.65;
  }

  setFacingToward(target) {
    if (!target) return;
    this.facing = target.body.position.x < this.body.position.x ? "left" : "right";
  }

  playSound(type, cooldownMs = null) {
    const pool = this.soundPools[type] ?? this.sharedSoundPools[type];
    if (!pool || pool.length === 0) return;
    const audioConfig = window.GameConfig.audio ?? {};
    const resolvedCooldown =
      cooldownMs ??
      audioConfig.defaultCooldownMs ??
      audioConfig.bounceCooldownMs ??
      80;
    const now = performance.now();
    const lastPlayed = this.soundCooldowns[type] ?? 0;
    if (resolvedCooldown > 0 && now - lastPlayed < resolvedCooldown) return;
    this.soundCooldowns[type] = now;
    const sound = pool[Math.floor(Math.random() * pool.length)];
    if (type === "hurt") {
      const rates = [0.85, 1.0, 1.15];
      sound.rate(rates[Math.floor(Math.random() * rates.length)]);
    }
    sound.play();
  }

  isKnockbackFrom(ownerId, nowMs = performance.now()) {
    if (nowMs >= this.knockbackUntil) {
      this.knockbackOwnerId = null;
      this.knockbackUntil = 0;
      return false;
    }
    return this.knockbackOwnerId === ownerId;
  }

  takeDamage(amount, nowMs, cooldownMs) {
    if (nowMs - this._lastHitTime < cooldownMs) return false;
    this._lastHitTime = nowMs;
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.hitFlashTimer = 8;
    this.attackTimer = 12;
    return true;
  }

  destroy() {
    Object.values(this.soundPools).forEach((pool) => {
      pool.forEach((sound) => {
        sound.stop();
        sound.unload();
      });
    });
  }

  onDeath() {
    this.playSound("death", 0);
  }

  get isDead() {
    return this.currentHealth <= 0;
  }
  get healthRatio() {
    return this.currentHealth / this.maxHealth;
  }

  getRandomLine(type) {
    const lines = this.lines?.[type];
    if (!Array.isArray(lines) || lines.length === 0) return null;
    return lines[Math.floor(Math.random() * lines.length)];
  }
}

// Temporary alias for backward compatibility during migration
var Character = Fighter;
