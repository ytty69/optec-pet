import { Container, Graphics } from 'pixi.js';
import type { Animal } from './state';

/**
 * Pixel-art palette per animal. Every sprite is drawn on an integer grid and
 * only the container is scaled — this keeps the look crisp with nearest-neighbor
 * scaling. If you later swap in real Aseprite PNGs, drop them under
 * `public/assets/sprites/<animal>.png` and add a loader that returns an
 * AnimatedSprite instead of these Graphics.
 */
interface Palette {
  body: number;
  shade: number;
  highlight: number;
  accent: number;
  eye: number;
  belly: number;
  blush: number;
  outline: number;
  // Distinct dark color for "point" markings — Siamese cat's mask/ears/paws,
  // or the dog's darker snout tips. For animals without markings, set to shade.
  mark: number;
}

const PALETTES: Record<Animal, Palette> = {
  cat: {
    // Siamese: cream body with dark brown points and blue eyes.
    body: 0xe8d4a8,
    shade: 0xc4a883,
    highlight: 0xfff0d8,
    accent: 0xff8a9c,
    eye: 0x3a90d8,      // blue
    belly: 0xfff8ec,
    blush: 0xffb4b8,
    outline: 0x2a1808,
    mark: 0x4a2f18,
  },
  dog: {
    body: 0xa87144,
    shade: 0x6f4523,
    highlight: 0xc7935d,
    accent: 0xff8fa8,
    eye: 0x1c0f06,
    belly: 0xf1d4b2,
    blush: 0xffb0b8,
    outline: 0x3a2010,
    mark: 0x6f4523,
  },
  rabbit: {
    body: 0xf1e6dc,
    shade: 0xc7b7a8,
    highlight: 0xffffff,
    accent: 0xff8fa8,
    eye: 0x3a1e26,
    belly: 0xffe4d6,
    blush: 0xffb0c4,
    outline: 0x6a5040,
    mark: 0xc7b7a8,
  },
};

export const ANIMAL_LABELS: Record<Animal, string> = {
  cat: '小咪',
  dog: '小豆',
  rabbit: '小雪',
};

/**
 * Draws one animal sprite at integer scale (default 3). Origin is the feet
 * center, so callers can place it at `y = ground` directly.
 *
 * The container exposes these labeled children for animation:
 *  - `body`   — vertical breathing scale target
 *  - `legs`   — bounce during walk
 *  - `tail`   — rotate to wag
 *  - `earL`, `earR` — rotate to twitch (cat/rabbit)
 */
export function createAnimalSprite(animal: Animal, scale = 3): Container {
  const c = new Container();
  c.scale.set(scale);
  switch (animal) {
    case 'cat':    drawCat(c, PALETTES.cat); break;
    case 'dog':    drawDog(c, PALETTES.dog); break;
    case 'rabbit': drawRabbit(c, PALETTES.rabbit); break;
  }
  return c;
}

// ------------------------------ cat ------------------------------

