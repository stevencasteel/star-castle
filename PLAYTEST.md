# Human playtest handoff

Build **0.6.0**, tuning **2**, seed **1980**. The implementation is source-reviewed and compiled. Revised runtime behavior and feel are **awaiting human playtest**. This checklist belongs to the human; no automated gameplay or instrumentation is needed.

This is the original ten-part handoff checklist adapted to the user's new boss-health, ring-zap, and no-scoring requirements. Start with an ordinary uncoached attempt, then try whichever checks arise naturally. No need to force rare trades or complete every round.

1. **First impression.** Try the arrow/X hints and replay them with H. Is the ship obvious? Does the eight-cell CORE health display explain the objective? Distinguish a fractured segment from an actual opening. The hint should disappear without blocking combat.
2. **Flight and firing.** Orbit both directions; turn inward, fire, and redirect momentum at close and far distances. Try quick X taps and held fire. Report sluggish turning, lost shots, excessive drift, or whether deliberate aim remains useful compared with spraying.
3. **Shield truth and zap.** Hit segments twice and shoot through moving gaps. Fly into an intact ring: it should rebound and visibly zap you, not directly remove a life. Up should produce no acceleration/exhaust for two seconds; steering should still work, and new shots should travel at half speed. Try a glancing hit or an inner ring face naturally. Look for penetration, repeated buzzing at one contact, or an unrecoverable trap. Core-body, spark, and orb contact remain lethal without protection.
4. **Rebuild.** Clear a whole ring. Its dashed warning should be readable, remain pending while the ship occupies the annulus, and restart the full warning after leaving. Check this while zapped if practical. Rebuilding shields must not heal the boss. Note whether holding a rebuild pending becomes a dominant safe tactic.
5. **Threats.** Watch cannon charge and locked aim, dodge, then counterattack. Kill a spark and use the replacement delay. Repeat with M muted. Report surprise shots, unreadable sparks, unfair wrapped-edge contacts, or warnings concealed by debris/electrical effects. A ring zap offers no new invulnerability against these hazards.
6. **Health and transitions.** Reach the core with several bullets: one hit should remove one health cell; the eighth should clear the castle. Die between hits: remaining boss health and shield damage should persist. Hold X through respawn, clear a castle, and eventually lose all lives. New castles and fresh runs should refill boss health; stun should clear. A final-hit/death trade must not duplicate the round transition or earn a survival life.
7. **Lives and progression.** Living clears 3, 6, 9… should award one life, capped at five. Compare rounds 1–5 and later if practical: pursuit and ring speeds alternate increases and then cap. Report overload, passive waiting, boss fights that feel too short/long, or a repetitive safe strategy. There are no points to farm. Say which round you reached if skipping later checks.
8. **UI and feedback.** Inspect core health, lives, round, controls, mute status, fractures, protection expiry, and pending rebuilds. Look for clear core-hit/zap/death/victory differences. The stun's amber electrical frame and timer should be distinct from cyan protection. After recovery, new shots should be fast and thrust should resume if held. Old slow shots retain their launch speed. Report tiny text, distracting brightness, obscured gaps, or misleading halos.
9. **Browser and accessibility.** Resize; change focus while holding inputs or while stunned; return; restart with R; mute/unmute. If available, try reduced motion and a different display refresh rate. Stun should pause with the game; holding inputs should not survive focus loss. Reduced motion removes shake/hit stop and moving decoration while retaining static electrical/state cues. Report time jumps, missing audio after a gesture, stretching, or small-window clipping.
10. **Sustained play.** Play several rounds with sustained firing, zaps, and explosions. Report visible stutter, growing audio volume, lingering debris, or deteriorating responsiveness. No profiler is needed.

## Feedback format

Use one entry per issue:

- **Build/tuning version; browser and approximate window size:**
- **Round and action:** what you were doing.
- **Expected / observed:** what you wanted versus what happened.
- **Feel:** too fast/slow, weak/strong, clear/confusing, easy/hard.
- **Frequency:** once, sometimes, or reliably; steps if known.
- **Priority:** blocks play, affects fairness/readability, or polish preference.

Also report what felt good and should stay. A screenshot plus a short timing/sound observation is useful; an optional clip can clarify elusive collisions. The next changes should target observed behavior, not speculative retuning.
