# Hearthline — 1D Dollhouse Island Prototype Design

## 1. High Concept
**Hearthline** blends the tactile 1D clarity of *Patapon* / *Kingdom*, the cozy neighbor interactions of *Animal Crossing*, the warm open-front miniature charm of a **cutaway dollhouse**, and the spicy ("jalapeño") pressure of **nighttime tower defense**.

By day, players stroll left and right along a narrow island diorama to gather resources, scrub neon-purple pollution mounds, plant flora that pushes back corruption, and hang out inside open-front villager dollhouses. By night, amber cottage lanterns glow against dark indigo skies while glowing corruption portals send waves of modular enemies down both flanks of the road.

---

## 2. World Layout (1D Diorama Strip)
Movement stays locked to the **X-axis road** (`Z = 0`, `x ∈ [-53, +53]`), framed from an **elevated 3/4 miniature tabletop angle** so sky, cutaway dollhouse interiors, road gameplay, and foreground shoreline all read clearly in both **mobile portrait** and desktop landscape.

| Zone | X Range | Contents |
| :--- | :--- | :--- |
| **Left Corruption Portal** | `-56` | Neon-purple spawn monolith |
| **Left Frontier** | `-53 .. -28` | Trees, boulders, pollution mounds, dynamic corruption border |
| **Left Defense Ring** | `-28 .. -16` | Turret / barricade / flower plinths (`-26`, `-20`) |
| **Central Dollhouse Town** | `-16 .. +16` | Engineer (`-13`), Medic (`-5`), Town Heart (`0`), Defender (`+5`), Merchant (`+13`) |
| **Right Defense Ring** | `+16 .. +28` | Turret / barricade / flower plinths (`+20`, `+26`) |
| **Right Frontier** | `+28 .. +53` | Trees, boulders, pollution mounds, dynamic corruption border |
| **Right Corruption Portal** | `+56` | Neon-purple spawn monolith |

---

## 3. Core Systems
### Hybrid Ecological Pushback
- **Continuous Corruption Borders:** Left and right neon-purple mist lines start around `±34`. Planting purifying trees/flowers pushes the mist outward (`±50`), while enemy breaches encroach inward (`±12`).
- **Scrubbable Pollution Mounds:** Physical crystalline corruption clusters in the frontiers can be scrubbed for **Gloom Shards** and reclaimed safe ground.

### Four Core Resources
1. **Wood** — harvested from trees; used for furniture, barricades, basic turrets.
2. **Stone** — mined from boulders; used for reinforced walls and turret bases.
3. **Sun-Petals** — foraged / grown; used for purifying flowers, Medic heals, and cozy NPC gifts.
4. **Gloom Shards** — dropped by scrubbed mounds and enemies; used for weapon mods, spicy upgrades, and Merchant trades.

### Four Villager Roles (Day 1 Roster)
| Role | Dollhouse | Affinity | Progression & Perks |
| :--- | :--- | :--- | :--- |
| **Engineer** | Cozy Workshop (`x = -13`) | Wood + Stone | Turret fire rate, stronger barricades, modular barrels |
| **Medic / Botanist** | Sunny Greenhouse (`x = -5`) | Sun-Petals + Wood | Player & Town Heart healing, stronger purifying flora |
| **Defender** | Mini Watchtower (`x = +5`) | Stone + Gloom Shards | Patrols & fights night waves, upgrades player weapon |
| **Merchant** | Curio Shop (`x = +13`) | Any / Gloom Shards | Resource exchange, hats, modular decor & rare seeds |

Hanging out with a villager smoothly zooms the 3/4 camera into their open-front dollhouse room, advancing Bond levels and furnishing the cutaway room with physical props.

---

## 4. Visual & Technical Architecture
- **Rendering:** Babylon.js v9 (`@babylonjs/core`) with warm clay/wood stylized materials, subtle rim Fresnel shading by day, and a `GlowLayer` + warm interior `PointLight`s vs. neon-purple corruption emissives by night.
- **Physics & ECS:** Havok WASM (`@babylonjs/havok`) driving the 1D player capsule (`Z`-locked, zero angular inertia), road collision floor, and dynamic interactive physics props, paired with **bitECS v0.4 (`bitecs`)** Structure-of-Arrays typed buffers (`src/ecs/`) for zero-allocation interaction queries, hit wobbles, and mesh-pooled loot drops.
- **Modular 3D Assembly:** Declarative blueprints (`ModularBlueprint`) attach parts to named sockets (`root`, `torso`, `head`, `hat`, `hand_right`, `roof`, `interior_*`) through an IoC `IMeshPartProvider` interface:
  - `ProceduralPartProvider` (Milestone 1 kitbashed low-poly geometry)
  - `GltfPartProvider` (`@babylonjs/loaders` adapter for `.glb`/`.gltf` swaps with procedural fallback)