function drawCat(root: Container, p: Palette) {
  // Grid ~18 wide, origin at feet-center. Y grows downward. Every filled
  // shape gets a 1px darker outline underneath for silhouette pop.

  // Tail on the LEFT side, mirrored — so when the pet faces right (default),
  // the tail trails behind it, not in the direction of travel.
  // Siamese-dark tail on the LEFT.
  const tail = new Container();
  tail.label = 'tail';
  tail.x = -7; tail.y = -4;
  tail.scale.x = -1;
  tail.addChild(
    new Graphics()
      .rect(-1, -1, 4, 4).fill(p.outline)
      .rect(0, 0, 2, 2).fill(p.mark)
      .rect(1, -2, 3, 3).fill(p.outline)
      .rect(1, -2, 2, 2).fill(p.mark)
      .rect(2, -4, 3, 3).fill(p.outline)
      .rect(2, -4, 2, 2).fill(p.mark)
      .rect(3, -6, 3, 3).fill(p.outline)
      .rect(3, -6, 2, 2).fill(p.outline), // tip darker
  );
  root.addChild(tail);

  const body = new Container();
  body.label = 'body';
  body.addChild(
    new Graphics()
      // outline silhouette — cream body, no stripes for Siamese
      .rect(-9, -6, 18, 10).fill(p.outline)
      .rect(-8, -5, 16, 8).fill(p.body)
      .rect(-6, -5, 12, 1).fill(p.highlight)
      // side shade
      .rect(-8, -2, 1, 4).fill(p.shade)
      .rect(7, -2, 1, 4).fill(p.shade)
      // belly patch
      .rect(-5, 0, 10, 3).fill(p.belly)
      .rect(-4, -1, 8, 1).fill(p.belly),
  );
  root.addChild(body);

  const head = new Container();
  head.x = 0; head.y = -7;

  head.addChild(
    new Graphics()
      // skull outline
      .rect(-8, -8, 16, 11).fill(p.outline)
      .rect(-7, -7, 14, 10).fill(p.body)
      .rect(-5, -7, 10, 1).fill(p.highlight)
      // Siamese face mask — dark points around eyes/snout
      .rect(-5, -4, 10, 5).fill(p.mark)
      .rect(-4, -5, 8, 1).fill(p.mark)
      .rect(-6, -3, 1, 3).fill(p.mark)
      .rect(5, -3, 1, 3).fill(p.mark)
      // muzzle bulge (cream) around the nose/mouth so face isn't all dark
      .rect(-3, 1, 6, 2).fill(p.body)
      .rect(-2, 3, 4, 1).fill(p.body),
  );

  // Ears — fully dark brown (Siamese point). Optional pink inner tip.
  const earL = new Container();
  earL.label = 'earL';
  earL.x = -5; earL.y = -7;
  earL.addChild(
    new Graphics()
      .poly([-4, 1, 0, -7, 4, 1]).fill(p.outline)
      .poly([-3, 0, 0, -6, 3, 0]).fill(p.mark)
      .poly([-1, 0, 0, -3, 1, 0]).fill(p.accent),
  );
  head.addChild(earL);

  const earR = new Container();
  earR.label = 'earR';
  earR.x = 5; earR.y = -7;
  earR.addChild(
    new Graphics()
      .poly([-4, 1, 0, -7, 4, 1]).fill(p.outline)
      .poly([-3, 0, 0, -6, 3, 0]).fill(p.mark)
      .poly([-1, 0, 0, -3, 1, 0]).fill(p.accent),
  );
  head.addChild(earR);

  // Face — Siamese blue eyes, small nose, tongue peek
  head.addChild(
    new Graphics()
      // eyes — blue with white catchlight
      .rect(-4, -3, 3, 3).fill(p.eye)
      .rect(-4, -3, 1, 1).fill(0xffffff)
      .rect(-2, -2, 1, 1).fill(0x1a4a80) // pupil
      .rect(1, -3, 3, 3).fill(p.eye)
      .rect(1, -3, 1, 1).fill(0xffffff)
      .rect(3, -2, 1, 1).fill(0x1a4a80)
      // small triangular pink nose on the muzzle
      .rect(-1, 1, 2, 1).fill(p.accent)
      .rect(0, 2, 1, 1).fill(p.accent)
      // blush
      .rect(-6, 0, 1, 1).fill(p.blush)
      .rect(5, 0, 1, 1).fill(p.blush),
  );

  head.addChild(
    new Graphics()
      // whiskers — thicker, 3 pairs
      .rect(-10, 0, 3, 1).fill(p.highlight)
      .rect(-10, 2, 3, 1).fill(p.highlight)
      .rect(7, 0, 3, 1).fill(p.highlight)
      .rect(7, 2, 3, 1).fill(p.highlight),
  );

  root.addChild(head);

  const legs = new Container();
  legs.label = 'legs';
  legs.addChild(
    new Graphics()
      // left leg — dark brown (Siamese paws)
      .rect(-6, 5, 5, 4).fill(p.outline)
      .rect(-5, 5, 3, 3).fill(p.mark)
      .rect(-5, 7, 3, 1).fill(p.outline)
      // right leg
      .rect(1, 5, 5, 4).fill(p.outline)
      .rect(2, 5, 3, 3).fill(p.mark)
      .rect(2, 7, 3, 1).fill(p.outline),
  );
  root.addChild(legs);
}

// ------------------------------ dog ------------------------------

