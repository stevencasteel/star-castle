# Star Castle — next-session implementation handoff

Build a super lean, immediately playable browser clone of the 1980 arcade game Star Castle. One arena, a drifting ship, three rotating shield rings, and a dangerous central cannon. The pleasure is carving openings, anticipating their alignment, and committing to a shot while being hunted. Give this small loop excellent movement, sound, and impact feedback.

## User requirements and current state

- The user explicitly wants a **super lean procedural-assets clone**, with **no menus or menu code**: go straight into the arena.
- Use arrow keys for movement and the X/C/V group for gameplay actions instead of Space. The first build has only one such action: X fires; C and V remain unassigned until a mechanic warrants them.
- Show a nonblocking startup controls hint with animated key presses. This is part of the running arena, not a menu or tutorial modal.
- The current work is a handoff and design audit, not a game implementation. The workspace contains this handoff; no game has been built or playtested. The values below are first-build decisions, not established playtest findings.
- Workspace: `/Users/stevencasteel/Desktop/Star Castle`.
- This handoff is self-contained. No other project, source export, or external asset pack is required.

## Execution contract: AI builds, human playtests

Implement the complete game slice described here, including the HUD, procedural presentation, audio, and action feedback. No menus. Follow the explicit mechanics and first-build values; resolve unspecified details autonomously with conservative, coherent decisions and record them in the README. Do not leave core behavior as a TODO, offer competing implementations, or stop for routine design approval. If a concrete mathematical or implementation conflict requires a deviation, make the smallest correction and document why.

The implementation AI performs source review, TypeScript typechecking, and the production build, fixing errors from those steps. It must **not play the game, drive a browser, run gameplay simulations or automated test suites, create a test harness, recruit players, profile runtime performance, or iterate through tuning experiments** in this initial build session. Do not create diagnostic galleries, trajectory overlays, replay tooling, or practice fixtures. These would expand the slice beyond the requested delivery. Collision queries and runtime safety checks are game functionality, not a request to run tests.

Deliver the entire implemented slice, launch instructions, the actual chosen configuration with brief rationale, and the human checklist at the end of this document. Report typecheck/build results honestly and label runtime behavior and feel **awaiting human playtest**. Do not claim perfect calibration from code inspection. The human plays, returns observations, and the AI then makes focused calibration changes. No human playtest is a prerequisite for completing the initial implementation.

In this document, design outcomes describe what to build; all runtime evaluation belongs to the final human checklist. First-build numbers remain fixed until human feedback or a documented correctness conflict warrants changing them.

## Intended experience and mastery

The repeatable combat rhythm is **prepare a breach → anticipate its movement → commit to a shot → evade the response → recover and reposition**. Player movement should create opportunities as well as avoid danger. Opening the castle exposes the player to a counterattack; eliminating a pursuer should buy a useful moment to aim.

These observable skills guide the design and later human feedback:

- **Beginner:** identify the ship, move intentionally, survive briefly, and deliberately break a segment.
- **Improving player:** maintain an orbit while aiming independently of travel direction; distinguish a damaged segment from an opening.
- **Skilled player:** anticipate a future firing lane, manage pursuers, and commit to an attack with a planned escape.
- **Expert:** create an efficient breach, bait the cannon's commitment, and reliably convert a short opportunity into a castle kill.

The critical acceptance maneuver is: establish an orbit, turn inward, fire through a moving breach, then redirect momentum without accidentally hitting the shields. The human checklist covers both directions and several distances. Continuous fire is a valid baseline tactic, but deliberate positioning and timing should improve results measurably. A successful player should be able to explain why a shot worked and reproduce it.

## Game to build

**Launch:** draw and run the arena immediately. Spawn the ship outside the castle with brief protection. Show the animated controls hint described below; no title, start button, tutorial modal, loading presentation, settings screen, or game-over screen. Audio unlocks on the first gameplay key/pointer gesture without delaying play.

**Movement:** a small outlined triangular ship; left/right rotate, thrust accelerates along its heading, and momentum persists after release. Start with immediate constant-rate rotation and no rotational inertia; simultaneous Left/Right inputs cancel. Use the specified speed cap and zero linear drag for controlled orbiting. Wrap across all four arena edges. This is rotation-and-thrust flight, not strafing or mouse aiming. Record analytically derived turn and acceleration times from the selected constants; leave observed redirection feel to the human. Keep the same movement rules across rounds.

**Firing contract:** start with shots traveling along the heading at a fixed world speed, without inheriting ship velocity. Use zero ship-velocity inheritance for the first build; do not implement or compare alternate modes. X fires on an accepted press and repeats at a fixed cadence while held. Latch a press until the next simulation tick so a quick tap between ticks cannot disappear. A press received during cooldown may buffer for up to 80 ms; expire it afterward, and never accumulate a burst. Holding X resumes fire as soon as the ship becomes playable after a transition; clear queued press events on death/reset and ignore new fire taps while the ship is unplayable, so released taps cannot fire later. Continue tracking held input for resumption. Emit muzzle feedback only when a shot actually spawns. Spawn and sweep shots so a muzzle near a shield cannot place a projectile beyond the first solid surface. No automatic shot bending or aim correction through gaps.

**Controls:** Left/Right arrows rotate; Up arrow thrusts; X fires while held. Down, C, and V are unassigned in the first build. Do not invent extra mechanics to fill keys. Space is not a gameplay binding. R immediately starts a fresh run; M toggles sound. Clear held keys and queued presses on blur, and suspend simulation while unfocused or hidden; resume without a time jump. Prevent browser scrolling for gameplay keys. Desktop keyboard is the first target; touch controls and gamepad support are deferred. Centralize bindings in a small action map consumed by both input handling and displayed key labels; gameplay consumes actions rather than browser key events.

