# Weapons And Game Split Plan

> [!NOTE]
> **Status: Implemented with Modifications**
> The character code split has been implemented. `js/game.js` was split into `js/character.js`, `js/projectile.js`, `js/game-manager.js`, etc. Note that rather than creating separate `renderer.js` and `weapons.js` files, the rendering and weapon update functions were consolidated into `js/game-manager.js` to keep the runtime streamlined.

## Goal

Prepare Duels2D for character weapons without turning `js/game.js` into character-specific spaghetti.

Upcoming characters:

- **Depressed Guy**: shoots damaging tear projectiles.
- **Happy Guy**: automatically slaps nearby enemies on cooldown using a slightly larger attack box than his hitbox.

This is also the right time to split `game.js` into smaller plain browser scripts.

## Core Principles

- Keep the project static and browser-native.
- Do not add a bundler or ES modules yet.
- Keep scripts loaded through normal `<script>` tags.
- Keep weapons data-driven through character config.
- Do not hardcode character IDs in runtime logic.
- Let every weapon use the same generic cooldown/state pipeline.
- Keep hitboxes and visual art decoupled.
- Keep projectiles and melee hit areas explicit gameplay concepts.

Avoid:

```js
if (character.id === "happyguy") {
  slap();
}
```

Prefer:

```js
if (character.weapon?.type === "proximity-melee") {
  runProximityMelee(character);
}
```

## Recommended File Split

Split `js/game.js` before adding weapon behavior.

Keep global script style:

```text
js/
├── character.js
├── projectile.js
├── weapons.js
├── renderer.js
├── game-manager.js
├── command-line.js
└── game.js
```

### `character.js`

Owns:

- `Character` class.
- Character stats and health.
- Matter body creation.
- Image loading.
- Pose/sprite loading.
- Per-character sound pools.
- Weapon cooldown state.
- Damage/death methods.
- Visual position helper.

### `projectile.js`

Owns:

- `Projectile` class.
- Projectile Matter body.
- Projectile damage/owner/lifetime.
- Projectile image loading or image reference.
- Projectile expiry logic.

### `weapons.js`

Owns:

- Weapon update functions.
- Projectile weapon firing.
- Proximity melee hit detection.
- Weapon cooldown checks.
- Weapon animation state transitions.
- Utility overlap checks.

### `renderer.js`

Owns:

- Arena border drawing.
- Character drawing.
- Pose selection for characters.
- Projectile drawing.
- Health bar drawing.
- Damage indicator drawing.
- Hit spark drawing.
- Optional debug overlays.

### `game-manager.js`

Owns:

- Matter engine/world/runner.
- Canvas setup and resize.
- Character spawning.
- Main update/render loop.
- Collision event routing.
- Manual arena bounds.
- Arrays for characters, projectiles, damage indicators, and hit sparks.

### `game.js`

Boot only:

```js
window.addEventListener("DOMContentLoaded", () => {
  window.game = new GameManager();
});
```

## HTML Script Order

Load dependencies and configs first, then runtime files:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js"></script>

<script src="config/game.js"></script>
<script src="config/indicators.js"></script>
<script src="config/sounds.js"></script>
<script src="config/characters.js"></script>