- **Mobile-Portrait-First Babylon.js 2D GUI:** Full-canvas `@babylonjs/gui` (`AdvancedDynamicTexture`) HUD with `>= 48px` touch targets, `100dvh`/`100dvw` viewport shell, plus full keyboard support (`A/D` or `←/→`, `Space`, `E`, `Shift`).

---

## 5. Milestones Roadmap
1. **Milestone 1 (Done):** 1D diorama island, Havok player capsule & bouncing road props, modular hero + 4 NPCs + 4 cutaway dollhouses, adaptive 3/4 camera with dollhouse zoom, Day/Night lighting + neon bloom preview, mobile-portrait HUD.
2. **Milestone 2 (Done):** Gathering from trees/rocks/wildflowers, bouncing pooled Havok pickups, planting flora to dynamically push corruption borders, scrubbing pollution mounds, reactive bitECS `observe` & zero-allocation `pipe` pipeline.
3. **Milestone 3 (Done):** bitECS `addPrefab` (`npcTag`) & `createRelation` (`HousedIn`) villager model, Hang-out beats, affinity gifting, Bond leveling (`Lv 1–3`), active town-wide perks, and live cutaway dollhouse room furnishing.
4. **Milestone 4 (Done):** Nighttime enemy wave director (`WaveCombatSystem`), modular turrets on defense plinths (`DefenseStructureSystem`), reactive `EnemyVisualSystem`, active player slingshot combat, Bram AI night patrol, Town Heart HP + restart loop, and 99.5% automated line coverage.
5. **Milestone 5 (Done):** Squash-and-stretch toybox juice on jumps/landings/spawns, procedural Web Audio chimes & Patapon-style night drums (`SoundEffectRig`), and HUD mute toggle.

---

## 6. Post-M5 Review Passes

### Gameplay Review Pass (Cosy Days · Fireworks Nights)
- **G1 (Done): Auto-Shoot Bow & Hundreds-of-Enemies Horde Engine**
  - Directional limited-range bow auto-shoot (`9.5` units ahead of hero facing) with knockback, parabolic arrows, fireworks, and hit-flash.
  - Escalating Day 1→Day 5 swarm curve (`28 → 70 → 140 → 240 → 400` enemies by Day 5) with fast **Gloom Rushers** alongside Sprites & Brutes across 5 road depth lanes.
  - GPU `ThinInstance` batched horde rendering + portrait combat zoom-out with decoupled smooth zoom damping.
- **G2 (Done): Dust Puffs, Road Prop Impacts, Auto-Jump Dodge, Lead Camera & Bram Town Center Spear**
  - Tactile dust puff bursts on footsteps, landings, crate collisions, and explosions; rolling road blocks knock back small swarms.
  - **Auto-Jump / Auto-Dodge:** Instead of manual platforming jumps, the hero automatically vaults/dodges over incoming enemies or hazard lunges on a skill-scaled cooldown (shortened by player/Bram NPC skills).
  - **Off-Center "Opposing Side" Camera & Default Zoom:** Shifts ahead in the hero's facing direction during both day and night so the player sits opposite targets, with unzoomed default portrait framing.
  - **Bram Town Center Defense:** Bram guards Town Center at constant linear walk speed with walk leg animation and a front-slide AoE spear sweep.
- **G3 (Done): Grid-Based Systems & Live Tuning Sheet & Monster-Driven Defenders**
  - Canonical grid unit `1 tile = 2.5m` (`gridToWorld` / `worldToGrid`) aligning house footprints (`~2 tiles`), defense plinths (`±8, ±11 tiles`), speeds (`tiles/s`), and combat ranges (`tiles`).
  - Live runtime `BalanceSheet` + toggleable **Balance Sheet Drawer** (`⚙` HUD button or `F2`/`~`) with sliders, CSV/JSON spreadsheet import/export, and thin-instanced 1-tile road ruler markers.
  - Monster-driven Defender AI: Bram (and defenders) patrol and fight whenever living enemies exist regardless of day/night solar phase, returning to porch rest only once all monsters are defeated.