**Animated controls hint:** place a compact strip in a reserved HUD margin, outside the playable arena and camera shake: Left/Right = Rotate, Up = Thrust, X = Fire. Use small keycaps that depress and brighten beside a miniature ship that demonstrates the corresponding action. Run one staggered demonstration cycle with no audio or gameplay side effects; while the hint remains visible, actual key presses highlight their matching keycaps. Hint timing: remain for at least four seconds, fade once rotation, thrust, and firing have each been tried, and otherwise fade by ten seconds. Show once per page session, not after every death or round; pressing H replays the strip without pausing play; show `H controls` in the footer. Do not show unassigned C/V/Down keys as active controls. Respect reduced-motion preferences with static key labels and restrained input highlights. Keep the first-round threat schedule gentle enough to let the player read and try the controls while play continues.

**Teach through the first encounter:** use a consistent outer starting position and a heading that allows a useful first shot without requiring immediate thrust. Delay the first spark enough to try the controls, then introduce pursuit gradually; do not wait indefinitely for a player action. Make the first damage mark, actual breach, ring rebuild, and cannon charge unmistakable. The controls strip teaches buttons; the encounter must also teach that the center is the objective, damaged arcs remain solid, and breaches expose both sides to fire. Include one short-lived caption in the reserved HUD margin from the first build: `Break a path to the core`. It must not block play or require dismissal.

**Castle:** a stationary cannon at the center, surrounded by three concentric rings of 12 separately destructible segments. Adjacent rings rotate in opposite directions at slightly different speeds. Gaps travel with the rings. The cannon turns toward the ship.

**Shield combat:** start with two hits per segment: intact, visibly damaged, then absent. A bullet is consumed by the first solid segment it reaches; it must never damage several rings at once. A shot must pass each ring's opening at the time it reaches that ring; a simultaneous static alignment is neither necessary nor sufficient. Destroying an entire ring regenerates that ring after a short readable pulse, closing its gaps. This is intended to favor selective breaches; the human will assess that outcome. Use this simple per-ring regeneration rule for the first build; exact historical regeneration choreography is not a blocker. If the ship overlaps the rebuilding annulus, keep that ring visibly pending and non-solid until the ship clears it. Never materialize lethal geometry through the ship. Keep this simple rule until human feedback identifies an exploit.

**Cannon:** track the ship with a bounded turn rate. When aimed through a clear opening, begin a visible charge, then lock the firing direction for a readable final commitment. Use 0.45 seconds total charge, with the final 0.20 seconds aim-locked, followed by 0.65 seconds recovery. Recheck clearance along the committed direction when firing, accounting for the orb's radius. If blocked, visibly discharge without a projectile and take the recovery; never silently retarget or immediately restart a full attack. The orb travels straight, does not wrap, and expires outside the arena; surviving shield segments absorb it without taking damage. Rings may intercept it later as they rotate. Dodging a committed attack should create a useful counterattack opportunity. A single player bullet reaching the core destroys the castle. No boss health bar or additional phases.

**Pursuers:** up to three small spark enemies create pressure to keep moving. Begin attached to rotating rings, then detach at staggered intervals and pursue with limited turning acceleration and bounded speed. Their turn limits should create readable overshoots that a player can exploit. Player shots destroy them; replacements attach visibly before detaching after a delay. Killing one must buy enough time to reposition or attempt a shot; use the specified 3.5-second replacement delay as that combat reward. Sparks can cross shields and wrap at the arena edges. Use the shortest wrapped displacement for pursuit and distance checks, and draw matching edge copies while a spark or ship straddles a boundary. Prevent new detachments within a short predicted interception distance of the ship; existing pursuit remains dangerous at edges. Give sparks distinct jagged silhouettes, visibly separate from the cannon projectile.

**Damage and continuity:** unprotected contact with live shields, the core, sparks, or enemy shots kills the ship. Begin with three lives. On death, remove enemy shots, cancel the cannon charge, and return surviving sparks to attached positions with staggered detachment delays; preserve shield damage and round scoring history. Respawn after 0.8 seconds at a safe outer position, with 1.2 seconds of visible protection. Choose the position using wrapped distances and predicted threat arrival, not current distance alone. Schedule renewed attacks so the player has time to steer before protection ends.

Protection prevents lethal damage, but does not allow penetration of solid shields or the core: sweep to first contact, separate the ship at the contact normal, and remove only inward velocity. Normal unprotected contact is lethal. Protected contact, muzzle placement, and high speed must not bypass intact rings. Use the specified 85% inset ship collision hull, consistently inside its visible outline; glow and exhaust never count. Keep the vulnerable hull readable throughout protection and its expiration.

On the last death, briefly accent the final score in the existing HUD, then automatically start a fresh run after the explosion beat. No confirmation or game-over screen. On castle destruction, clear threats and old player shots, play a compact victory burst, and rebuild the next castle in one second. Preserve score and lives, safely reposition the ship, and grant protection. Start the next threat schedule after the burst clears. For the first-build life economy, award one life on every third castle cleared only if the player survived that clear, capped at five. Losing one life on every castle must not sustain a run indefinitely.

**Progression and pacing:** endless rounds using a small authored sequence of parameter sets, followed by capped escalation. Introduce the loop gently, then emphasize pursuit on one round and moving openings on another before combining pressure. Do not increase ring speed, spark aggression, and cannon cadence together on every round. Preserve named minimum warning, aim-commitment, and recovery durations at the difficulty cap. Brief breathing room should come from defeating sparks, baiting a cannon shot, and completing a castle. A few explicit cooldowns and spawn delays are sufficient; no adaptive director is needed. The human checklist includes later-round overload and repetitive safe strategies. No new enemy families, upgrades, pickups, campaign, or unlocks.

**Scoring:** start with 10 points for the first destruction of each of the 36 segment identities in a castle, 50 points for each of the first three spark kills in that castle, and 1,000 for the core plus 25 for each segment identity never destroyed during that castle. A damaged but never destroyed segment qualifies. Regeneration restores health, but never restores scoring eligibility or preservation credit. Track these small counters/flags across deaths and ring rebuilds; reset them only for a new castle or run. Replacements remain worth killing for breathing room even after their point budget is exhausted. Tiny score, lives, and round readout only; no combo system or extra reward meter.