function drawDog(root: Container, p: Palette) {
  // Tail on the LEFT, mirrored — trails behind when the dog faces right.
  const tail = new Container();
  tail.label = 'tail';
  tail.x = -7; tail.y = -6;
  tail.scale.x = -1;
  tail.addChild(
    new Graphics()
      // curled outline
      .rect(-1, -1, 5, 4).fill(p.outline)
      .rect(1, -3, 4, 3).fill(p.outline)
      .rect(2, -5, 4, 4).fill(p.outline)
      // fill
      .rect(0, 0, 2, 2).fill(p.body)
      .rect(2, -1, 2, 2).fill(p.body)
      .rect(1, -3, 3, 2).fill(p.body)
      .rect(3, -4, 2, 2).fill(p.highlight),
  );
  root.addChild(tail);

  const body = new Container();
  body.label = 'body';
  body.addChild(
    new Graphics()
      .rect(-9, -6, 18, 10).fill(p.outline)
      .rect(-8, -5, 16, 8).fill(p.body)
      .rect(-6, -5, 12, 1).fill(p.highlight)
      .rect(-8, -2, 1, 4).fill(p.shade)
      .rect(7, -2, 1, 4).fill(p.shade)
      // belly patch
      .rect(-5, 0, 10, 3).fill(p.belly)
      .rect(-4, -1, 8, 1).fill(p.belly),
  );
  root.addChild(body);

  // Head — snout biased toward the direction of travel. Default facing is
  // right (scale.x=+1); the whole sprite is flipped by the caller when
  // walking left, so the snout follows automatically.
  const head = new Container();
  head.x = 1; head.y = -7;
  head.addChild(
    new Graphics()
      // skull outline
      .rect(-8, -8, 16, 11).fill(p.outline)
      // skull
      .rect(-7, -7, 14, 10).fill(p.body)
      .rect(-5, -7, 10, 1).fill(p.highlight)
      // cheek shade
      .rect(-7, 1, 14, 2).fill(p.shade),
  );

  head.addChild(
    new Graphics()
      // snout leans right — nose sticks out in the travel direction
      .rect(-3, -1, 9, 4).fill(p.outline)
      .rect(-2, 0, 7, 3).fill(p.belly)
      .rect(-1, 0, 6, 1).fill(p.highlight)
      // nose at the tip
      .rect(3, 0, 3, 1).fill(p.eye)
      .rect(5, 0, 1, 1).fill(p.outline)
      // mouth line under snout
      .rect(0, 3, 4, 1).fill(p.outline),
  );

  const earL = new Container();
  earL.label = 'earL';
  earL.x = -6; earL.y = -6;
  earL.addChild(
    new Graphics()
      .rect(-3, -1, 4, 8).fill(p.outline)
      .rect(-2, 0, 2, 6).fill(p.shade)
      .rect(-2, 6, 2, 1).fill(p.outline),
  );
  head.addChild(earL);

  const earR = new Container();
  earR.label = 'earR';
  earR.x = 6; earR.y = -6;
  earR.addChild(
    new Graphics()
      .rect(-1, -1, 4, 8).fill(p.outline)
      .rect(0, 0, 2, 6).fill(p.shade)
      .rect(0, 6, 2, 1).fill(p.outline),
  );
  head.addChild(earR);

  head.addChild(
    new Graphics()
      // eyes
      .rect(-4, -3, 2, 3).fill(p.eye)
      .rect(-4, -3, 1, 1).fill(0xffffff)
      .rect(1, -3, 2, 3).fill(p.eye)
      .rect(1, -3, 1, 1).fill(0xffffff)
      // eyebrows
      .rect(-5, -5, 3, 1).fill(p.shade)
      .rect(1, -5, 3, 1).fill(p.shade)
      // blush
      .rect(-6, 0, 1, 1).fill(p.blush)
      .rect(5, 0, 1, 1).fill(p.blush),
  );

  root.addChild(head);

  const legs = new Container();
  legs.label = 'legs';
  legs.addChild(
    new Graphics()
      .rect(-6, 5, 5, 4).fill(p.outline)
      .rect(-5, 5, 3, 3).fill(p.shade)
      .rect(-5, 7, 3, 1).fill(p.outline)
      .rect(1, 5, 5, 4).fill(p.outline)
      .rect(2, 5, 3, 3).fill(p.shade)
      .rect(2, 7, 3, 1).fill(p.outline),
  );
  root.addChild(legs);
}

// ------------------------------ rabbit ------------------------------