- **G4 (Done): Dual-Choice Defense Plinths (Barricade vs Turret)**
  - Choose between high-HP stalling **Barricades** (Lv 2 **Thorns**, Lv 3 **Rune-Pulse Knockback & Dawn Auto-Heal**) and ranged **Turrets** (Lv 2 **Rapid Bolts**, Lv 3 **Smart Arcane Coil** with Brute-priority + AoE chain splash) on plinths (`±8`, `±11` tiles), with full tier visuals and salvage refunds.
- **G5 (In Progress — Pip Complete): Villager Mini-Shops**
  - **Pip's Engineering Workshop (Done):** Pip's Dollhouse Bond (`Lv 1 → Lv 3`) serves as his **Research Level**, unlocking Lv 2 Reinforced and Lv 3 Smart defense blueprints commissioned directly from his cutaway card while Pip physically walks out along the road to wrench-build plinths and autonomously repair damaged walls/turrets when safe.
  - Expand remaining 3 cutaway dollhouse interiors (**Sage** heals & flora buffs, **Bram** combat upgrades, **Milo** barter & loot charms) unlocked via Bond tiers.
- **G6: Frontier Gloom Mist Risk/Reward**
  - Gloom Mist drag past `leftBorderX`/`rightBorderX` countered by purifying blooms or Sage's tonic, rewarding deep frontier mining/shards.

### Assets Refinement Pass (A1–A7)
- **A1: Stylized Shaders & Surface Look-Dev** — Custom clay/wood half-Lambert + Fresnel rim lighting, animated teal water & shoreline foam waves, warm amber interior glow vs. neon-magenta corruption emissives, and depth-tinted sky/fog.
- **A2: Hero & Villager Silhouettes** — Chibi miniature proportions, expressive eyes/faces, oversized readable hats & role tools (Explorer bow/satchel, Pip goggles/wrench, Sage flower-hat/watering can, Bram helm/spear, Milo beret/coin pouch) tuned for 3/4 portrait readability.
- **A3: Gloom Monster Cast & Visual Telegraphing** — Distinct silhouettes for Gloom Sprite (floating wisp-imp), Rusher (hunched jagged sprinter), and Brute (hulking crystal-backed golem) with glowing neon-violet cracks, eyes, and crisp hit-flash reactions.
- **A4: Cutaway Dollhouses & Living Interiors** — Timber framing, pitched shingled roofs, warm glowing lanterns, window boxes, chimney smoke puffs, and progressive interior props unlocked via Bond tiers.
- **A5: Defense Structures & Tier Evolution (Lv 1 → Lv 3)** — Distinct visual progression for Barricades (timber → spiked stone bastion → glowing rune-pulse wall) and Turrets (wooden bolt tower → twin-spring stone tower → floating arcane crystal coil), plus visible damage states.
- **A6: Layered Island Background, Flora & Diorama Framing** — Parallax background islets, stylized low-poly clouds, shoreline rocks & seafoam edge, grass tufts, wind-swaying trees/blooms, and dramatic frontier corruption monoliths + mist wall.
- **A7: Optional `.glb` Swap Pipeline & Budget Verification** — Drop-in `.glb` models via `GltfPartProvider` with palette harmonizer, procedural fallback, and thin-instance/draw-call budget verification.

### Subsequent Polish Passes
- **Music & Audio Review Pass:** Dynamic day/night adaptive soundtrack layering and richer Patapon battle percussion.
- **Systems Review Pass:** Progression pacing, save/persistence, and performance telemetry.
- Enemies types and designs (propose and review)
- Larger world, ecosystems (propose and review) 
- Village shape (propose and review)
- The more there is purity and villagers happy, the more the enemies should be aggressive
- (propose and review) Weapons and fighters types
- Resource system: Fishing, Farming, more interactions (propose and review)
- Flower/purification system (propose and review)
- Animation systems (propose and review)
- Season system?
- Active ragdolls?