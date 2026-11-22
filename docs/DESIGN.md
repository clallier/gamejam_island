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
- **G3 (Current): Grid-Based Systems & Live Tuning Sheet (Propose & Review)**
  - Express world layout, entity footprints, movement speeds (`gridUnits/s`), and weapon ranges (`gridUnits`) in a canonical **Grid Unit** scale (`1 tile = 2.5` world units), backed by an editable runtime balance sheet for live tweaking while playing.
- **G4: Dual-Choice Defense Plinths (Barricade vs Turret)**
  - Choose between high-HP stalling **Barricades** and ranged **Turrets** on plinths (`±20`, `±26`) with visual damage/tier states.
- **G5: Villager Mini-Shops**
  - Expand all 4 cutaway dollhouse interiors into themed mini-shops (**Pip** engineering mods, **Sage** heals & flora buffs, **Bram** auto-shoot & combat upgrades, **Milo** barter & loot charms) unlocked via Bond tiers.
- **G6: Frontier Gloom Mist Risk/Reward**
  - Gloom Mist drag past `leftBorderX`/`rightBorderX` countered by purifying blooms or Sage's tonic, rewarding deep frontier mining/shards.

### Subsequent Polish Passes
- **Assets Review Pass:** Modular silhouette clarity, cutaway room props, and optional `.glb` swap pass.
- **Music & Audio Review Pass:** Dynamic day/night adaptive soundtrack layering and richer Patapon battle percussion.
- **Systems Review Pass:** Progression pacing, save/persistence, and performance telemetry.
- Grid based systems (propose and review)
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