function drawRabbit(root: Container, p: Palette) {
  // Fluffy tail on the LEFT side — behind the rabbit when it hops right.
  const tail = new Container();
  tail.label = 'tail';
  tail.x = -8; tail.y = -3;
  tail.addChild(
    new Graphics()
      .circle(0, 0, 4).fill(p.outline)
      .circle(0, 0, 3).fill(p.belly)
      .circle(1, -1, 1).fill(p.highlight),
  );
  root.addChild(tail);

  const body = new Container();
  body.label = 'body';
  body.addChild(
    new Graphics()
      .rect(-9, -6, 18, 10).fill(p.outline)
      .rect(-8, -5, 16, 8).fill(p.body)
      .rect(-6, -5, 12, 1).fill(p.highlight)
      .rect(-8, -2, 1, 4).fill(p.shade)
      .rect(7, -2, 1, 4).fill(p.shade)
      // belly patch (creamy)
      .rect(-5, 0, 10, 3).fill(p.belly)
      .rect(-4, -1, 8, 1).fill(p.belly),
  );
  root.addChild(body);

  // Head — leans toward the direction of travel (right by default). The
  // ears/eyes/nose all shift a pixel or two rightward so the profile reads.
  const head = new Container();
  head.x = 1; head.y = -7;

  head.addChild(
    new Graphics()
      // skull outline
      .rect(-7, -7, 14, 10).fill(p.outline)
      // skull
      .rect(-6, -6, 12, 9).fill(p.body)
      .rect(-4, -6, 8, 1).fill(p.highlight)
      // cheek shade
      .rect(-6, 1, 12, 2).fill(p.shade),
  );

  // Long upright ears — both shifted a pixel to the right too.
  const earL = new Container();
  earL.label = 'earL';
  earL.x = -2; earL.y = -6;
  earL.addChild(
    new Graphics()
      .rect(-2, -10, 4, 11).fill(p.outline)
      .rect(-1, -9, 2, 9).fill(p.body)
      .rect(0, -8, 1, 7).fill(p.accent),
  );
  head.addChild(earL);

  const earR = new Container();
  earR.label = 'earR';
  earR.x = 4; earR.y = -6;
  earR.addChild(
    new Graphics()
      .rect(-2, -10, 4, 11).fill(p.outline)
      .rect(-1, -9, 2, 9).fill(p.body)
      .rect(0, -8, 1, 7).fill(p.accent),
  );
  head.addChild(earR);

  head.addChild(
    new Graphics()
      // eyes — both shifted rightward to bias the gaze forward
      .rect(-3, -3, 2, 3).fill(p.eye)
      .rect(-3, -3, 1, 1).fill(0xffffff)
      .rect(3, -3, 2, 3).fill(p.eye)
      .rect(3, -3, 1, 1).fill(0xffffff)
      // nose (Y shape) — pushed toward the direction of travel
      .rect(0, 0, 2, 1).fill(p.accent)
      .rect(1, 1, 1, 1).fill(p.accent)
      // mouth
      .rect(0, 2, 1, 1).fill(p.outline)
      .rect(2, 2, 1, 1).fill(p.outline)
      // blush
      .rect(-5, 0, 1, 1).fill(p.blush)
      .rect(4, 0, 1, 1).fill(p.blush),
  );

  root.addChild(head);

  // Strong hind legs
  const legs = new Container();
  legs.label = 'legs';
  legs.addChild(
    new Graphics()
      // front-left foot (stubby)
      .rect(-6, 5, 5, 4).fill(p.outline)
      .rect(-5, 5, 3, 3).fill(p.shade)
      .rect(-5, 7, 3, 1).fill(p.outline)
      // hind-right foot (still bigger)
      .rect(1, 4, 7, 5).fill(p.outline)
      .rect(2, 4, 5, 4).fill(p.shade)
      .rect(2, 7, 5, 1).fill(p.outline),
  );
  root.addChild(legs);
}

// ------------------------------ adopter ------------------------------

/**
 * A pixel-style adopter — Optec's "you" character. Kept simple and readable
 * so it doesn't compete visually with the animals during the ceremony.
 */