With D distinct segments destroyed, the combined segment and castle reward is `10D + 1,000 + 25(36 - D) = 1,900 - 15D`, plus at most 150 spark points. This rewards preservation and bounds farming; repeated rebuilds cannot inflate the total. Precision and advancing should remain attractive compared with delaying for spark points; this awaits human feedback. Exact values are tuning defaults, not claims of arcade accuracy.

### Firing opportunities and fair challenge

Treat ring radii, gap widths, rotation rates, projectile speed/size, and fire cadence as one coupled design problem. Implement the first-build geometry and constants below with projectile travel time and radius accounted for in moving collision queries. A static line of sight is only a cannon charge eligibility check, not a guarantee that a traveling shot will clear moving shields. No aim guide or trajectory diagnostics in normal play or development scope.

Favor truthful geometry and readable warnings. Do not disguise unfair geometry with extra effects or silently change a committed shot. Cannon and spark warnings must remain visually sufficient with audio muted and must not begin hidden under transition effects. Human feedback will determine opportunity frequency, aiming feel, and whether the initial values need calibration.

### First-build geometry and tuning

These values complete the initial design; store them with units in configuration. Positive angles are clockwise in canvas coordinates. Arena coordinates exclude the HUD margins.

| Parameter | First-build decision |
| --- | --- |
| Arena / castle | 960×720 units; core centered at (480, 360), collision radius 22; barrel sleeve decorative, length 32 from center |
| Ship | Outline 24 long × 16 wide; inset triangular collision hull at 85% of outline dimensions; initial position (480, 620), nose upward |
| Flight | Turn 270°/s; thrust 220 units/s²; speed cap 260 units/s; zero drag; immediate rotation with no angular inertia |
| Derived movement | 180° turn takes 0.667 s; acceleration from rest to cap takes 1.182 s; straight counter-thrust at cap takes 1.182 s and 153.6 units to stop, excluding the turn and its trajectory |
| Player bullet | Speed 620 units/s; collision radius 2; visible head diameter 4 with a trailing 8-unit dash; 0.14 s fire interval; 0.08 s press buffer |
| Rings | Centerline radii outer/middle/inner 144/112/80; radial thickness 10; 12 sectors of 30° each; initial offsets 0°/10°/20° |
| Segment seams | Collision sectors meet without gaps; draw a muted radial joint line at each boundary, never empty background between intact neighbors; an absent segment opens its entire sector |
| Rebuild | 0.65 s warning before solidity; if occupied, remain dashed and non-solid; once clear, restart the full warning, returning to pending if occupied again |
| Cannon | Track at 100°/s; begin charge within 6° of target and with clear muzzle-to-arena-edge ray for orb radius; 0.45 s charge, final 0.20 s locked; 0.65 s recovery; orb speed 240 units/s, radius 7 |
| Sparks | Jagged 14×18 silhouette with radius-6 collision center; acceleration 150 units/s², turn-rate cap 110°/s approached at 300°/s²; one hit to destroy |
| Spark scheduling | First round detaches at 6/9/12 s; subsequent rounds at 2/4/6 s; replacement attaches immediately and waits 3.5 s; final 0.45 s is a visible warning |
| Detachment safety | Defer by 0.5 s when wrapped separation is below 96 units or constant-velocity closest approach within the next 0.75 s comes within 48 units; repeat until safe |
| Respawn | 0.8 s death beat, then 1.2 s protection; choose among eight outer ellipse positions (radii 360×260) by best predicted threat separation; reset spark detachment delays to 2/4/6 s and inhibit cannon charge for 1.4 s after spawn |
| Progression | R1 ring speeds +12/−16/+20°/s, spark cap 110 units/s; R2 same rings, spark cap 130; R3 rings +15/−20/+25, spark cap 130; R4 rings unchanged, spark cap 145; R5 onward capped at +18/−24/+30 and spark cap 145 |
| Warning floors | Never shorten charge, locked aim, recovery, rebuild warning, detachment warning, replacement delay, or protection with progression |
| Limits / seed | 64 player shots, 16 enemy shots, 3 sparks, 400 particles, 16 audio voices; max 5 catch-up ticks; gameplay seed 1980 on fresh run; tuning version 1 |

The existing mechanics determine scoring, lives, mutual destruction, and continuity. Human feedback may later change this configuration; do not conduct parameter sweeps or build alternative modes before delivery.

## Procedural presentation and game juice

Aim for crisp luminous vector geometry on near-black. Draw everything with Canvas paths: ship, segmented arcs, cannon, jagged sparks, bullets, exhaust, fragments, and expanding shockwaves. Use a restrained palette: white/cyan player, distinct muted ring colors, hot orange/red hostile attacks, bright local impact flashes. Shape and damage pattern should communicate state as well as color. Avoid decorative backgrounds that compete with gaps and bullets.

Use a dim wider stroke beneath a crisp bright stroke for inexpensive glow. Any trail must decay quickly enough that destroyed shield segments immediately read as openings. Keep the HUD outside camera shake.

### Visual design system

Art direction: precise luminous instruments surrounding an imposing mechanical fortress. Treat geometry, color, value (light/dark), line weight, negative space, and motion as one coherent visual language. The following define the first-build visual language, without an additional asset pipeline.

