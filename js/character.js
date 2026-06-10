'use strict';

class Character {
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
    this.hitboxOffset = config.hitboxOffset ?? { x: 0, y: 0 };
    this.hitFlashTimer = 0;
    this.attackTimer = 0;
    this._lastHitTime = 0;
    this.weapon = config.weapon ?? null;
    this.weaponState = 'idle';
    this.weaponTimer = 0;
    this.lastWeaponUseTime = -Infinity;

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

    this.body = this.hitbox.type === 'box'
      ? Bodies.rectangle(spawnX + this.hitboxOffset.x, spawnY + this.hitboxOffset.y, this.hitbox.width, this.hitbox.height, bodyOptions)
      : Bodies.circle(spawnX + this.hitboxOffset.x, spawnY + this.hitboxOffset.y, this.hitbox.radius, bodyOptions);
    Body.setVelocity(this.body, { x: velX, y: velY });

    this.imageScale = config.imageScale ?? 1.0;
    this.imageOffset = config.imageOffset ?? { x: 0, y: 0 };
    this.imageCrop = config.imageCrop ?? null;
    this.sprite = null;
    if (config.image) this._loadImage('sprite', config.image);

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
      const idlePath = typeof idle === 'string' ? idle : (idle.image ?? config.image);
      if (idlePath) this._loadImage('sprites.idle', idlePath);
      this._poseVisuals.idle = typeof idle === 'object' ? idle : {};
    }
    if (poseConfig?.attackWindup) {
      const wu = poseConfig.attackWindup;
      const wuPath = typeof wu === 'string' ? wu : (wu.image ?? config.image);
      if (wuPath) this._loadImage('sprites.attackWindup', wuPath);
      this._poseVisuals.attackWindup = typeof wu === 'object' ? wu : {};
    }
    if (poseConfig?.attackActive) {
      const aa = poseConfig.attackActive;
      const aaPath = typeof aa === 'string' ? aa : (aa.image ?? config.image);
      if (aaPath) this._loadImage('sprites.attackActive', aaPath);
      this._poseVisuals.attackActive = typeof aa === 'object' ? aa : {};
    }

    this.weaponOffset = config.weaponOffset ?? { x: 0, y: 0 };
    this.weaponScale = config.weaponScale ?? 1.0;
    this.weaponIdle = null;
    this.weaponAttack = null;
    if (config.weaponIdle) this._loadImage('weaponIdle', config.weaponIdle);
    if (config.weaponAttack) this._loadImage('weaponAttack', config.weaponAttack);

    this.healthBarOffset = config.healthBarOffset ?? { x: 0, y: 0 };
    this.soundPools = this._createSoundPools();
    this.sharedSoundPools = Character._getSharedSoundPools();
    this.soundCooldowns = {};
  }

  _loadImage(key, src) {
    const img = new Image();
    img.onload = () => {
      if (key.startsWith('sprites.')) {
        const spriteKey = key.split('.')[1];
        this.sprites[spriteKey] = img;
      } else {
        this[key] = img;
      }
    };
    img.onerror = () => { console.warn(`[Duels2D] Could not load image: ${src}`); };
    img.src = src;
  }

  getCurrentSprite() {
    // Determine which sprite image and which pose key applies
    let spriteImg;
    let poseKey;

    if (this.weaponState === 'windup') {
      spriteImg = this.sprites.attackWindup ?? this.sprites.idle ?? this.sprite;
      poseKey = this.sprites.attackWindup ? 'attackWindup'
              : this.sprites.idle ? 'idle' : null;
    } else if (this.weaponState === 'active') {
      spriteImg = this.sprites.attackActive ?? this.sprites.attackWindup ?? this.sprites.idle ?? this.sprite;
      poseKey = this.sprites.attackActive ? 'attackActive'
              : this.sprites.attackWindup ? 'attackWindup'
              : this.sprites.idle ? 'idle' : null;
    } else {
      spriteImg = this.sprites.idle ?? this.sprite;
      poseKey = this.sprites.idle ? 'idle' : null;
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

  startWeaponAnimation() {
    if (!this.weapon?.animation) return;
    this.weaponState = 'windup';
    this.weaponTimer = this.weapon.animation.windupFrames ?? 0;
    this.attackTimer = this.weapon.animation.windupFrames ?? 0;
    this.lastWeaponUseTime = performance.now();
  }

  updateWeaponState() {
    if (!this.weapon) return;
    if (this.weaponTimer <= 0) return;

    this.weaponTimer--;
    if (this.weaponState === 'windup' && this.weaponTimer <= 0) {
      this.weaponState = 'active';
      this.weaponTimer = this.weapon.animation?.activeFrames ?? 0;
      this.attackTimer = this.weapon.animation?.activeFrames ?? 0;
      return;
    }

    if (this.weaponState === 'active' && this.weaponTimer <= 0) {
      this.weaponState = 'recovery';
      this.weaponTimer = this.weapon.animation?.recoveryFrames ?? 0;
      return;
    }

    if (this.weaponState === 'recovery' && this.weaponTimer <= 0) {
      this.weaponState = 'idle';
    }
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
    if (hitbox.type === 'box') {
      const width = hitbox.width ?? fallbackRadius * 1.4;
      const height = hitbox.height ?? fallbackRadius * 2.6;
      return { type: 'box', width, height, halfWidth: width / 2, halfHeight: height / 2 };
    }
    const radius = hitbox.radius ?? fallbackRadius;
    return { type: 'circle', radius, halfWidth: radius, halfHeight: radius };
  }

  _getImageCrop(image, crop) {
    const fallback = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    if (!crop) return fallback;
    const nw = image.naturalWidth || fallback.width || 1;
    const nh = image.naturalHeight || fallback.height || 1;
    const x = Math.max(0, Math.min(crop.x ?? 0, nw - 1));
    const y = Math.max(0, Math.min(crop.y ?? 0, nh - 1));
    const width = Math.max(1, Math.min(crop.width ?? nw, nw - x));
    const height = Math.max(1, Math.min(crop.height ?? nh, nh - y));
    return { x, y, width, height };
  }

  _createSoundPools() {
    if (typeof Howl === 'undefined') return {};
    const manifest = window.SoundManifest?.characters?.[this.id] ?? {};
    const pools = {};
    Object.entries(manifest).forEach(([type, paths]) => {
      if (!Array.isArray(paths) || paths.length === 0) return;
      pools[type] = paths.map(src => new Howl({ src: [src], volume: Character._volumeForSoundType(type) }));
    });
    return pools;
  }

  static _getSharedSoundPools() {
    if (typeof Howl === 'undefined') return {};
    if (Character._sharedSoundPoolCache) return Character._sharedSoundPoolCache;
    Character._sharedSoundPoolCache = Character._buildSoundPools(window.SoundManifest?.shared ?? {});
    return Character._sharedSoundPoolCache;
  }

  static _buildSoundPools(manifest) {
    const pools = {};
    Object.entries(manifest).forEach(([type, paths]) => {
      if (!Array.isArray(paths) || paths.length === 0) return;
      pools[type] = paths.map(src => new Howl({ src: [src], volume: Character._volumeForSoundType(type) }));
    });
    return pools;
  }

  static _volumeForSoundType(type) {
    const audioConfig = window.GameConfig.audio ?? {};
    const volumes = audioConfig.volumes ?? {};
    if (volumes[type] != null) return volumes[type];
    if (type === 'body-bounce') return audioConfig.bounceVolume ?? 0.55;
    if (type === 'death') return 0.9;
    return 0.65;
  }

  playSound(type, cooldownMs = null) {
    const pool = this.soundPools[type] ?? this.sharedSoundPools[type];
    if (!pool || pool.length === 0) return;
    const audioConfig = window.GameConfig.audio ?? {};
    const resolvedCooldown = cooldownMs ?? audioConfig.defaultCooldownMs ?? audioConfig.bounceCooldownMs ?? 80;
    const now = performance.now();
    const lastPlayed = this.soundCooldowns[type] ?? 0;
    if (resolvedCooldown > 0 && now - lastPlayed < resolvedCooldown) return;
    this.soundCooldowns[type] = now;
    pool[Math.floor(Math.random() * pool.length)].play();
  }

  takeDamage(amount, nowMs, cooldownMs) {
    if (nowMs - this._lastHitTime < cooldownMs) return false;
    this._lastHitTime = nowMs;
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.hitFlashTimer = 8;
    this.attackTimer = 12;
    return true;
  }

  onDeath() {
    this.playSound('death', 0);
  }

  get isDead() { return this.currentHealth <= 0; }
  get healthRatio() { return this.currentHealth / this.maxHealth; }
}
