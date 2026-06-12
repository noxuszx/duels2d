window.FighterRoster = [
  {
    "id": "womanguy",
    "name": "Woman Guy",
    "maxHealth": 1000,
    "color": "#00d4ff",
    "radius": 30,
    "hitbox": {
      "type": "box",
      "width": 78,
      "height": 112
    },
    "baseDamage": 100,
    "speed": 10,
    "image": "assets/fighters/womanguy/sprites/womanguy.out.png",
    "imageScale": 2.6,
    "imageOffset": {
      "x": 0,
      "y": -4
    },
    "healthBarOffset": {
      "x": 0,
      "y": -76
    },
    "hitboxOffset": {
      "x": -5.684341886080802e-14,
      "y": -15.000455989393828
    },
    "weaponScale": 1,
    "weaponOffset": {
      "x": 0,
      "y": 0
    },
    "imageCrop": {
      "x": 216,
      "y": 39,
      "width": 585,
      "height": 768
    }
  },
  {
    "id": "chefguy",
    "name": "Chef Guy",
    "maxHealth": 1000,
    "color": "#ff4d6d",
    "radius": 30,
    "hitbox": {
      "type": "box",
      "width": 78,
      "height": 112
    },
    "baseDamage": 100,
    "speed": 10,
    "image": "assets/fighters/chefguy/sprites/chefguy.out.png",
    "imageScale": 2.4,
    "imageOffset": {
      "x": 0,
      "y": -21
    },
    "healthBarOffset": {
      "x": 0,
      "y": -75
    },
    "hitboxOffset": {
      "x": 0,
      "y": -15
    },
    "weaponScale": 1,
    "weaponOffset": {
      "x": 0,
      "y": 0
    },
    "imageCrop": {
      "x": 199,
      "y": 0,
      "width": 633,
      "height": 960
    }
  },
  {
    "id": "depressedguy",
    "name": "Sad Guy",
    "defaultFacing": "right",
    "faceTarget": {
      "mode": "always"
    },
    "maxHealth": 1000,
    "color": "#5f7ea8",
    "radius": 30,
    "hitbox": {
      "type": "box",
      "width": 78,
      "height": 112
    },
    "baseDamage": 100,
    "speed": 10,
    "image": "assets/fighters/depressedguy/sprites/depressedguy.out.png",
    "imageScale": 2.8,
    "imageOffset": {
      "x": 8,
      "y": -11
    },
    "healthBarOffset": {
      "x": 0,
      "y": -76
    },
    "weaponScale": 1,
    "weaponOffset": {
      "x": 0,
      "y": 0
    },
    "poses": {
      "idle": "assets/fighters/depressedguy/sprites/depressedguy.out.png",
      "attackActive": "assets/fighters/depressedguy/sprites/depressedguy.out.png"
    },
    "weapon": {
      "type": "projectile",
      "cooldownMs": 900,
      "animation": {
        "windupFrames": 4,
        "activeFrames": 4,
        "recoveryFrames": 8
      },
      "projectile": {
        "radius": 30,
        "speed": 3,
        "damage": 50,
        "knockback": false,
        "lifetimeMs": 2500,
        "image": "assets/fighters/depressedguy/projectiles/tear.png"
      }
    },
    "imageCrop": {
      "x": 242,
      "y": 124,
      "width": 744,
      "height": 901
    },
    "hitboxOffset": {
      "x": 0,
      "y": -15
    }
  },
  {
    "id": "happyguy",
    "name": "Happy Guy",
    "defaultFacing": "right",
    "faceTarget": {
      "mode": "range"
    },
    "maxHealth": 1000,
    "color": "#ffd84d",
    "radius": 30,
    "hitbox": {
      "type": "box",
      "width": 78,
      "height": 112
    },
    "baseDamage": 100,
    "speed": 10,
    "image": "assets/fighters/happyguy/sprites/happyguy.out.png",
    "imageScale": 2.3,
    "imageOffset": {
      "x": 0,
      "y": -14
    },
    "healthBarOffset": {
      "x": 0,
      "y": -76
    },
    "weaponScale": 1,
    "weaponOffset": {
      "x": 0,
      "y": 0
    },
    "poses": {
      "idle": {
        "image": "assets/fighters/happyguy/sprites/happyguy.out.png",
        "imageCrop": {
          "x": 0,
          "y": 0,
          "width": 2500,
          "height": 2165
        },
        "imageScale": 2.3,
        "imageOffset": {
          "x": 0,
          "y": -14
        }
      },
      "attackWindup": {
        "image": "assets/fighters/happyguy/sprites/happyguy-windup.png",
        "imageCrop": {
          "x": 0,
          "y": 0,
          "width": 1288,
          "height": 1201
        },
        "imageScale": 2,
        "imageOffset": {
          "x": 0,
          "y": -18
        }
      },
      "attackActive": {
        "image": "assets/fighters/happyguy/sprites/happyguy-slap.png",
        "imageCrop": {
          "x": 0,
          "y": 0,
          "width": 1254,
          "height": 1254
        },
        "imageScale": 2,
        "imageOffset": {
          "x": -3,
          "y": -20
        }
      }
    },
    "lines": {
      "weaponHit": [
        "Could be worse!",
        "Why the long face?!",
        "How are ya?"
      ],
      "ambient": [
        "Anybody want a hug?",
        "What a great day!",
        "Come here!"
      ],
      "ambientIntervalMs": 4500,
      "ambientChance": 0.35
    },
    "weapon": {
      "type": "proximity-melee",
      "cooldownMs": 1000,
      "damage": 100,
      "rangePadding": 22,
      "knockback": {
        "speedMultiplier": 4.2,
        "durationMs": 650
      },
      "animation": {
        "windupFrames": 10,
        "activeFrames": 26,
        "recoveryFrames": 14
      }
    },
    "imageCrop": {
      "x": 0,
      "y": 0,
      "width": 2500,
      "height": 2165
    },
    "hitboxOffset": {
      "x": 0,
      "y": -15
    }
  }
];

// Temporary alias for backward compatibility during migration
window.CharacterConfigs = window.FighterRoster;