| Asset | Shape and silhouette | Color/value role | Motion and state language |
| --- | --- | --- | --- |
| Player ship | Slim open triangle with an unmistakable nose and rear notch | Near-white core with cyan accents; consistently easy to locate | Immediate heading response; exhaust communicates thrust, not velocity |
| Player shots | Short narrow dashes aligned with travel | Pale cyan/white; small bright footprint | Fast, clean travel with minimal trail; clearly different from enemy orbs |
| Shield segments | Concentric engineered arcs with consistent radial thickness and aligned end treatment | Medium-value blue, violet, and teal ring identities, subordinate to active threats | Stable rotation; damaged segments gain an internal fracture mark while retaining a readable solid boundary; only absent segments create open negative space |
| Core/cannon | Compact faceted hub with one obvious projecting barrel | Restrained warm body; orange charge accent with a brief bright muzzle peak | Deliberate tracking; charge builds inward toward the muzzle, then releases outward |
| Sparks | Asymmetric jagged diamonds with a readable leading point | Amber, distinct from the cooler structural rings | Angular pursuit and a short directional tail; no random jitter that disguises their actual trajectory |
| Cannon projectile | Larger solid orb with a compact outer halo | Hot orange/red with a bright center | Heavy, continuous travel; silhouette and size distinguish it from shots and sparks |
| Exhaust | Tapered plume and sparse rearward flecks | Cyan fading quickly into the background | Short-lived irregular pulses confined behind the ship |
| Impact and debris | Local radial ticks and fragments derived from the struck object's geometry | Inherit source material color; brief bright contact point | Directional impulse followed by rapid decay; fragments must not resemble persistent hazards |
| Castle destruction | Broken arcs, core facets, and a thin expanding wave | Controlled peak brightness followed by fast value reduction | Staggered outward breakup; effects clear before the next engagement |
| HUD and controls hint | Quiet typography, consistent spacing, simple outlined keycaps | Neutral off-white labels with muted secondary text; cyan marks active input | Stable screen position; restrained fades and keycap depression |

**Semantic tokens:** define palette roles such as background, player, playerShot, shieldOuter/Middle/Inner, hostile, warning, text, and textMuted. The first-build palette is background `#080B12`, player `#ECFCFF`, playerAccent `#66E3FF`, shieldOuter `#638DA8`, shieldMiddle `#927BAF`, shieldInner `#589B91`, hostile `#FF784F`, warning `#FFC56A`, text `#DCE5EF`, and textMuted `#98A6B7`. Use these first-build tokens; actual-size readability awaits human feedback. Keep palette values out of individual drawing functions.

**Shape and stroke discipline:** use a small named scale for line widths, glow strength, spacing, and effect intensity. At a 960x720 logical arena, use 1.5 units for secondary detail, 2 for ordinary silhouettes, and 3 for emphasis. Keep construction consistent within each asset family. Glow is decorative and never expands collision bounds. Shield damage markings must not look like traversable gaps. Enemies, player, projectiles, and damaged shields must remain distinguishable through silhouette and markings independently of hue and glow.

**Attention hierarchy:** player location and imminent attacks have first claim on contrast and sound; shield state comes next; decorative effects come last. Avoid uniformly bright outlines and continuously pulsing everything. Give cannon charging and ring rebuilding different animation directions and shapes so neither relies on hue alone. Use explicit spawning/protection cues that preserve the ship silhouette rather than making it disappear through long blinks. Ensure the controls strip and HUD remain readable at the smallest supported viewport.

**Implementation:** use the asset dimensions, state language, and event envelopes below directly in the drawing functions. Visual runtime assessment belongs to the human checklist; no contact sheet or gallery is required.

### Gameplay HUD layout and visual hierarchy

Use a 960×816 logical composition: top HUD y=0–48, playable arena y=48–768, bottom hint band y=768–816. Translate arena rendering by (0, 48); keep physics in its own 960×720 coordinates. Clip shaken world rendering to the arena. HUD and hint bands remain stationary and reserved even after hints fade, so the arena never resizes mid-run. Uniformly scale the whole composition with letterboxing. Desktop minimum intended viewport is 800×680 CSS pixels; smaller windows retain the layout but may have reduced legibility.

- **Spacing and typography:** use a 4/8/12/16/24 spacing scale; 16-unit outside padding. Use the system monospace stack, tabular numerals, no font downloads. Primary numeric values are 20 units at weight 600; labels, status, and controls are 16 units at weight 400. Align all top-row baselines at y=31. No glow on text.
- **Top row:** left `SCORE 000000` at x=16; centered `ROUND 01` at x=480; right-align `LIVES` plus up to five miniature 12×9 ship outlines at x=944, spaced 18 units apart. Score uses at least six digits and expands without truncation; rightward growth has a reserved width of 320 units. All lives icons represent remaining lives including the active ship. Empty lives use muted outlines; no hearts, health bar, panel cards, or buttons.
- **Bottom band:** while teaching, place the rotate, thrust, and fire groups from x=16 with 24-unit group spacing; keep a 24×24 miniature demonstration ship beside each group. Keycaps are 26×26, radius 4, stroke 1.5, with 6-unit gaps. Their fill is `#111B29`, border/text uses textMuted/text. Reserve the rightmost 250 units for `Break a path to the core`, split over two 16-unit lines. Both teaching content and caption fade out over 0.25 s using the hint lifetime rule.
- **Persistent footer:** after teaching fades, show `H controls · R restart` on the left and `M sound on` or `M sound off` on the right, inset 16 units, baseline y=799. During teaching these footer labels are hidden to avoid overlap; bindings still work. H restarts the teaching animation/lifetime without resetting the game. Record H in the shared action map and ignore key repeat, as with R/M.
- **Color grammar:** the near-black background sets the lowest value; desaturated cool shields are structural mid-value forms; near-white player/text provide focal clarity; saturated warm hostile/warning colors signal urgency. Use the existing exact palette tokens. Ring hues identify layers, while fracture marks identify damage. Hostile versus warning must also differ by orb/spike versus converging brackets, so hue alone never carries state. Reserve near-white peak flashes for small, brief contact regions.
- **Contrast and material:** text and vital outlines use full-opacity token colors; mute decorative fills and halo opacity rather than dimming essential labels. Glow underlay is 6 units at 0.16 opacity beneath the crisp silhouette; no blur filter required. Broken segments have no lingering arc glow. HUD hierarchy comes from alignment, spacing, font size, and value rather than extra borders.
- **Layer order:** background, shield/core geometry, low-opacity debris, active bullets/sparks/ship, essential charge/protection/rebuild indicators, then HUD outside the world clip. Cap decorative opacity around live firing lanes. The actual ship hull remains visible at all times, including death onset and protection expiration.

