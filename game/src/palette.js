// The look plan, in one place. Dusk freight yard: cold blue-grey steel, warm amber
// hazard light, teal for the defending team. The same names are the CSS custom
// properties in index.html, so the page and the scene share one palette.
export const PALETTE = {
  canvas: '#0e1218',
  surface: '#181d24',
  hairline: '#2b323c',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  danger: '#e5484d',
  attack: '#f0a830',
  defend: '#35c4b5',
  sky: '#27364a',
  ground: '#232830',
};

export function shade(name) {
  return PALETTE[name];
}