export function createAdopterSprite(scale = 3): Container {
  const c = new Container();
  c.scale.set(scale);

  const skin = 0xf5c9a0;
  const shirt = 0x4a90e2;
  const shirtShade = 0x2f6bb0;
  const pants = 0x2c3e50;
  const pantsShade = 0x1a2938;
  const hair = 0x2b1b0e;
  const eye = 0x1a0f06;

  // Body / shirt
  const body = new Graphics()
    .rect(-5, -6, 10, 8).fill(shirt)
    .rect(-5, -6, 10, 1).fill(shirtShade)
    .rect(-5, 1, 10, 1).fill(shirtShade)
    // collar
    .rect(-2, -6, 4, 1).fill(0xffffff)
    // button strip
    .rect(0, -5, 1, 6).fill(shirtShade);

  // Head
  const head = new Graphics()
    .rect(-4, -14, 8, 8).fill(skin)
    .rect(-4, -14, 8, 1).fill(0xd9a97b);

  // Hair
  const hairCap = new Graphics()
    .rect(-5, -15, 10, 3).fill(hair)
    .rect(-5, -12, 1, 2).fill(hair)
    .rect(4, -12, 1, 2).fill(hair);

  // Face
  const face = new Graphics()
    .rect(-2, -10, 1, 1).fill(eye)
    .rect(1, -10, 1, 1).fill(eye)
    .rect(0, -8, 1, 1).fill(0xff9088) // small smile
    .rect(-3, -9, 1, 1).fill(0xffb0b8) // blush
    .rect(2, -9, 1, 1).fill(0xffb0b8);

  // Arms
  const arms = new Graphics()
    .rect(-7, -5, 2, 6).fill(shirt)
    .rect(-7, -5, 2, 1).fill(shirtShade)
    .rect(5, -5, 2, 6).fill(shirt)
    .rect(5, -5, 2, 1).fill(shirtShade);

  const legs = new Container();
  legs.label = 'legs';
  legs.addChild(
    new Graphics()
      .rect(-4, 2, 3, 6).fill(pants)
      .rect(-4, 7, 3, 1).fill(pantsShade)
      .rect(1, 2, 3, 6).fill(pants)
      .rect(1, 7, 3, 1).fill(pantsShade),
  );

  c.addChild(body, head, hairCap, face, arms, legs);
  return c;
}

// ------------------------------ zoo sign ------------------------------

/**
 * A wooden torii-ish zoo entrance. Origin is bottom-center of the base.
 */
export function createZooSign(): Container {
  const c = new Container();
  c.scale.set(3);

  const wood = 0x8b5a2b;
  const woodShade = 0x5a3a1c;
  const woodHi = 0xa87144;
  const board = 0xffe9a8;
  const boardShade = 0xd4a942;
  const ink = 0x3a2410;

  // Pillars
  const pillars = new Graphics()
    .rect(-24, -32, 6, 32).fill(wood)
    .rect(-24, -32, 1, 32).fill(woodHi)
    .rect(-19, -32, 1, 32).fill(woodShade)
    .rect(18, -32, 6, 32).fill(wood)
    .rect(18, -32, 1, 32).fill(woodHi)
    .rect(23, -32, 1, 32).fill(woodShade);

  // Top crossbeam
  const top = new Graphics()
    .rect(-28, -42, 56, 4).fill(wood)
    .rect(-28, -42, 56, 1).fill(woodHi)
    .rect(-28, -39, 56, 1).fill(woodShade)
    // tips of the beam
    .rect(-30, -41, 2, 2).fill(woodShade)
    .rect(28, -41, 2, 2).fill(woodShade);

  // Signboard hanging below the crossbeam
  const boardG = new Graphics()
    .rect(-20, -36, 40, 8).fill(board)
    .rect(-20, -36, 40, 1).fill(boardShade)
    .rect(-20, -29, 40, 1).fill(boardShade)
    .rect(-20, -36, 1, 8).fill(boardShade)
    .rect(19, -36, 1, 8).fill(boardShade);

  // Faux glyphs — three character-like shapes suggesting 動物園
  const glyphs = new Graphics()
    // char 1
    .rect(-15, -34, 4, 4).fill(ink)
    .rect(-14, -33, 2, 2).fill(board)
    // char 2
    .rect(-6, -34, 4, 4).fill(ink)
    .rect(-5, -33, 2, 1).fill(board)
    .rect(-5, -32, 2, 1).fill(board)
    // char 3
    .rect(3, -34, 4, 4).fill(ink)
    .rect(4, -33, 2, 2).fill(board);

  // Little lanterns
  const lantern = new Graphics()
    .rect(-27, -30, 4, 5).fill(0xff5a5a)
    .rect(-27, -30, 4, 1).fill(0xd93636)
    .rect(-27, -26, 4, 1).fill(0xd93636)
    .rect(23, -30, 4, 5).fill(0xff5a5a)
    .rect(23, -30, 4, 1).fill(0xd93636)
    .rect(23, -26, 4, 1).fill(0xd93636);

  c.addChild(pillars, top, boardG, glyphs, lantern);
  return c;
}