### Exact first-build feedback envelopes

All distances below are logical units and times are seconds. Use immediate attacks and cubic ease-out decays unless a simulation-controlled warning is specified. The detailed animation treatments in the next section use these values. Never ease authoritative movement or collision geometry.

| Trigger | Visual response and timing | Sound / camera |
| --- | --- | --- |
| Thrust pressed / released | Plume reaches 18-unit length in 0.04, settles to 14 in 0.08; fades within 0.10 after release; engine accent peaks at 3% stretch | Rumble gain attack 0.04/release 0.08; no shake |
| Accepted player shot | 6-unit muzzle accent expands to 9 and fades over 0.08; weapon accent recovers in 0.08 | Dry chirp lasting 0.045; no shake |
| First shield hit | Contact flash radius 5, fade 0.09; 4 flecks lasting 0.16; persistent internal zigzag fracture, with intact outer boundary | Short pitched tick 0.06; no shake |
| Segment destroyed | Remove arc immediately; 8 angular fragments, outward speed 50–110 plus ring tangential velocity; fade within 0.28 | Crack 0.10; shake cap 0.6 for 0.08 |
| Ring rebuild / pending | Dashed full-annulus brackets converge radially from 6 units out over the 0.65 warning; occupied state holds static dashed brackets; solid arc appears only on actual rebuild, then accent fades over 0.12 | Soft rising cue only during advancing warning; no continuous pending tone or shake |
| Cannon charge / locked aim | Muzzle brackets converge throughout 0.45 charge; final 0.20 uses a fixed bright aiming notch and fixed axis; no drawn line through gaps | Rising tone follows simulation charge; release chirp at actual firing |
| Cannon fire / blocked discharge | Sleeve recoils 3 units and recovers in 0.12; blocked shot collapses charge inward over 0.10 with no outbound streak | Fire uses 0.12 low pulse; blocked shot uses 0.08 soft fizz; no shake |
| Enemy orb absorbed by shield | Extinguish at contact; 5-unit warm halo contracts to zero over 0.10; no fracture or shield damage flash | Soft 0.06 sizzle; no shake |
| Spark warning / kill | Warning spikes contract 15% over final 0.45, then expand back in 0.08 at detachment; kill emits 6 amber ticks lasting 0.20 | Brief warning chirr; kill pop 0.08; no shake |
| Protection start / expiry | Four cyan corner brackets 6 units beyond hull; during final 0.30 shorten continuously to zero, never blink hull; vanish precisely when protection ends | Soft spawn cue 0.10; no shake |
| Score increment / life gain | Score accent changes to playerAccent and decays over 0.18 (0.35 for castle); coalesce increments within 0.10 while updating number immediately; earned life outline expands 1.0→1.15→1.0 over 0.25 | Life gain two-tone 0.18 cue; no shake |
| Ship death / final life | 14 hull fragments fade within 0.55; life icon accent fades 0.18; final score accents for existing 0.8 death beat, never opens a new panel | Bass/noise 0.25; shake cap 3 for 0.25; hit stop 0.05 |
| Castle destroyed / next round | Core breaks immediately; ring fragments stagger outward over 0.12 and clear by 0.65; thin wave expands to radius 180 over 0.45; reconstruct during final 0.20 of 1.0 transition; round label accents 0.25 | Layered blast 0.40; shake cap 5 for 0.35; hit stop 0.07 |
| Demonstration / actual key press | Demo rotate, thrust, fire groups in consecutive 0.8 intervals; keycap depresses 2 units, cyan border and filled accent; actual press overrides demo for that key; release recovers over 0.10 | Silent; cosmetic miniatures never affect gameplay |
| M toggled / H replay | Update mute text immediately when visible, accent for 0.15; H reveals hint over 0.15 and restarts its demonstration | Muting silences all voices immediately with short click-preventing ramp |

Combine shake impulses with a hard 5-unit cap and smooth decay; routine fire contributes none. Reduced motion disables camera shake, keycap travel, engine deformation, and expanding victory wave; retain static state markings, short opacity fades, and restrained particles. Replace moving key demonstrations with static labels and input highlights. Disable hit stop under reduced motion. Warning and protection timers remain unchanged.

### Animation and motion design

Use anticipation, squash/stretch, follow-through, overlapping action, staging, and deliberate timing to give each material a distinct response. The ship and castle should feel precise and mechanical; energy, exhaust, and fragments can deform more freely. Avoid making every entity wobble or bounce. Use the exact first-build envelopes above where older descriptive ranges below overlap.

| Subject | Animation treatment | Readability constraint |
| --- | --- | --- |
| Ship thrust | Immediate exhaust ignition; stretch the plume along thrust, then let it settle with one small overshoot. 3% deformation of an interior engine accent | Keep the outer hull, nose direction, and collision silhouette stable; do not delay input for anticipation |
| Ship firing | Fast muzzle expansion and short recovery of an interior weapon accent, 80 ms | Spawn the shot immediately when fire is accepted; no additional physical recoil or hull displacement in the first build |
| Player projectile | Stable bright head with a short velocity-aligned trailing smear; a brief cosmetic launch streak can emphasize release | The visible head tracks the collision position; smears are not extra damaging geometry and stop at impacts and wraps |
| Shield hit | Quick local brightness attack followed by a 90 ms fade; internal fracture marks persist after damage | Do not wobble, squash, or displace live arc boundaries; openings must remain geometrically truthful |
| Segment break | Fragments inherit local tangential ring velocity plus an outward impulse; rotate and shrink/fade with varied bounded lifetimes | Remove the solid segment immediately; debris must quickly vacate the firing lane |
| Cannon charge/fire | Draw decorative energy inward during the actual charge; expand a muzzle accent on release and recoil/recover a non-colliding barrel sleeve | Charge timing is authoritative gameplay state; keep the aiming axis, projectile origin, and collidable core truthful |
| Cannon projectile | Stable luminous core with a mildly stretching energy halo aligned to velocity; compress or flare the halo at impact | Keep the dangerous core readable at constant size; exaggerated halo motion must not conceal its hitbox |
| Spark detachment/pursuit | Brief contraction of outer decorative spikes before detachment, then a fast expansion; tail bends and settles behind turns | Detachment warning follows simulation state; stable center/leading point communicates the real trajectory; no cosmetic fake dodges |
| Spawn/protection | Assemble a decorative bracket or halo around the already readable hull; simplify it as protection expires | Protection and its expiration come from simulation timers; never imply protection after vulnerability returns |
| Keycap hint | Small downward keycap movement and an immediate highlight, followed by a quick eased release | Keep text legible and actual-input highlights prompt; reduced-motion mode uses static highlights |

