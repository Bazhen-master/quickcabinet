import type { Part } from "../domain/part";

export type PartMapExport = {
  id: string;
  name: string;
  kind: string;
  size: {
    width: number;
    height: number;
    thickness: number;
  };
  position: {
    x: number;
    y: number;
    z: number;
  };
  operations: Array<{
    id: string;
    type: string;
    face?: string;
    x?: number;
    y?: number;
    diameter?: number;
    depth?: number;
    through?: boolean;
    meta?: Record<string, unknown>;
  }>;
};

export function saveSelectedPartMap(part: Part) {
  const data: PartMapExport = {
    id: part.id,
    name: part.name,
    kind: part.kind,
    size: {
      width: part.width,
      height: part.height,
      thickness: part.thickness,
    },
    position: {
      x: part.position.x,
      y: part.position.y,
      z: part.position.z,
    },
    operations: part.operations.map((op) => ({
      id: op.id,
      type: op.type,
      ...(op.type === "drill"
        ? {
            face: op.face,
            x: op.x,
            y: op.y,
            diameter: op.diameter,
            depth: op.depth,
            through: op.through,
          }
        : {}),
      meta: (op as { meta?: Record<string, unknown> }).meta,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const safeName =
    part.name
      .trim()
      .replace(/[^\wа-яё-]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "part";

  a.download = `${safeName}-map.json`;
  a.click();

  URL.revokeObjectURL(url);
}