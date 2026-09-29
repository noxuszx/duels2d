# Manual Gameplay Regression Checklist

Use the same arena and fighter settings for repeat runs. Start each matchup with full health and no prior damage; observe at normal game speed. Record pass/fail and any unexpected behavior. If a setup is not reliably reachable through normal play, use the project’s available debug controls.

| Check | Setup | Expected result | Regression symptom |
|---|---|---|---|
| Baby Man crawl-to-dash | Match Baby Man against a stationary opponent. Let Baby Man contact a wall while able to use his wall ability. | He crawls along the wall, transitions once into a dash toward the opponent, and the dash ends on its configured collision. Wall contact/crawl retains the normal wall response. | No crawl or dash; repeated transition/hits; crawl fails to end; wall response disappears. |
| Baby Man dash hit | Repeat with the opponent positioned in the dash path. | The opponent receives the configured hit once per intended contact; Baby Man does not take collision-impact damage from his own dash. | Self-damage from wall/fighter impact, missing or duplicated opponent damage. |
| Angry Man windup and dash | Place an opponent within reach, then observe a full activation. Repeat with the target on the opposite side. | Windup completes before the dash; direction tracks the selected target at the intended phase; wall/fighter collision ends the dash as configured. Dash impact does not damage Angry Man. | Dash starts early, faces away, ignores its collision end rule, or damages Angry Man through impact. |
| Melee fighters | Match Chef Man and Depressed Man against each other. Observe several swings, including one that misses and one that connects. | Swing timing and weapon arc look consistent; damage/knockback occur on a successful hit only; miss causes no hit damage. | Damage without contact, duplicate hits, missing knockback, or phase/audio timing drifting from the swing. |
| Projectile fighters | Match Happy Man and Woman Man. Let each fire, then let a projectile hit and separately expire or leave play. | Projectiles travel, damage valid opponents, and are removed on hit/expiry. The owner is not hit by their own projectile. Projectiles can damage a fighter who is dashing. | Owner damage, projectile persisting after removal conditions, missed/duplicated damage, or dash incorrectly blocking projectile damage. |
| Post-victory movement and camera | Let one fighter win, then watch the winner and camera through the victory sequence. | The winner continues moving/physics, and the camera continues following; the declared result remains stable. | Fighters or camera freeze, camera loses the winner, or more combat changes the result after victory. |
| Dash impact immunity | Observe a dash collide with both a wall and an opponent. Then hit the dashing fighter with a projectile/direct attack. | Dash collision impact causes no self-damage; normal bounce/collision and opponent hit effects still occur. Direct attack and projectile damage remain effective. | Dash self-damage, suppressed opponent damage/bounce, or dash immunity also blocks direct/projectile damage. |
| High-speed cast lock | Arrange for a fighter to exceed twice its base speed through knockback or bounce. While above the threshold, wait for its next ability opportunity; also trigger the threshold during an active dash. | No new ability starts while speed is above `2 × baseSpeed`; the active ability/dash continues uninterrupted. Casting becomes available again once speed is at or below the threshold. | New cast starts while locked, active dash is interrupted, or lock remains after speed falls below threshold. |
| Cooldown pacing | Observe repeated activations for Baby Man and one other fighter over a sustained match. Compare the gap with configured cooldowns at normal game speed. | Each ability respects its configured cooldown; no immediate repeat or unexpectedly accelerated cadence. | Ability restarts before cooldown, cadence differs substantially from config, or cooldown never clears. |
| Phase-bound audio | Listen through a complete windup/active/recovery sequence, a dash ended by collision, then a fighter death or match restart. | Phase sounds stop/change at their phase boundary; loops do not linger after collision end, death, or restart. Hit one-shots play only on a successful hit and are not cut off as phase loops. | Stuck/overlapping loops, phase cue missing or ending at the wrong time, or hit cue on a miss. |

## Matchup sweep

- [ ] Baby Man vs. Angry Man: both custom dash sequences and collision behavior.
- [ ] Baby Man vs. Chef Man: crawl-to-dash and melee hit interaction.
- [ ] Angry Man vs. Depressed Man: windup/dash against melee.
- [ ] Happy Man vs. Woman Man: projectile ownership, collision, expiry, and pacing.
- [ ] One projectile fighter vs. one dashing fighter: projectile damage during dash.
- [ ] Any matchup through victory: winner movement and camera follow.

Log the build/commit, arena, fighters, and observed regression symptom for each failure so the run can be repeated.