**Timing and spacing:** favor a fast attack and a slightly longer, smoothly damped recovery. Use overshoot selectively and let it settle; never apply the same spring to all assets. Projectile travel, ship steering, and ring rotation follow simulation rules rather than decorative easing. Anticipation belongs to readable enemy warnings; basic player actions respond immediately. Stagger larger destruction effects over a short interval so they have a readable sequence instead of one simultaneous particle cloud.

**Animation ownership:** keep cosmetic offsets, scale, flash, and recoil outside authoritative transforms. Use small named effect envelopes or a focused damped-response helper, not a general animation framework. Effects consume gameplay events once. Bound and combine repeated impulses so sustained fire cannot grow deformation indefinitely; reset transient envelopes on relevant lifecycle transitions. Define local pivots and compose presentation transforms in a consistent order without modifying the transform used by collision queries.

**Two clocks:** combat telegraphs, protection indicators, and rebuilding warnings derive from simulation state and freeze with it. Cosmetic recovery, hit-stop release, debris, and interface fades use bounded presentation delta while the page is active. Suspending the page resets timing baselines. A frozen simulation must never show a warning completing or protection expiring early.

### Additional feedback priorities

- **Directional impacts:** place effects at the resolved contact point, using the incoming velocity and contact normal. Differentiate a hit, a break, and a harmless enemy shot absorbed by a shield. Keep player-shot sounds immediate and synchronized with the visual event.
- **Audio hierarchy and variation:** prioritize cannon warnings and death cues over routine impacts when voices are scarce. Use small bounded cosmetic pitch/timbre variation to reduce repetition; preserve identifiable cue families. Briefly reduce routine sound levels under a major blast, then recover smoothly. Keep cosmetic randomness independent of simulation randomness.
- **Dynamic range:** establish quiet motion and ordinary hits as the baseline so a castle kill has somewhere to go. No shake on routine firing; reserve large brightness, camera motion, and bass for rare events. Avoid a full-screen white flash or repeated automatic zooms.
- **Reward confirmation:** give the score readout a small localized pulse when points arrive, with stronger emphasis for a castle kill; coalesce rapid updates. Keep the displayed total accurate and avoid floating score text over openings. This communicates existing rewards without adding a combo system.
- **Designed endings:** give effects a clear release as well as an onset: exhaust fades when thrust stops, absorbed shots extinguish at contact, destruction debris clears, and reconstruction settles cleanly. Silence sustained ship sounds immediately on death or focus loss.
- **Effect isolation:** keep glow, particles, deformation, shake, and audio strengths in configuration. Cosmetics must not alter gameplay outcomes; threats take rendering priority over bursts. Reduce shake and deformation for reduced-motion preferences.

| Event | Feedback |
| --- | --- |
| Thrust | Short flickering exhaust, sparse particles, responsive low synth rumble |
| Fire | Tiny muzzle pulse and short dry chirp; avoid shake on every shot |
| Shield damage | Local flash, pitched tick, a few outward sparks |
| Segment break | Angular fragments and a stronger crack; at most a tiny camera kick |
| Cannon charge | Brightening muzzle and rising tone that clearly precede the shot |
| Ship death | Ship-shaped fragments, short bass/noise burst, modest decaying shake |
| Castle kill | Rings fracture outward, expanding light ring, layered synth blast, strongest shake |

Reserve hit stop for ship death (50 ms) and castle destruction (70 ms), disabled under reduced motion. Ordinary firing and shield hits must remain fluid. Advance the hit-stop release timer and cosmetic effects using presentation time so hit stop cannot freeze its own timer; gameplay telegraphs continue to follow simulation time as specified above. Keep explosions brief; player control and the next attempt are the priority.

Generate audio with native Web Audio oscillators, a reusable generated noise buffer, and short gain/filter envelopes. Use a conservative master gain, dynamics compression, and a voice cap; disconnect finished voices. Reuse the thrust voice and ramp it rather than creating one per frame. The first version needs sound effects, not a music system or recorded assets. Muting must also silence continuous sounds.

## Lean technical plan

Suggested stack: TypeScript, Vite, one HTML Canvas 2D, native Web Audio, zero runtime dependencies. Development tooling is fine. No React, state store, game engine, ECS, generic event bus, physics library, worker pipeline, shader stack, or asset loader is needed for this scope.

Keep a handful of focused modules, splitting only where useful:

- `main.ts`: canvas lifecycle, input listeners, animation loop, resize and focus handling.
- `game.ts`: compact state, fixed-step update, ships/rings/enemies, collisions, scoring and resets.
- `render.ts`: procedural drawing and small bounded particle/effect arrays.
- `audio.ts`: synthesized cues and shared audio graph.
- `config.ts`: a small set of named tuning constants and palette values.

Use plain entity records and bounded arrays. Use limits of 64 player shots, 16 enemy shots, three sparks, and 400 particles; dropping cosmetic particles at capacity is acceptable. Pool only if needed, without a generic framework.

