window.IndicatorConfig = {
  text: {
    family: 'sans-serif',
    weight: '100',
    align: 'center',
    baseline: 'middle'
  },

  damage: {
    fillColor: '#e61b00',
    strokeColor: 'rgba(0, 0, 0, 0.45)',
    strokeWidth: 1,
    minFontSize: 13,
    sizeMultiplier: 0.5,
    driftY: -1.15,
    velocityDamping: 0.98,
    fadeRate: 0.008
  },

  dialogue: {
    fillColor: '#33ff00',
    strokeColor: 'rgba(0, 0, 0, 0.55)',
    strokeWidth: 2,
    minFontSize: 14,
    sizeMultiplier: 0.42,
    driftY: -0.65,
    velocityDamping: 0.98,
    fadeRate: 0.002,
    offsetYMultiplier: 1.05
  },

  health: {
    fillColor: '#ffffff',
    strokeColor: 'rgba(0, 0, 0, 0.45)',
    strokeWidth: 1,
    minFontSize: 12,
    sizeMultiplier: 0.28
  }
};
