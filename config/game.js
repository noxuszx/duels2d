window.GameConfig = {
  physics: {
    globalSpeedMultiplier: 0.15, // Multiplies the base speed of all characters
    collisionCooldownMs: 300
  },
  effects: {
    hitSpark: true,
  },
  audio: {
    defaultCooldownMs: 80,
    volumes: {
      "body-bounce": 0.55,
      "weapon-hit": 0.7,
      "hurt": 0.8,
      "death": 0.9
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
