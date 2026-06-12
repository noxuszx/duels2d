"use strict";

class WeaponSystem {
  constructor(gameManager) {
    this.gm = gameManager;
  }

  get _characters() { return this.gm.characters; }
  get _projectiles() { return this.gm.projectiles; }
  get _world() { return this.gm.world; }
  get _collisionCooldown() { return this.gm.COLLISION_COOLDOWN; }
  get _indicators() { return this.gm.indicators; }

  update() {
    const now = performance.now();
    this._characters.forEach((character) => {
      character.updateWeaponState();
      if (character.isDead || !character.weapon) return;
      if (!character.canUseWeapon(now)) return;

      if (character.weapon.type === "projectile") {
        const target = this._findNearestEnemy(character);
        if (!target) return;
        this._fireProjectileWeapon(character, target, now);
        return;
      }

      if (character.weapon.type === "proximity-melee") {
        const target = this._findTargetInMeleeRange(character);
        if (!target) return;
        this._triggerMeleeWeapon(character, target, now);
      }
    });
  }

  updateFaceTargeting() {
    this._characters.forEach((character) => {
      if (character.isDead) return;
      const mode = character.faceTarget?.mode ?? "never";
      if (mode === "always") {
        const target = this._findNearestEnemy(character);
        character.setFacingToward(target);
      } else if (mode === "range") {
        const target = this._findTargetInMeleeRange(character);
        if (target) {
          character.setFacingToward(target);
        } else {
          character.facing = character.defaultFacing;
        }
      } else {
        character.facing = character.defaultFacing;
      }
    });
  }

  _findNearestEnemy(character) {
    let best = null;
    let bestDist = Infinity;

    this._characters.forEach((enemy) => {
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
    return (
      this._characters.find(
        (enemy) =>
          enemy !== character &&
          !enemy.isDead &&
          this._rectsOverlap(attackBox, this._getCharacterBox(enemy)),
      ) ?? null
    );
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
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  _triggerMeleeWeapon(character, target, nowMs) {
    const weapon = character.weapon;
    if (!weapon) return;

    const damage = weapon.damage ?? character.baseDamage;
    character.markWeaponUsed(nowMs);
    character.startWeaponAnimation();
    character.playSound("weaponSlap");
    const didDamage = target.takeDamage(
      damage,
      Date.now(),
      this._collisionCooldown,
    );
    if (!didDamage) return;

    target.playSound("hurt");
    this._applyWeaponKnockback(character, target, weapon);
    this._indicators.spawnDamageIndicator(target, damage);
    this._indicators.spawnHitSpark(target.body.position, target.color);
    this._indicators.spawnCharacterLine(character, "weaponHit");
  }

  _applyWeaponKnockback(character, target, weapon) {
    const knockback = weapon.knockback;
    if (!knockback) return;

    const direction = {
      x: target.body.position.x - character.body.position.x,
      y: target.body.position.y - character.body.position.y,
    };
    target.applyVelocityBoost(
      direction,
      knockback.speedMultiplier,
      knockback.durationMs,
      character.id,
    );
  }

  _fireProjectileWeapon(character, target, nowMs) {
    const weapon = character.weapon;
    const projectileCfg = weapon.projectile;
    if (!projectileCfg) return;

    const dx = target.body.position.x - character.body.position.x;
    const dy = target.body.position.y - character.body.position.y;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * projectileCfg.speed;
    const vy = (dy / len) * projectileCfg.speed;
    const startX =
      character.body.position.x +
      (dx / len) * (character.hitbox.halfWidth + projectileCfg.radius + 2);
    const startY =
      character.body.position.y +
      (dy / len) * (character.hitbox.halfHeight + projectileCfg.radius + 2);

    this._spawnProjectile(projectileCfg, character, startX, startY, vx, vy);
    character.markWeaponUsed(nowMs);
    character.startWeaponAnimation();
    character.playSound("weapon-fire");
  }

  _spawnProjectile(config, owner, x, y, vx, vy) {
    const projectile = new Projectile(config, owner, x, y, vx, vy);
    this._projectiles.push(projectile);
    Matter.World.add(this._world, projectile.body);
    return projectile;
  }
}
