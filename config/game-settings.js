window.GameConfig = {
  physics: {
    // Multiplies every fighter's combat.speed. Use 0.1-1 for normal tuning.
    globalSpeedMultiplier: 0.15,
    // Prevents one sustained collision from dealing damage every frame.
    collisionCooldownMs: 300,
    impactDamage: {
      // Minimum boosted velocity before a body collision deals damage.
      minSpeedMultiplier: 2.8,
      damage: 45
    }
  },
  effects: {
    hitSpark: true,
  },
  audio: {
    // Minimum delay between repeated sounds in the same sound group.
    defaultCooldownMs: 80,
    // How often fighters are allowed to attempt an idle sound.
    idleIntervalMs: 4000,
    volumes: {
      "body-bounce": 0.55,
      "idle": 0.55,
      "attackWindup": 0.7,
      "attackActive": 0.75,
      "weaponSlap": 0.7,
      "weapon-fire": 0.7,
      "hurt": 0.3,
      "death": 0.9,
      "ambient": 0.3,
      "victory": 0.9
    }
  },
  arena: {
    // Canvas border appearance, in CSS pixels.
    borderWidth: 5,
    borderColor: '#000000',
    backgroundColor: '#2b2b2b',
    // Extra off-arena canvas space so large sprites are not clipped.
    visualOverflow: 160
  },
  text: {
    statusFight: '',
    footer: '@nox-memes',
  }
};
