import { describe, expect, it } from 'vitest';
import { BlueprintRegistry } from '../../src/assets/BlueprintRegistry.ts';
import type { NpcRoleId } from '../../src/world/constants.ts';

describe('BlueprintRegistry', () => {
  it('provides valid modular blueprints for hero and all four NPC roles', () => {
    const registry = new BlueprintRegistry();
    const hero = registry.getHeroBlueprint();
    expect(hero.attachments.length).toBeGreaterThanOrEqual(4);
    expect(hero.sockets).toContain('hat');
    expect(hero.sockets).toContain('hand_right');

    const roles: NpcRoleId[] = ['engineer', 'medic', 'defender', 'merchant'];
    for (const role of roles) {
      const npc = registry.getNpcBlueprint(role);
      const house = registry.getDollhouseBlueprint(role);
      expect(npc.attachments.every((a) => npc.sockets.includes(a.socket))).toBe(true);
      expect(house.attachments.every((a) => house.sockets.includes(a.socket))).toBe(true);
      expect(house.roleId).toBe(role);
    }
  });

  it('provides world prop blueprints with valid root attachments', () => {
    const registry = new BlueprintRegistry();
    const kinds = ['shrine', 'tree_pine', 'tree_broadleaf', 'boulder', 'mound', 'portal'] as const;
    for (const kind of kinds) {
      const prop = registry.getPropBlueprint(kind);
      expect(prop.attachments).toHaveLength(1);
      expect(prop.attachments[0]?.socket).toBe('root');
    }
  });
});