Simulate at 60 Hz with an accumulator and render through requestAnimationFrame; interpolate moving objects for higher-refresh screens. Cap catch-up work and discard accumulated time after focus/visibility changes. Keep input feedback immediate; interpolation must not add an avoidable extra delay to local steering or accepted-shot feedback. Use the fixed 960×720 playable arena within the 960×816 composition specified below, uniformly scaled and letterboxed to the viewport. Cap device pixel ratio at 2. Resizing must not reset play or stretch the castle.

Collision accuracy is the main technical risk. Sweep each bullet from its previous position to its new position, test ring geometry using the same segment boundaries and thickness as rendering, and resolve the earliest collision. Handle angle wrap at 0/2π. Share the shield geometry query with cannon clearance checks, passing the appropriate projectile radius. A visual seam between intact segments must not accidentally become a firing gap. Account for moving ring boundaries during each tick with bounded subdivision if needed. Sweep the ship against surviving arcs and the core, including protected contact; do not treat an entire ring radius as solid or rely only on endpoint overlap. Split wrapped movement paths at the arena boundary so wrapping cannot create a phantom sweep through the castle; handle interpolation and cross-edge contacts consistently. Player bullets expire at the edge instead of wrapping.

Use small explicit run states such as playing, respawning, and castle-destroyed, with timers. Keep ring rebuild, life respawn, round reset, and full-run reset distinct so shield damage, scoring eligibility, score, and lives persist only when intended. Resolve simultaneous lethal events consistently: collect valid core-kill and ship-death outcomes for the tick before lifecycle cleanup; if both occur in that tick, count both, credit the castle score and clear count, apply life loss, and award no survival life bonus. If lives reach zero, show the resulting final score during the short death beat and start a fresh run; otherwise advance to the next castle with the normal safe transition. Prevent duplicate deaths, rewards, or transitions in the same tick. This deliberately treats same-tick mutual destruction as a trade; do not let entity iteration order decide whether the player survives. Threat cleanup takes effect before the next tick.

## Engineering quality standards

Keep the implementation small and deliberate. Quality here means predictable simulation, precise collisions, immediate feedback, bounded resource use, and code that is easy to tune.

- **One owner for gameplay state.** Only the simulation changes entity positions, health, scores, and transitions. Rendering reads state; audio and particles consume a small list of typed gameplay events emitted once per update. Drain those events once, independently of render interpolation, so a hit cannot play twice on a high-refresh display. Plain function calls or a short event array are sufficient.
- **Explicit time and input.** Express speeds in logical units per second and durations in seconds. Pass the fixed delta into simulation functions. Snapshot input each tick; consume latched one-time presses once, retain held actions across ticks, and ignore keyboard repeat for restart/mute. Enforce the bounded fire buffer and transition clearing rules above. Keep presentation time separate from gameplay time. Never use wall-clock timers for respawns or combat transitions.
- **Reproducible behavior.** Give gameplay randomness a seeded generator independent of cosmetic randomness. The same seed, tuning version, and input sequence should produce the same simulation even with particles disabled. Pass an input snapshot into the update function. Use a fixed initial gameplay seed and display its value with the tuning version in the README so human reports identify the configuration. Do not build input recording or replay infrastructure.
- **Stable collision resolution.** Gather candidate contacts, choose the earliest valid hit, and resolve each projectile only once. Use a defined tie-break for equal-time contacts. Defer removals until iteration is safe, or iterate backward when using swap-and-pop. Never let array removal skip another entity. Keep numerical tolerances named and proportional to the logical geometry.
- **Interpolation without artifacts.** Cache previous positions and angles before each simulation tick. Interpolate angles along their shortest arc. Set previous and current transforms equal after spawning, teleporting, or resetting; handle edge wrapping explicitly. Rendering must never feed interpolated values back into physics.
- **Bounded work and allocation.** Reuse small hot-path buffers where straightforward, and avoid per-particle gradients, filters, or temporary object creation each frame. Set explicit limits for particles, projectiles, audio voices, and catch-up steps. At capacity, drop cosmetic work first; reject a gameplay shot consistently without emitting a false muzzle flash or sound. Keep removal order deterministic if it affects combat.
- **Clean lifecycle.** Own one animation loop and one audio context. Provide teardown for listeners, animation frames, and audio nodes, including development hot reload. Restart resets existing state without installing another loop or listener. On blur, clear keys and silence thrust immediately. On return, reset the timing baseline. Audio initialization failure must leave a playable silent game and allow a later gesture to retry.
- **Intentional feedback.** Define named color roles and a compact set of effect strengths in configuration. Use coherent, smoothly decaying camera shake with a capped combined amplitude; a small hit should not overwrite a larger explosion. Keep shake purely visual. Ramp audio gains to avoid clicks, limit overlapping voices, and stop sustained sounds on death, reset, mute, and focus loss.
- **Readable, checked code.** Enable TypeScript strict mode. Use small typed records and explicit state transitions; avoid unchecked casts and speculative abstractions. Centralize tuning values with units and brief rationale. Comment collision assumptions and unusual edge cases. Keep the lockfile and provide dev, typecheck, and build commands using only the tooling needed for this game.
- **Performance by construction.** Target smooth play at 60 Hz and consistent game speed at higher refresh rates. Bound effect lifetimes, entity counts, and audio voices explicitly. Runtime performance assessment belongs to the human; do not add profiling infrastructure.

## Build order and AI delivery

1. Boot directly into the arena; implement flight, wrapping, firing, and immediate action feedback using the specified configuration.
2. Implement moving shield collisions, damage, pending rebuilds, and core destruction.
3. Add cannon commitments, sparks, warning cues, and scheduling safeguards.
4. Add death/respawn, round/run transitions, scoring, and life economy.
5. Add the full HUD, animated controls, objective caption, and authored progression.
6. Complete all procedural art, action/state animation, synthesized audio, reduced-motion handling, and lifecycle cleanup. Do not defer polish as optional future work.
7. Review source against this document, run typecheck and production build, and fix compile/build errors. Do not run browser or gameplay tests. Deliver the source and the following human playtest handoff.

