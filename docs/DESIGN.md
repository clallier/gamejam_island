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
1. **Milestone 1 (Current):** 1D diorama island, Havok player capsule & bouncing road props, modular hero + 4 NPCs + 4 cutaway dollhouses, adaptive 3/4 camera with dollhouse zoom, Day/Night lighting + neon bloom preview, mobile-portrait HUD.
2. **Milestone 2:** Gathering from trees/rocks, bouncing physics resource pickups, planting flora to dynamically push corruption borders, scrubbing pollution mounds.
3. **Milestone 3:** Full NPC Hang-out mini-beats, Bond leveling, active perk unlocks, live cutaway room furnishing.
4. **Milestone 4:** Nighttime enemy wave director, placeable modular turrets/barricades, active player slingshot/mallet combat, Defender AI ally, dawn/game-over loop.
5. **Milestone 5:** Squash-and-stretch juice, Web Audio chimes & drums, difficulty tuning, `.glb` asset swap pass.