<script src="js/character.js"></script>
<script src="js/projectile.js"></script>
<script src="js/weapons.js"></script>
<script src="js/renderer.js"></script>
<script src="js/game-manager.js"></script>
<script src="js/game.js"></script>
<script src="js/command-line.js"></script>
```

`command-line.js` should stay after `game.js` because it depends on `window.game`.

## Phase 1: Split Without Behavior Changes

Before adding weapons, move code out of `game.js` without changing behavior.

Done when:

- Existing characters spawn.
- Existing wall bounce behavior works.
- Character collision damage works.
- Health bars still render.
- Damage indicators still render.
- Hit sparks still render.
- Hit flash still works.
- Per-character body-bounce sounds still work.
- Character Studio still opens from command line.

This phase should be a move-only/refactor pass.

## Phase 2: Add Weapon Config Schema

Add optional `weapon` config to character configs.

No behavior yet.

### Projectile Weapon Example

For Depressed Guy:

```js
weapon: {
  type: "projectile",
  cooldownMs: 900,
  animation: {
    windupFrames: 4,
    activeFrames: 4,
    recoveryFrames: 8
  },
  projectile: {
    image: "assets/characters/depressedguy/projectiles/tear.png",
    radius: 10,
    speed: 7,
    damage: 18,
    lifetimeMs: 2500
  }
}
```

### Proximity Melee Weapon Example

For Happy Guy:

```js
weapon: {
  type: "proximity-melee",
  cooldownMs: 1000,
  damage: 25,
  rangePadding: 22,
  animation: {
    windupFrames: 6,
    activeFrames: 5,
    recoveryFrames: 8
  }
}
```

## Phase 3: Add Generic Pose System

Happy Guy needs a quick PNG switch:

1. Idle/default image.
2. Optional windup image.
3. Slap/active image.
4. Return to idle.

Make this generic for all characters.

### Config Shape

```js
poses: {
  idle: "assets/characters/happyguy/happyguy.out.png",
  attackWindup: "assets/characters/happyguy/happyguy-windup.png",
  attackActive: "assets/characters/happyguy/happyguy-slap.png"
}
```

If `poses` is missing, keep using existing `image`.

Recommended compatibility rule:

```js
const idleImage = config.poses?.idle ?? config.image;
```

### Runtime State

On `Character`:

```js
this.weaponState = "idle"; // idle, windup, active, recovery
this.weaponTimer = 0;
this.lastWeaponUseTime = -Infinity;
```

### Pose Selection

Renderer should select sprite by state:

```js
getCurrentSprite() {
  if (this.weaponState === "windup") {
    return this.sprites.attackWindup ?? this.sprites.idle;
  }

  if (this.weaponState === "active") {
    return this.sprites.attackActive ?? this.sprites.idle;
  }

  return this.sprites.idle;
}
```

### Animation Flow

When a weapon activates:

```js
character.weaponState = "windup";
character.weaponTimer = weapon.animation.windupFrames;
```

Each update:

```js
windup -> active -> recovery -> idle
```

The weapon should apply damage/fire projectile during the transition into `active`, not every frame unless explicitly configured.

## Phase 4: Add Collision Categories

Introduce explicit Matter collision categories.

```js
const CollisionCategories = {
  CHARACTER: 0x0001,
  PROJECTILE: 0x0002
};
```

Characters:

```js
collisionFilter: {
  category: CollisionCategories.CHARACTER,
  mask: CollisionCategories.CHARACTER | CollisionCategories.PROJECTILE
}
```

Projectiles:

```js
collisionFilter: {
  category: CollisionCategories.PROJECTILE,
  mask: CollisionCategories.CHARACTER
}
```

Still manually ignore projectile owner hits:

```js
if (projectile.ownerId === target.id) return;
```

## Phase 5: Add Projectile System

Create `Projectile` class.

### Projectile Fields

```js
class Projectile {
  constructor(config, owner, x, y, vx, vy) {
    this.ownerId = owner.id;
    this.damage = config.damage;
    this.createdAt = performance.now();
    this.lifetimeMs = config.lifetimeMs;
    this.image = null;
    this.body = Bodies.circle(x, y, config.radius, options);
  }
}
```

### GameManager State

```js
this.projectiles = [];
```

### Firing Direction

Start simple:

- Fire toward nearest living enemy.
- If no enemy exists, do nothing.

```js
const dx = target.body.position.x - shooter.body.position.x;
const dy = target.body.position.y - shooter.body.position.y;
const len = Math.hypot(dx, dy) || 1;
const vx = (dx / len) * projectile.speed;
const vy = (dy / len) * projectile.speed;
```

### Projectile Spawn

Spawn at the shooter hitbox center or slightly forward:

```js
const startX = shooter.body.position.x + (dx / len) * (shooter.hitbox.halfWidth + projectile.radius);
const startY = shooter.body.position.y + (dy / len) * (shooter.hitbox.halfHeight + projectile.radius);
```

### Projectile Collision

In Matter `collisionStart`:

```js
const projectile = this._projectileFromBody(bodyA) ?? this._projectileFromBody(bodyB);
const target = this._charFromBody(otherBody);
```

Rules:

- Ignore if no projectile.
- Ignore if no target.
- Ignore if `projectile.ownerId === target.id`.
- Apply damage.
- Spawn damage indicator.
- Spawn hit spark.
- Play `weapon-hit` for owner and `hurt` for target later.
- Remove projectile body and mark projectile dead.

## Phase 6: Add Proximity Melee System

Happy Guy uses this.

No Matter body required for the attack area.

### Attack Box

For a box hitbox:

```js
const attackBox = {
  x: character.body.position.x - character.hitbox.halfWidth - padding,
  y: character.body.position.y - character.hitbox.halfHeight - padding,
  width: character.hitbox.width + padding * 2,
  height: character.hitbox.height + padding * 2
};
```

For an enemy box:

```js
const enemyBox = {
  x: enemy.body.position.x - enemy.hitbox.halfWidth,
  y: enemy.body.position.y - enemy.hitbox.halfHeight,
  width: enemy.hitbox.halfWidth * 2,
  height: enemy.hitbox.halfHeight * 2
};
```

Overlap:

```js
function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
```

### Melee Activation

Each update:

```js
if (!character.canUseWeapon(now)) return;

const enemies = this.characters.filter(c => c !== character && !c.isDead);
const targetInRange = enemies.find(enemy => rectsOverlap(attackBox, getEnemyBox(enemy)));

if (!targetInRange) return;

