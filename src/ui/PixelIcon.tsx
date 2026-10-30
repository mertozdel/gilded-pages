import type { ReactElement } from 'react';

/** Tiny pixel-art icons drawn as crisp SVG rects from string bitmaps. */
const COLORS: Record<string, string> = {
  g: '#E3C16F',
  G: '#F6E3A1',
  d: '#A8873F',
  n: '#141B2D',
  e: '#0F4D3A',
  j: '#2E8B6A',
  s: '#39FF8E',
  i: '#F2EDE4',
  r: '#C9787A',
  k: '#0B0B0F',
  a: '#8A8580',
  c: 'currentColor',
};

const ICONS = {
  coin: ['..ddddd..', '.dgggggd.', 'dgGGgggd.', 'dgGgdggdd', 'dgggdggdd', 'dggggggdd', '.dgggggd.', '..ddddd..'],
  lamp: ['.s..s..s.', '...sss...', '..ssiss..', '...sss...', '....g....', '....g....', '....g....', '...ggg...', '..ddddd..'],
  map: ['ii.ee.ii.', 'iiieeeiii', 'irieeeiii', 'iiieeeiri', 'iiieeeiii', 'ii.ee.ii.'],
  blouse: ['.ii...ii.', 'iiii.iiii', 'iiiiGiiii', '.iiiGiii.', '..iiGii..', '..iiiii..', '..iiiii..'],
  book: ['dggggggg', 'dgiiiiig', 'dgiaaaig', 'dgiiiiig', 'dgiaaaig', 'dgiiiiig', 'dggggggg'],
  ledger: ['.......g', '.....g.g', '.....g.g', '...g.g.g', '.g.g.g.g', '.g.g.g.g', 'dddddddd'],
  gear: ['...g.g...', '..ggggg..', '.ggdddgg.', 'ggd...dgg', '.gd...dg.', 'ggd...dgg', '.ggdddgg.', '..ggggg..', '...g.g...'],
  flag: ['dggg.', 'dgGgg', 'dggg.', 'd....', 'd....', 'd....', 'd....'],
  pearl: ['..iii..', '.iGiii.', 'iGiiiii', 'iiiiiia', '.iiiia.', '..aaa..'],
  search: ['.ccc....', 'c...c...', 'c...c...', 'c...c...', '.ccc....', '....cc..', '.....cc.', '......cc'],
  list: ['c.cccccc', '........', 'c.cccccc', '........', 'c.cccccc', '........', 'c.cccccc'],
  left: ['...c', '..cc', '.ccc', 'cccc', '.ccc', '..cc', '...c'],
  right: ['c...', 'cc..', 'ccc.', 'cccc', 'ccc.', 'cc..', 'c...'],
  close: ['c.....c', '.c...c.', '..c.c..', '...c...', '..c.c..', '.c...c.', 'c.....c'],
  moon: ['..ccc..', '.cc....', 'cc.....', 'cc.....', 'cc.....', '.cc....', '..ccc..'],
  upload: ['...c...', '..ccc..', '.c.c.c.', '...c...', '...c...', 'c..c..c', 'c.....c', 'ccccccc'],
  plus: ['...c...', '...c...', 'ccccccc', '...c...', '...c...'],
  minus: ['ccccccc'],
  help: ['.ccc.', 'c...c', '...c.', '..c..', '..c..', '.....', '..c..'],
  home: ['....g....', '...ggg...', '..ggGgg..', '.ggggggg.', 'gdgdgdgdg', '.gigigig.', '.gigigig.', '.gigigig.', 'ddddddddd'],
  trash: ['.cccc.', 'cccccc', '.c..c.', '.c..c.', '.c..c.', '.cccc.'],
  sparkle: ['...g...', '...g...', '..gGg..', 'ggGGGgg', '..gGg..', '...g...', '...g...'],
  note: ['...gggg', '...gddg', '...g..g', '...g..g', '.ggg.gg', 'gGgggGg', '.gg..g.'],
  more: ['cc..cc..cc', 'cc..cc..cc'],
  swap: ['..c.....', '.cc.....', 'cccccccc', '.cc.....', '..c..c..', '.....cc.', 'cccccccc', '.....cc.', '.....c..'],
  cup: ['.i.i.i...', '..i.i....', 'ggggggg..', 'giiiiigdd', 'giaaaig.d', 'giiiiigdd', '.ggggg...', 'ddddddd..'],
  star: ['....g....', '...gGg...', 'ggggGgggg', '.gGGGGGg.', '..gGGGg..', '.ggg.ggg.', 'gg.....gg'],
} as const;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  /** CSS pixels per icon pixel. */
  scale?: number;
  className?: string;
  title?: string;
}

export function PixelIcon({ name, scale = 2, className, title }: Props) {
  const rows = ICONS[name];
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const rects: ReactElement[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === ch) run++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={COLORS[ch] ?? 'currentColor'} />);
      x += run;
    }
  });
  return (
    <svg
      className={`pixel-icon ${className ?? ''}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {rects}
    </svg>
  );
}
