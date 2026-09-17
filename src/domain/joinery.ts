export type JoineryType = 'none' | 'confirmat' | 'confirmat-dowel' | 'minifix-dowel' | 'shelf_pin' | 'rafix';

export type SideJoinery = {
  left: JoineryType;
  right: JoineryType;
  top: JoineryType;
  bottom: JoineryType;
  back: JoineryType;
};

export function createEmptySideJoinery(): SideJoinery {
  return { left: 'none', right: 'none', top: 'none', bottom: 'none', back: 'none' };
}
