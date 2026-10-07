# Source navigation

## Source map

```text
src/
├── app/game-app.ts                 browser frame loop and wiring
├── content/
│   ├── manifest.ts                 active fighter blueprint registry
│   ├── fighters/babyman/
│   │   ├── definition.ts           equipped components and move bindings
│   │   └── behavior.ts             character decisions and sequence
│   ├── fighters/granny/            equipped components and scripted actions
│   ├── fighters/alienman/          transformation and saucer arrival
│   ├── fighters/alien/             targeting and piercing laser shots
│   ├── fighters/angryman/          pause/shake windup and a bounded charge
│   ├── script-helpers/             content math and small reusable sequences
│   │   ├── motion/pause-movement.ts       scoped voluntary movement pause
│   │   ├── motion/steer.ts         timed velocity control for dynamic bodies
│   │   ├── motion/move-to.ts       timed path for static actors
│   │   ├── combat/burst.ts         repeated explicit projectile groups
│   │   ├── animation/pose-sequence.tsconfigured visual steps
│   │   ├── combat/query-hit.ts     ray geometry and explicit query effects
│   │   ├── flow/until.ts           wait for script state or an absolute deadline
│   │   └── animation/shake.ts      timed offset/rotation updates
│   └── actors/saucer/              sweep, beam pulses, and deployment
├── engine/
│   ├── simulation.ts               fixed tick and gameplay resolution
│   ├── entity.ts                   identity and lifetime state
│   ├── entity-registry.ts          registration and safe world mutation
│   ├── component.ts                component container and resource leases
│   ├── behavior-runtime.ts         foreground tasks and cooldowns
│   ├── entity-factory.ts           shared construction, installation, and registration
│   ├── contracts.ts                shared event types
│   ├── random.ts                   seeded gameplay RNG
│   ├── physics/                    Matter contact capture and arena response
│   ├── spatial/                    segment/area queries, shapes, overlap history
│   └── scripting/
│       ├── operation.ts            per-use action contract
│       ├── combinators/all.ts / race.ts         concurrent operation composition
│       ├── combinators/sequence.ts             compose a generator branch as an operation
│       ├── operation-runner.ts     shared generator execution and per-yield scopes
│       ├── compound-operation.ts    shared operation lifecycle and cleanup
│       ├── scope.ts                resource ownership and cleanup
│       ├── scoped.ts               acquire, run sequence, release
│       ├── time/during.ts               simulation-time callbacks
│       ├── time/tween.ts                normalized progress callbacks
│       └── time/wait.ts                 wait using the same timeline
├── gameplay/
│   ├── fighter-factory.ts          common preset and typed assembly
│   ├── actor-factory.ts            owned actors with independent lifecycle scripts
│   ├── behavior.ts                 shared fighter/actor script installation
│   ├── match-rules.ts              team outcomes and ambient impact tuning
│   ├── components/                 movement, targeting, crawl, dash, melee, aim,
│   │                               projectile, forms, and timed visuals
│   ├── combat/                     shared effects
│   └── statuses/                   definitions, registry, and controller
├── config/                         JSON composition and shared validation
├── presentation/                   state/leases, shared transforms, Canvas/audio
└── rendering/sprite-geometry.ts     sprite geometry shared with Studio
```

Related: [documentation index](../README.md).
