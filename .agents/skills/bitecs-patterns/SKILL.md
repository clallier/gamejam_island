---
name: bitecs-patterns
description: How Hearthline structures bitECS v0.4 worlds, SoA typed arrays, reactive observe(onAdd/onRemove) hooks, zero-allocation pipe pipelines, and Babylon/Havok mesh pooling. Use when adding or modifying ECS components, systems, observers, prefabs, relations, or simulation frame pipelines.
---

# bitECS v0.4 Patterns in Hearthline

Hearthline uses **`bitecs` `0.4.x`** (Data-Oriented Structure-of-Arrays ECS) paired with **Babylon.js + Havok Physics v2**.
Follow these patterns whenever adding components, reactive observers, simulation stages, NPC relations, or pooled Babylon/Havok entities.

## 1. World, Fixed-Capacity SoA Components & String Bridge

Allocate typed-array SoA stores once at startup sized to `MAX_ENTITIES` (`2048` in `src/ecs/constants.ts`) so hot loops never allocate garbage:

```ts
import { createWorld } from 'bitecs';

const MAX_ENTITIES = 2048;
const world = createWorld();
const Position = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
  z: new Float32Array(MAX_ENTITIES),
};
```

- Store only blittable scalars or enum codes (`Uint8Array`, `Uint16Array`, `Float32Array`) inside SoA components.
- Keep Babylon `Mesh` / `TransformNode` / Havok `PhysicsAggregate` references in side maps keyed by numeric `eid` (e.g., `Map<number, ActiveDropBinding>`), never inside SoA stores.
- Use numeric entity IDs directly for transient high-churn entities (loot drops, projectiles, enemies) and bidirectional `Map<string, number>` / `Map<number, string>` only for named static landmarks (dollhouses, resource nodes, corruption mounds).

## 2. Reactive `observe(world, onAdd(...), cb)` and `observe(world, onRemove(...), cb)`

`observe` lets systems stay decoupled and event-driven instead of manually syncing add/remove lifecycles across modules.

### Critical Ordering Rules

1. **Write SoA fields *before* calling `addComponent` when `onAdd` reads initial values.**
   `onAdd` fires synchronously inside `addComponent(...)`. Writing `Position.x[eid] = x` *after* `addComponent` means `onAdd` observers see `0`!
   ```ts
   Position.x[eid] = x;
   Position.y[eid] = y;
   LootDrop.resourceCode[eid] = RESOURCE_TO_CODE[resource];
   LootDrop.age[eid] = 0;
   LootDrop.state[eid] = LOOT_STATE.FALLING;
   addComponent(world, eid, Position);
   addComponent(world, eid, LootDrop);
   ```
2. **Keep ID lookups intact until *after* `removeEntity` finishes.**
   `removeEntity(world, eid)` triggers `onRemove` observers *before* clearing masks/recycling the ID. Delete string-to-eid map entries *after* `removeEntity(world, eid)` so `onRemove` hooks (like wobble reset) can still resolve `getStringId(eid)`.
3. **Always collect IDs before mutating inside `query()` loops.**
   Never call `removeComponent` or `removeEntity` directly inside `for (const eid of query(world, [...]))`. Push targets into a pre-allocated scratch array (`finishedWobbles.push(eid)`) and remove after the loop finishes.
4. **Always store and call the unsubscribe handle.**
   `observe(...)` returns `() => void`. Unsubscribe inside your system's `dispose()` method.

## 3. Zero-Allocation Frame Pipelines with `pipe(...)`

Use `pipe` from `'bitecs'` to compose deterministic frame systems without per-frame object allocations:

```ts
import { pipe } from 'bitecs';

export interface SimulationFrameContext {
  dt: number;
  elapsedSeconds: number;
  playerX: number;
  target: InteractionTarget | null;
  collectedLoot: Partial<Record<ResourceKey, number>>;
}

const runFrame = pipe(stepLoot, resolveTarget, updateEnvironment);
```

- Mutate a single pre-allocated `SimulationFrameContext` object in place rather than returning `{ ...ctx }` copies at 60 FPS.
- Clear `collectedLoot` keys (or mutate in place) instead of allocating fresh summary maps every frame when integrating directly inside the hot path.
- Keep pipeline stages focused and testable in isolation by accepting narrow dependencies (e.g., `resolveTarget`, `stepLoot`, `updateEnvironment`).

## 4. Prefabs (`addPrefab` + `IsA`) and Relations (`createRelation`, `withAutoRemoveSubject`) for Milestone 3+

Use bitECS v0.4 prefabs and relations as Hearthline expands into NPC companions, turrets, and combat:

- **Prefabs & Inheritance (`addPrefab`, `IsA`)**: Share static archetype traits across buildings, NPCs, or enemies cleanly without duplicating SoA arrays.
- **Relations (`createRelation`, `withAutoRemoveSubject`)**: Model relationships cleanly:
  - `Targeting = createRelation(withAutoRemoveSubject)`: when an enemy entity is removed, any turret targeting it automatically loses that relation.
  - `BondWith = createRelation()` / `HousedIn = createRelation()`: track villager assignments to dollhouses and heart affinity.

## 5. Babylon.js + Havok Physics Pooling Pitfalls

When pairing recycled bitECS `eid`s with pooled Babylon `Mesh` objects and Havok `PhysicsAggregate`s:

- Inside the `onRemove([LootDrop], ...)` callback:
  1. `binding.aggregate.dispose()`
  2. `binding.mesh.setEnabled(false)`
  3. Push mesh back to `meshPools[resource]`
  4. Remove `eid` from active lookup maps/arrays
- When spawning onto a pooled `Mesh` again:
  - Set `mesh.rotationQuaternion = null` before setting `mesh.rotation` or constructing a new `PhysicsAggregate` (Havok sets `rotationQuaternion`, which silently overrides Euler `.rotation` if not cleared).
  - Re-enable the mesh with `mesh.setEnabled(true)` before creating the new `PhysicsAggregate`.
