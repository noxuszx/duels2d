window.GameConfig = {
  physics: {
    globalSpeedMultiplier: 0.15, // Multiplies the base speed of all characters
    collisionCooldownMs: 300,
    impactDamage: {
      minSpeedMultiplier: 2.8,
      damage: 45
    }
  },
  effects: {
    hitSpark: true,
  },
  audio: {
    defaultCooldownMs: 80,
    idleIntervalMs: 4000,
    volumes: {
      "body-bounce": 0.55,
      "idle": 0.55,
      "attackWindup": 0.7,
      "attackActive": 0.75,
      "weapon-hit": 0.7,
      "hurt": 0.3,
      "death": 0.9,
      "ambient": 0.3,
      "victory": 0.9
    }
  },
  arena: {
    borderWidth: 5,
    borderColor: '#000000',
    backgroundColor: '#006eff',
    visualOverflow: 160
  },
  text: {
    statusFight: '',
    footer: 'Like & Subscribe',
  }
};