startWeaponAnimation(character);
applyMeleeDamage(character, targetInRange);
```

Damage should happen once per weapon activation, not every active frame.

## Phase 7: Add Debug Drawing

Temporarily add debug drawing for:

- Projectile bodies.
- Melee attack boxes.
- Character hitboxes.

Gate it behind config:

```js
debug: {
  weaponHitboxes: false,
  projectiles: false
}
```

Do not leave debug visuals always on.

## Sound Types For Weapons

Add folders as needed:

```text
assets/characters/happyguy/sounds/weapon-slap/
assets/characters/happyguy/sounds/weapon-hit/
assets/characters/depressedguy/sounds/weapon-fire/
assets/characters/depressedguy/sounds/weapon-hit/
assets/characters/depressedguy/sounds/hurt/
assets/characters/depressedguy/sounds/death/
```

Then rerun:

```bash
node tools/generate-sound-manifest.js
```

Runtime calls:

```js
character.playSound("weapon-fire");
character.playSound("weapon-slap");
attacker.playSound("weapon-hit");
target.playSound("hurt");
```

## New Character Asset Structure

```text
assets/characters/depressedguy/
├── depressedguy.out.png
├── depressedguy-attack.png
├── projectiles/
│   └── tear.png
└── sounds/
    ├── body-bounce/
    ├── weapon-fire/
    ├── weapon-hit/
    ├── hurt/
    └── death/

assets/characters/happyguy/
├── happyguy.out.png
├── happyguy-windup.png
├── happyguy-slap.png
└── sounds/
    ├── body-bounce/
    ├── weapon-slap/
    ├── weapon-hit/
    ├── hurt/
    └── death/
```

## New Character Config Examples

### Depressed Guy

```js
{
  id: "depressedguy",
  name: "DEPRESSED GUY",
  maxHealth: 1000,
  color: "#5f7ea8",
  radius: 30,
  hitbox: { type: "box", width: 72, height: 132 },
  baseDamage: 10,
  speed: 10,
  image: "assets/characters/depressedguy/depressedguy.out.png",
  imageScale: 2.4,
  imageOffset: { x: 0, y: -4 },
  healthBarOffset: { x: 0, y: -76 },
  weaponScale: 1,
  weaponOffset: { x: 0, y: 0 },
  poses: {
    idle: "assets/characters/depressedguy/depressedguy.out.png",
    attackActive: "assets/characters/depressedguy/depressedguy-attack.png"
  },
  weapon: {
    type: "projectile",
    cooldownMs: 900,
    animation: {
      windupFrames: 4,
      activeFrames: 4,
      recoveryFrames: 8
    },
    projectile: {
      image: "assets/characters/depressedguy/projectiles/tear.png",
      radius: 10,
      speed: 7,
      damage: 18,
      lifetimeMs: 2500
    }
  }
}
```

### Happy Guy

```js
{
  id: "happyguy",
  name: "HAPPY GUY",
  maxHealth: 1000,
  color: "#ffd84d",
  radius: 30,
  hitbox: { type: "box", width: 72, height: 132 },
  baseDamage: 10,
  speed: 10,
  image: "assets/characters/happyguy/happyguy.out.png",
  imageScale: 2.4,
  imageOffset: { x: 0, y: -4 },
  healthBarOffset: { x: 0, y: -76 },
  weaponScale: 1,
  weaponOffset: { x: 0, y: 0 },
  poses: {
    idle: "assets/characters/happyguy/happyguy.out.png",
    attackWindup: "assets/characters/happyguy/happyguy-windup.png",
    attackActive: "assets/characters/happyguy/happyguy-slap.png"
  },
  weapon: {
    type: "proximity-melee",
    cooldownMs: 1000,
    damage: 25,
    rangePadding: 22,
    animation: {
      windupFrames: 6,
      activeFrames: 5,
      recoveryFrames: 8
    }
  }
}
```

## Recommended Implementation Order

1. Split `game.js` without behavior changes.
2. Verify existing two-character fight still works.
3. Add generic `weapon` and `poses` config parsing with no active behavior.
4. Add `Projectile` class and projectile array.
5. Add projectile rendering.
6. Add projectile collision routing.
7. Add projectile weapon for Depressed Guy.
8. Add generic weapon animation state.
9. Add proximity melee hit detection.
10. Add Happy Guy slap pose swap.
11. Add weapon sounds through the sound manifest.
12. Add debug drawing toggles.
13. Remove or tighten temporary debug code.

## Acceptance Criteria

- Existing WOMANGUY/CHEFGUY fight still works after file split.
- Existing body-bounce sounds still work.
- Depressed Guy can fire tear projectiles.
- Tear projectiles damage enemies and expire.
- Tear projectile uses image rendering.
- Happy Guy triggers slap only when enemy is inside attack box.
- Happy Guy slap has cooldown.
- Happy Guy swaps pose during attack and returns to idle.
- No character-specific `if (id === "...")` logic is needed.
- Weapon code is config-driven.
- Debug hit areas can be turned off.

