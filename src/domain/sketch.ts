/** Reference drawing attached to a project. Width/height are the stored image pixels. */
export type ProjectSketch = {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
};

export function isValidSketch(value: unknown): value is ProjectSketch {
  if (!value || typeof value !== 'object') return false;
  const sketch = value as ProjectSketch;
  return (
    typeof sketch.id === 'string' &&
    typeof sketch.dataUrl === 'string' &&
    sketch.dataUrl.startsWith('data:image/') &&
    Number.isFinite(sketch.width) && sketch.width > 0 &&
    Number.isFinite(sketch.height) && sketch.height > 0
  );
}

// Names that carry no meaning: Windows clipboard GUIDs, the browser's "image" for pasted files, empty or bare base names.
const GENERIC_SKETCH_NAME = /^(\{?[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\}?|image|clipboard|sketch|эскиз)?$/i;

export function isGenericSketchName(name: string) {
  return GENERIC_SKETCH_NAME.test(name.trim());
}

/** Next "<base> N" after the highest number already used, so names stay unique after deletions. */
export function nextSketchName(sketches: ProjectSketch[], base: string) {
  const prefix = `${base} `;
  const maxNumber = sketches.reduce((max, sketch) => {
    if (!sketch.name.startsWith(prefix)) return max;
    const number = Number(sketch.name.slice(prefix.length));
    return Number.isInteger(number) && number > max ? number : max;
  }, 0);
  return `${prefix}${maxNumber + 1}`;
}

/** Gives generic names ("image", clipboard GUIDs) sequential "<base> N" names, keeping meaningful ones. */
export function nameGenericSketches(sketches: ProjectSketch[], base: string) {
  return sketches.reduce<ProjectSketch[]>((named, sketch) => [
    ...named,
    isGenericSketchName(sketch.name) ? { ...sketch, name: nextSketchName([...named, ...sketches], base) } : sketch,
  ], []);
}

export function normalizeSketch(sketch: ProjectSketch): ProjectSketch {
  return {
    id: sketch.id,
    name: typeof sketch.name === 'string' ? sketch.name.trim() : '',
    dataUrl: sketch.dataUrl,
    width: sketch.width,
    height: sketch.height,
  };
}