The README must include launch commands, controls, tuning version/seed, actual constants and rationale, any necessary deviations, and known limitations. The final AI message must state what was implemented, the typecheck/build outcomes, that runtime playtesting awaits the human, and an actionable checklist. The initial build is complete when the specified source and presentation are implemented and compile/build successfully; experiential calibration follows human feedback.

## Design references and application

These sources inform the design principles, not the exact mechanics or numerical defaults proposed here. They are background rationale, not instructions to browse references or perform testing during implementation.

- [Steve Swink — Game Feel: The Secret Ingredient](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient): prototype the pleasure and precision of moment-to-moment control early. Applied through explicit movement constants and the human orbit–aim–fire–recover checklist.
- [Maddy Thorson — Celeste & Forgiveness](https://www.mattmakesgames.com/articles/celeste_and_forgiveness/index.html): small allowances can recognize player intent. Applied here through input capture, a bounded fire buffer, and an inset ship hull; this does not justify changing shield gaps or bending shots.
- [Michael Booth — The AI Systems of Left 4 Dead](https://cdn.akamai.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf), especially slides 77–91: distinguish pressure timing from difficulty and create peaks with recovery. Applied through commitments, cooldowns, and spark replacement delays; this small game does not need Left 4 Dead's director architecture.
- [Soren Johnson — Water Finds a Crack](https://www.designer-notes.com/page/20/): players can optimize toward repetitive behavior when rewards encourage it. Applied through explicit preservation rewards, bounded renewable scoring, and sacrifice/farming checks.
- [Kim Swift — Thinking With Portals: Creating Valve's New IP](https://www.gamedeveloper.com/design/thinking-with-portals-creating-valve-s-new-ip): test rough content early and use observed behavior to guide development. Applied after delivery through human observations and subsequent AI calibration.
- [Martin Jonasson and Petri Purho — Juice It or Lose It](https://www.gdcvault.com/play/1016487/juice-it-or-lose): concrete feedback treatments can make simple interactions more satisfying. Applied through the existing procedural effects and sound specifications, constrained by collision truth, readability, and dynamic range.

## Historical reference boundary

The original's defining features include three oppositely rotating 12-segment shields, a central cannon that fires through an opening, pursuing sparks, rotational/thrust controls, and a wrapping playfield. See [Museum of the Game: Star Castle](https://www.arcade-museum.com/Videogame/star-castle). Ring regeneration and the reward for destroying the cannon are also described by [MobyGames](https://www.mobygames.com/game/12423/star-castle/). Numerical tuning, timings, scoring, telegraphs, and the explicitly simplified rules in this handoff are design proposals, not claims of ROM-accurate behavior.

## Human playtest checklist — deliver this at the end

**Owner: the human, after the complete slice is delivered. These are not tasks for the implementation AI to execute.** Start with a normal uncoached attempt, then use the focused checks. Return observations you can collect naturally; no instrumentation, formal measurements, or additional testers are required. Optional clips are useful for elusive issues.

1. **First impression:** open the game and try the animated arrow/X hints. Is the ship obvious, is the core objective understandable, and does the hint disappear without blocking combat? Try H to replay it. Note confusion between a damaged segment and an opening.
2. **Flight and firing:** orbit clockwise and counterclockwise; turn inward, shoot, and recover at close and far distances. Try quick X taps and held fire. Report sluggish turning, excessive drift, lost shots, difficulty stopping, or whether deliberate aim feels useful compared with spraying.
3. **Shield truth:** hit a segment twice, shoot near sector seams, and fire through moving gaps. Approach intact shields during protection. Report shots or ships passing through solid arcs, hits in apparent openings, or disappearing bullets with no readable cause.
4. **Rebuild:** clear a whole ring. Is its return readable? If you occupy its annulus during protection, does it stay pending and give a fresh warning after you leave? Note if delaying rebuild becomes an easy dominant tactic.
5. **Threats:** watch a cannon charge, dodge its locked direction, and try to counterattack. Kill a spark and use the breathing room. Repeat with M muted. Report surprise shots, unreadable sparks, unfair edge encounters, or warnings concealed by effects.
6. **Transitions:** die, hold X through respawn, clear a castle, and lose all lives. Watch for safe respawns, correct remaining lives/score, immediate automatic continuation, and any duplicate rewards. If a core kill and death happen together, describe the outcome.
7. **Rewards and progression:** compare a narrow breach with broad destruction. Repeat ring rebuilds and spark kills to look for renewable scoring. Reach later rounds if practical; report long passive waits, overload, or a repetitive safe strategy. Skipping later-round checks is fine—say what you reached.
8. **UI and juice:** inspect score/lives/round, controls, mute status, damage marks, protection expiry, and pending rebuilds. Do fire, impacts, spark kills, death, and victory feel distinct? Note weak or excessive effects, tiring brightness, tiny text, obscured gaps, or misleading halos.
9. **Browser and accessibility:** resize the window, change focus while holding inputs, return, restart with R, and mute/unmute. If available, try system reduced motion and a different refresh-rate display. Report stuck keys, time jumps, missing audio after a gameplay gesture, stretching, or unreadable small-window layout.
10. **Sustained play:** play several rounds with sustained firing and large explosions. Report visible stutter, growing audio volume, lingering debris, or deteriorating responsiveness; no profiler is needed.

Return feedback in this compact form, using one entry per issue:

- **Build/tuning version; browser and approximate window size:**
- **Round and action:** what you were doing.
- **Expected / observed:** what you wanted versus what happened.
- **Feel:** too fast/slow, weak/strong, clear/confusing, easy/hard; use your own words.
- **Frequency:** once, sometimes, or reliably; reproduction steps if known.
- **Priority:** blocks play, affects fairness/readability, or polish preference.

Also report what felt good and should stay. After receiving this feedback, the AI should identify likely causes, adjust the smallest relevant group of constants or behaviors, record the change, and return targeted human rechecks. Do not invent observations or label unplayed behavior calibrated.
