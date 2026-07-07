import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, Ticker } from 'pixi.js';
import {
  ANIMAL_LABELS,
  createAdopterSprite,
  createAnimalSprite,
} from './sprites';
import { usePetStore, type Animal, type Phase } from './state';
import { dlog } from './debug';

const STAGE_W = 800;
const STAGE_H = 360;
// Overall render scale for the whole adoption stage. Change this to shrink
// the entire scene (bg, animal, dialog panel, arrows) uniformly — no need to
// tweak individual coordinates.
const STAGE_SCALE = 0.75;

const ASSET_BASE = import.meta.env.BASE_URL;
const ZOO_BG_URL = ASSET_BASE + 'assets/zoo-scene.png';
const VISITOR_URL = ASSET_BASE + 'assets/visitor.png';
const KEEPER_URL = ASSET_BASE + 'assets/keeper.png';
const PICKING_BG_URL = ASSET_BASE + 'assets/picking-bg.jpeg';

// Force nearest-neighbor sampling so both PNGs keep crisp pixel edges when
// scaled — linear filtering makes the assets look smoothed / insertion-painted
// against the dense pixel-art background.
function pixelate(tex: Texture): Texture {
  tex.source.scaleMode = 'nearest';
  return tex;
}

let zooBgTexture: Texture | null = null;
let zooBgPromise: Promise<Texture> | null = null;
function loadZooBg(): Promise<Texture> {
  if (zooBgTexture) return Promise.resolve(zooBgTexture);
  if (!zooBgPromise) {
    zooBgPromise = Assets.load<Texture>(ZOO_BG_URL).then((tex) => {
      zooBgTexture = pixelate(tex);
      return zooBgTexture;
    });
  }
  return zooBgPromise;
}

let visitorTexture: Texture | null = null;
let visitorPromise: Promise<Texture> | null = null;
function loadVisitor(): Promise<Texture> {
  if (visitorTexture) return Promise.resolve(visitorTexture);
  if (!visitorPromise) {
    visitorPromise = Assets.load<Texture>(VISITOR_URL).then((tex) => {
      visitorTexture = pixelate(tex);
      return visitorTexture;
    });
  }
  return visitorPromise;
}

let keeperTexture: Texture | null = null;
let keeperPromise: Promise<Texture> | null = null;
function loadKeeper(): Promise<Texture> {
  if (keeperTexture) return Promise.resolve(keeperTexture);
  if (!keeperPromise) {
    keeperPromise = Assets.load<Texture>(KEEPER_URL).then((tex) => {
      keeperTexture = pixelate(tex);
      return keeperTexture;
    });
  }
  return keeperPromise;
}

let pickingBgTexture: Texture | null = null;
let pickingBgPromise: Promise<Texture> | null = null;
function loadPickingBg(): Promise<Texture> {
  if (pickingBgTexture) return Promise.resolve(pickingBgTexture);
  if (!pickingBgPromise) {
    pickingBgPromise = Assets.load<Texture>(PICKING_BG_URL).then((tex) => {
      pickingBgTexture = pixelate(tex);
      return pickingBgTexture;
    });
  }
  return pickingBgPromise;
}

interface ActiveScene {
  container: Container;
  timeouts: ReturnType<typeof setTimeout>[];
  tickers: ((t: Ticker) => void)[];
  unsubs: (() => void)[];
}

interface AdoptionController {
  root: Container;
  layout: () => void;
  destroy: () => void;
}

export function createAdoptionController(app: Application): AdoptionController {
  const root = new Container();
  root.eventMode = 'passive';

  const dim = new Graphics();
  dim.eventMode = 'none';
  root.addChild(dim);

  const stageBox = new Container();
  stageBox.eventMode = 'passive';
  root.addChild(stageBox);

  const stageBg = new Graphics();
  stageBg.eventMode = 'none';
  stageBox.addChild(stageBg);

  // Note: no mask clipping — scenes are authored to fit within STAGE_W×STAGE_H,
  // and setting stageBox.mask blocks event hit-testing on children in PIXI v8.

  let active: ActiveScene | null = null;

  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    dim.clear().rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.72 });
    stageBox.scale.set(STAGE_SCALE);
    stageBox.x = Math.round((w - STAGE_W * STAGE_SCALE) / 2);
    stageBox.y = Math.round((h - STAGE_H * STAGE_SCALE) / 2);
    stageBg
      .clear()
      .rect(0, 0, STAGE_W, STAGE_H).fill(0x1a1a24)
      .rect(0, 0, STAGE_W, 4).fill(0x2c2c3a)
      .rect(0, STAGE_H - 4, STAGE_W, 4).fill(0x2c2c3a);
  }

  function clearScene() {
    if (!active) return;
    for (const t of active.timeouts) clearTimeout(t);
    for (const fn of active.tickers) app.ticker.remove(fn);
    for (const u of active.unsubs) u();
    stageBox.removeChild(active.container);
    active.container.destroy({ children: true });
    active = null;
  }

  function newScene(): ActiveScene {
    const container = new Container();
    container.eventMode = 'passive';
    stageBox.addChild(container);
    const s: ActiveScene = { container, timeouts: [], tickers: [], unsubs: [] };
    active = s;
    return s;
  }

  // ---------- Scene 1: going to zoo ----------
  function playSceneGoingToZoo() {
    clearScene();
    const scene = newScene();

    // Solid fallback in case the texture is still loading on first entry.
    const fallback = new Graphics()
      .rect(0, 0, STAGE_W, STAGE_H).fill(0x2f8f3a);
    scene.container.addChild(fallback);

    const bgHost = new Container();
    scene.container.addChild(bgHost);

    const paintBg = (tex: Texture) => {
      const sprite = new Sprite(tex);
      // Cover-fit: scale to fill STAGE_W×STAGE_H, crop overflow.
      const scale = Math.max(STAGE_W / tex.width, STAGE_H / tex.height);
      sprite.scale.set(scale);
      sprite.x = Math.round((STAGE_W - tex.width * scale) / 2);
      sprite.y = Math.round((STAGE_H - tex.height * scale) / 2);
      bgHost.addChild(sprite);
      fallback.visible = false;
    };

    if (zooBgTexture) {
      paintBg(zooBgTexture);
    } else {
      loadZooBg()
        .then((tex) => {
          // Guard against the scene being torn down before load resolved.
          if (active === scene) paintBg(tex);
        })
        .catch((err) => {
          dlog(`zoo bg load failed: ${(err as Error).message}`);
        });
    }

    // Visitor sprite walks from the foreground bottom toward the tent area.
    // The PNG is isometric-ish, so we fake perspective by shrinking the
    // sprite as it moves "away" from the camera. Anchor bottom-center so
    // the feet stay planted when we resize.
    const shadow = new Graphics();
    scene.container.addChild(shadow);

    const visitor = new Sprite();
    visitor.anchor.set(0.5, 1);
    visitor.visible = false;
    scene.container.addChild(visitor);

    const startX = STAGE_W * 0.32;
    const startY = STAGE_H - 12;
    const endX = STAGE_W * 0.55;
    const endY = STAGE_H * 0.62;
    const startHeight = 115;
    const endHeight = 75;

    const applyVisitor = (tex: Texture) => {
      visitor.texture = tex;
      visitor.visible = true;
    };
    if (visitorTexture) {
      applyVisitor(visitorTexture);
    } else {
      loadVisitor()
        .then((tex) => {
          if (active === scene) applyVisitor(tex);
        })
        .catch((err) => dlog(`visitor load failed: ${(err as Error).message}`));
    }

    const anim = { t: 0, finished: false };
    const DURATION = 3.0;
    const WALK_UNTIL = 0.85;

    const ticker = (tk: Ticker) => {
      anim.t += tk.deltaMS / 1000;
      const progress = Math.min(anim.t / DURATION, 1);
      const walkP = Math.min(progress / WALK_UNTIL, 1);
      const eased = easeOutCubic(walkP);

      const h = startHeight + (endHeight - startHeight) * eased;
      if (visitor.texture && visitor.texture.width > 0) {
        visitor.height = h;
        visitor.width = h * (visitor.texture.width / visitor.texture.height);
      }

      // Small whole-body bob to fake footsteps (no leg frames to animate).
      const bob = walkP < 1 ? Math.abs(Math.sin(anim.t * 6)) * 2 : 0;
      const groundX = startX + (endX - startX) * eased;
      const groundY = startY + (endY - startY) * eased;
      visitor.x = groundX;
      visitor.y = groundY - bob;

      // Shadow anchored at the feet, shrinks with the sprite. Doesn't bob —
      // it's on the ground, not attached to the body.
      const shadowW = h * 0.26;
      const shadowH = Math.max(1, h * 0.06);
      shadow
        .clear()
        .ellipse(groundX, groundY - shadowH * 0.5, shadowW, shadowH)
        .fill({ color: 0x000000, alpha: 0.22 });

      if (progress >= 1 && !anim.finished) {
        anim.finished = true;
        const to = setTimeout(() => usePetStore.getState().setPhase('picking'), 300);
        scene.timeouts.push(to);
      }
    };
    app.ticker.add(ticker);
    scene.tickers.push(ticker);
  }

  // ---------- Scene 2: picking ----------
  function playScenePicking() {
    clearScene();
    const scene = newScene();

    // Solid green fallback in case the texture is still loading.
    const bgFallback = new Graphics()
      .rect(0, 0, STAGE_W, STAGE_H).fill(0x2f8f3a);
    scene.container.addChild(bgFallback);

    const bgSprite = new Sprite();
    bgSprite.visible = false;
    scene.container.addChild(bgSprite);

    // Mask so cover-fit overflow doesn't bleed past the stage bounds — the bg
    // is taller than the stage aspect, and without this the sky/ground drift
    // above and below the dialog panel.
    const bgMask = new Graphics()
      .rect(0, 0, STAGE_W, STAGE_H)
      .fill(0xffffff);
    scene.container.addChild(bgMask);
    bgSprite.mask = bgMask;

    const applyPickingBg = (tex: Texture) => {
      bgSprite.texture = tex;
      // Cover-fit, centered — same treatment as the zoo bg for a consistent
      // framing across scenes.
      const scale = Math.max(STAGE_W / tex.width, STAGE_H / tex.height);
      bgSprite.scale.set(scale);
      bgSprite.x = Math.round((STAGE_W - tex.width * scale) / 2);
      bgSprite.y = Math.round((STAGE_H - tex.height * scale) / 2);
      bgSprite.visible = true;
      bgFallback.visible = false;
    };
    if (pickingBgTexture) {
      applyPickingBg(pickingBgTexture);
    } else {
      loadPickingBg()
        .then((tex) => {
          if (active === scene) applyPickingBg(tex);
        })
        .catch((err) => dlog(`picking bg load failed: ${(err as Error).message}`));
    }

    // Slider: showcase one animal at a time on the round wooden stage. The
    // selected animal is what's displayed; left/right arrows cycle through.
    const orderedAnimals: Animal[] = ['cat', 'dog', 'rabbit'];
    // Auto-select the first entry on scene entry so there's always something
    // on the stage (and the picker-bar confirm button is enabled).
    if (usePetStore.getState().selectedAnimal == null) {
      usePetStore.getState().selectAnimal(orderedAnimals[0]);
    }

    const stageGroup = new Container();
    stageGroup.x = STAGE_W / 2;
    // Positioned so the sprite feet land on the wooden platform. The bg is
    // now center-anchored (matching the zoo scene) so the platform sits lower
    // in stage coords than when it was bottom-aligned.
    stageGroup.y = 180;
    scene.container.addChild(stageGroup);

    // Soft ellipse shadow under the animal's feet, on the platform surface.
    const animalShadow = new Graphics()
      .ellipse(0, 40, 34, 6)
      .fill({ color: 0x000000, alpha: 0.28 });
    stageGroup.addChild(animalShadow);

    let currentSprite: Container | null = null;
    let currentAnimal: Animal | null = null;
    const displayAnimal = (animal: Animal) => {
      if (currentAnimal === animal) return;
      if (currentSprite) {
        stageGroup.removeChild(currentSprite);
        currentSprite.destroy({ children: true });
      }
      const sprite = createAnimalSprite(animal, 4);
      stageGroup.addChild(sprite);
      currentSprite = sprite;
      currentAnimal = animal;
    };

    const nameLabel = new Text({
      text: '',
      style: {
        fill: 0xfef7e0,
        fontSize: 22,
        fontWeight: 'bold',
        fontFamily: 'sans-serif',
        stroke: { color: 0x1a2b16, width: 4 },
      },
    });
    // Name above the animal's head.
    nameLabel.anchor.set(0.5, 0);
    nameLabel.x = STAGE_W / 2;
    nameLabel.y = 30;
    scene.container.addChild(nameLabel);

    function cycle(dir: -1 | 1) {
      const cur = usePetStore.getState().selectedAnimal ?? orderedAnimals[0];
      const i = orderedAnimals.indexOf(cur);
      const next = orderedAnimals[(i + dir + orderedAnimals.length) % orderedAnimals.length];
      usePetStore.getState().selectAnimal(next);
    }

    function makeArrow(dir: -1 | 1, x: number, y: number): Container {
      const c = new Container();
      c.x = x; c.y = y;
      const bg = new Graphics()
        .circle(0, 0, 22).fill({ color: 0x1a2b16, alpha: 0.75 })
        .circle(0, 0, 22).stroke({ color: 0xfef7e0, width: 2 });
      c.addChild(bg);
      const tri = new Graphics();
      if (dir < 0) tri.poly([6, -10, 6, 10, -8, 0]).fill(0xfef7e0);
      else tri.poly([-6, -10, -6, 10, 8, 0]).fill(0xfef7e0);
      c.addChild(tri);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.hitArea = new Rectangle(-26, -26, 52, 52);
      c.on('pointerdown', () => cycle(dir));
      return c;
    }
    scene.container.addChild(makeArrow(-1, 130, 150));
    scene.container.addChild(makeArrow(1, 600, 150));

    const applyDisplayed = () => {
      const sel = usePetStore.getState().selectedAnimal ?? orderedAnimals[0];
      displayAnimal(sel);
      nameLabel.text = ANIMAL_LABELS[sel];
    };
    applyDisplayed();
    const unsubDisplay = usePetStore.subscribe((s, p) => {
      if (s.selectedAnimal !== p.selectedAnimal) applyDisplayed();
    });
    scene.unsubs.push(unsubDisplay);

    // Classic RPG-style dialog panel pinned to the bottom of the stage:
    // portrait on the left, speaker name tag, then the line.
    const PANEL_X = 12;
    const PANEL_W = STAGE_W - 24;
    const PANEL_H = 92;
    const PANEL_Y = STAGE_H - PANEL_H;
    const TEXT_LEFT = PANEL_X + 155;

    const dialogPanel = new Container();
    scene.container.addChild(dialogPanel);

    const panelBg = new Graphics()
      .roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 8)
      .fill({ color: 0x1a1408, alpha: 0.88 })
      .roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 8)
      .stroke({ color: 0xd4a942, width: 3 })
      // inner subtle border
      .roundRect(PANEL_X + 4, PANEL_Y + 4, PANEL_W - 8, PANEL_H - 8, 6)
      .stroke({ color: 0x6b4423, width: 1 });
    dialogPanel.addChild(panelBg);

    // Keeper sprite shown directly (no frame / no mask). Bottom-anchored so
    // the head pokes above the panel like a JRPG speaker cut-in.
    const portrait = new Sprite();
    portrait.anchor.set(0, 1);
    portrait.visible = false;
    portrait.x = PANEL_X + 10;
    portrait.y = PANEL_Y + PANEL_H - 6;
    dialogPanel.addChild(portrait);

    const applyKeeper = (tex: Texture) => {
      portrait.texture = tex;
      // Fixed rendered height; width follows source aspect.
      const h = 165;
      portrait.height = h;
      portrait.width = h * (tex.width / tex.height);
      portrait.visible = true;
    };
    if (keeperTexture) {
      applyKeeper(keeperTexture);
    } else {
      loadKeeper()
        .then((tex) => {
          if (active === scene) applyKeeper(tex);
        })
        .catch((err) => dlog(`keeper load failed: ${(err as Error).message}`));
    }

    // Speaker name tag above the dialog text.
    const nameText = new Text({
      text: 'Yuki · 园长',
      style: {
        fill: 0xffde3b,
        fontSize: 15,
        fontWeight: 'bold',
        fontFamily: 'sans-serif',
      },
    });
    nameText.x = TEXT_LEFT;
    nameText.y = PANEL_Y + 12;
    dialogPanel.addChild(nameText);

    // Dialog line.
    const bubbleText = new Text({
      text: '',
      style: {
        fill: 0xfef7e0,
        fontSize: 16,
        fontFamily: 'sans-serif',
        wordWrap: true,
        wordWrapWidth: PANEL_X + PANEL_W - TEXT_LEFT - 16,
      },
    });
    bubbleText.x = TEXT_LEFT;
    bubbleText.y = PANEL_Y + 38;
    dialogPanel.addChild(bubbleText);

    // Typewriter intro: fixed line (no per-animal switching), revealed one
    // character at a time on scene entry.
    const INTRO_TEXT = '欢迎来到 Optec 动物园~ 我是园长 Yuki，来挑选你的伙伴吧！';
    const REVEAL_CHARS_PER_SEC = 22;
    let typed = 0;

    let t = 0;
    const ticker = (tk: Ticker) => {
      const dt = tk.deltaMS / 1000;
      t += dt;
      if (currentSprite) currentSprite.y = Math.sin(t * 3) * 3;

      if (typed < INTRO_TEXT.length) {
        typed += dt * REVEAL_CHARS_PER_SEC;
        const shown = Math.min(Math.floor(typed), INTRO_TEXT.length);
        if (bubbleText.text.length !== shown) {
          bubbleText.text = INTRO_TEXT.slice(0, shown);
        }
      }
    };
    app.ticker.add(ticker);
    scene.tickers.push(ticker);
  }

  // ---------- Scene 3: adopting ----------
  function playSceneAdopting() {
    clearScene();
    const scene = newScene();

    const chosen = usePetStore.getState().selectedAnimal;
    if (!chosen) {
      // Defensive: nothing to adopt, go home.
      const to = setTimeout(() => usePetStore.getState().restartAdoption(), 100);
      scene.timeouts.push(to);
      return;
    }

    // Reuse the wooden platform bg from the picking scene — the ceremony
    // happens right where the pet was chosen, and the dark solid rect stood
    // out against the rest of the game's art style.
    const bgFallback = new Graphics()
      .rect(0, 0, STAGE_W, STAGE_H).fill(0x2f8f3a);
    scene.container.addChild(bgFallback);

    const bgSprite = new Sprite();
    bgSprite.visible = false;
    scene.container.addChild(bgSprite);
    const bgMask = new Graphics()
      .rect(0, 0, STAGE_W, STAGE_H)
      .fill(0xffffff);
    scene.container.addChild(bgMask);
    bgSprite.mask = bgMask;

    const applyBg = (tex: Texture) => {
      bgSprite.texture = tex;
      const s = Math.max(STAGE_W / tex.width, STAGE_H / tex.height);
      bgSprite.scale.set(s);
      bgSprite.x = Math.round((STAGE_W - tex.width * s) / 2);
      bgSprite.y = Math.round((STAGE_H - tex.height * s) / 2);
      bgSprite.visible = true;
      bgFallback.visible = false;
    };
    // Dim overlay to make the certificate/text pop against the busy forest.
    const dim = new Graphics()
      .rect(0, 0, STAGE_W, STAGE_H)
      .fill({ color: 0x0f1608, alpha: 0.4 });
    scene.container.addChild(dim);
    if (pickingBgTexture) {
      applyBg(pickingBgTexture);
    } else {
      loadPickingBg()
        .then((tex) => { if (active === scene) applyBg(tex); })
        .catch((err) => dlog(`adopting bg load failed: ${(err as Error).message}`));
    }

    // Confetti dots
    const confetti = new Graphics();
    const dots: { x: number; y: number; vy: number; c: number }[] = [];
    const colors = [0xffde3b, 0xff6b8a, 0x8ecfff, 0x9be36c, 0xffb84d];
    for (let i = 0; i < 40; i++) {
      dots.push({
        x: Math.random() * STAGE_W,
        y: -Math.random() * STAGE_H,
        vy: 40 + Math.random() * 80,
        c: colors[Math.floor(Math.random() * colors.length)]!,
      });
    }
    scene.container.addChild(confetti);

    const animal = createAnimalSprite(chosen, 6);
    animal.x = STAGE_W / 2 + 60;
    animal.y = STAGE_H / 2 + 60;
    scene.container.addChild(animal);

    const adopter = createAdopterSprite(4);
    adopter.x = STAGE_W / 2 - 90;
    adopter.y = STAGE_H / 2 + 60;
    scene.container.addChild(adopter);

    // Certificate card at top of stage
    const cert = new Container();
    cert.x = STAGE_W / 2;
    cert.y = 24;
    const certBg = new Graphics()
      .roundRect(-200, 0, 400, 96, 10).fill(0xfef7e0)
      .roundRect(-200, 0, 400, 96, 10).stroke({ color: 0xd4a942, width: 3 });
    cert.addChild(certBg);
    const certTitle = new Text({
      text: '领养证明书',
      style: { fill: 0x3a2410, fontSize: 22, fontWeight: 'bold', fontFamily: 'sans-serif' },
    });
    certTitle.anchor.set(0.5, 0);
    certTitle.y = 12;
    cert.addChild(certTitle);
    const petName = usePetStore.getState().petName || ANIMAL_LABELS[chosen];
    const certBody = new Text({
      text: `你与 ${petName} 的故事，从今天开始`,
      style: { fill: 0x3a2410, fontSize: 15, fontFamily: 'sans-serif' },
    });
    certBody.anchor.set(0.5, 0);
    certBody.y = 52;
    cert.addChild(certBody);
    cert.alpha = 0;
    cert.y = -20;
    scene.container.addChild(cert);

    // Envelope that appears after the certificate ceremony and opens to
    // reveal the adoption manual. Container is empty until the envelope stage.
    const envelope = new Container();
    envelope.x = STAGE_W / 2;
    envelope.y = STAGE_H / 2 + 20;
    envelope.visible = false;
    scene.container.addChild(envelope);

    const ENV_W = 220;
    const ENV_H = 140;
    const envBody = new Graphics()
      .roundRect(-ENV_W / 2, -ENV_H / 2, ENV_W, ENV_H, 6)
      .fill(0xfef0c8)
      .stroke({ color: 0x3a2410, width: 3 });
    envelope.addChild(envBody);

    // Inner paper hint peeking above the body once the flap opens.
    const paper = new Graphics();
    envelope.addChild(paper);

    // The flap is drawn dynamically based on `openness` (0=closed, 1=open).
    const flap = new Graphics();
    envelope.addChild(flap);
    const seal = new Graphics()
      .circle(0, -ENV_H / 2 + 46, 12).fill(0xc41e3a)
      .circle(0, -ENV_H / 2 + 46, 12).stroke({ color: 0x8b1a2a, width: 2 })
      // wax cross
      .rect(-5, -ENV_H / 2 + 44, 10, 2).fill(0xf5d0d8)
      .rect(-1, -ENV_H / 2 + 40, 2, 10).fill(0xf5d0d8);
    envelope.addChild(seal);

    const drawFlap = (openness: number) => {
      // Closed: triangle pointing DOWN into the body.
      // Open: triangle pointing UP above the body (flap rotated backwards).
      const closedPeakY = -ENV_H / 2 + 90;
      const openPeakY = -ENV_H / 2 - 90;
      const peakY = closedPeakY + (openPeakY - closedPeakY) * openness;
      flap
        .clear()
        .moveTo(-ENV_W / 2, -ENV_H / 2)
        .lineTo(0, peakY)
        .lineTo(ENV_W / 2, -ENV_H / 2)
        .closePath()
        .fill(openness < 0.5 ? 0xf7e0b8 : 0xead5a4)
        .stroke({ color: 0x3a2410, width: 3 });
    };
    drawFlap(0);

    // Timing of the adopting scene:
    //   0.0 – 0.6s   certificate slides in
    //   0.6 – 2.0s   ceremony hold (animal + adopter bob, confetti)
    //   2.0 – 2.4s   certificate fades and animal/adopter fade
    //   2.4 – 2.8s   envelope pops in from bottom, seals visible
    //   2.8 – 3.5s   flap peels open, seal fades away
    //   3.5 – 4.2s   paper peeks out and grows above the body
    //   4.2s         setPhase('manual') → DOM overlay takes it from here
    const CERT_IN_END = 0.6;
    const CEREMONY_END = 2.0;
    const CEREMONY_FADE_END = 2.4;
    const ENV_POP_END = 2.8;
    const ENV_OPEN_END = 3.5;
    const PAPER_GROW_END = 4.2;
    let handoff = false;

    let t = 0;
    const ticker = (tk: Ticker) => {
      const dt = tk.deltaMS / 1000;
      t += dt;

      // Animal / adopter bob throughout (fade after ceremony).
      animal.y = STAGE_H / 2 + 60 + Math.sin(t * 5) * 6;
      adopter.y = STAGE_H / 2 + 60 + Math.sin(t * 5 + Math.PI) * 4;

      // Confetti fall.
      confetti.clear();
      for (const d of dots) {
        d.y += d.vy * dt;
        if (d.y > STAGE_H) {
          d.y = -8;
          d.x = Math.random() * STAGE_W;
        }
        confetti.rect(d.x, d.y, 4, 4).fill(d.c);
      }

      if (t <= CERT_IN_END) {
        const p = t / CERT_IN_END;
        cert.alpha = p;
        cert.y = -20 + easeOutCubic(p) * 44;
      } else if (t <= CEREMONY_END) {
        cert.alpha = 1;
        cert.y = 24;
      } else if (t <= CEREMONY_FADE_END) {
        const p = (t - CEREMONY_END) / (CEREMONY_FADE_END - CEREMONY_END);
        cert.alpha = 1 - p;
        animal.alpha = 1 - p * 0.7;
        adopter.alpha = 1 - p * 0.7;
      } else if (t <= ENV_POP_END) {
        cert.visible = false;
        envelope.visible = true;
        const p = (t - CEREMONY_FADE_END) / (ENV_POP_END - CEREMONY_FADE_END);
        envelope.scale.set(easeOutBack(p));
        envelope.y = STAGE_H / 2 + 60 - 40 * easeOutCubic(p);
      } else if (t <= ENV_OPEN_END) {
        envelope.scale.set(1);
        envelope.y = STAGE_H / 2 + 20;
        const p = (t - ENV_POP_END) / (ENV_OPEN_END - ENV_POP_END);
        drawFlap(p);
        seal.alpha = 1 - p;
      } else if (t <= PAPER_GROW_END) {
        drawFlap(1);
        seal.alpha = 0;
        const p = (t - ENV_OPEN_END) / (PAPER_GROW_END - ENV_OPEN_END);
        const w = 160 + 60 * p;
        const h = 20 + 100 * p;
        paper
          .clear()
          .roundRect(-w / 2, -ENV_H / 2 + 30 - h, w, h, 4)
          .fill(0xfef7e0)
          .stroke({ color: 0x3a2410, width: 2 })
          // faux "text lines" on the paper
          .rect(-w / 2 + 12, -ENV_H / 2 + 30 - h + 12, w - 24, 3).fill(0xc4a480)
          .rect(-w / 2 + 12, -ENV_H / 2 + 30 - h + 22, (w - 24) * 0.7, 3).fill(0xc4a480)
          .rect(-w / 2 + 12, -ENV_H / 2 + 30 - h + 32, (w - 24) * 0.85, 3).fill(0xc4a480);
      } else if (!handoff) {
        handoff = true;
        const to = setTimeout(() => usePetStore.getState().setPhase('manual'), 100);
        scene.timeouts.push(to);
      }
    };
    app.ticker.add(ticker);
    scene.tickers.push(ticker);
  }

  // ---------- Phase reactor ----------
  const unsubscribe = usePetStore.subscribe((state, prev) => {
    if (state.phase !== prev.phase) applyPhase(state.phase);
  });

  function applyPhase(phase: Phase) {
    dlog(`adoption applyPhase ${phase}`);
    if (phase === 'living') {
      root.visible = false;
      clearScene();
      return;
    }
    if (phase === 'manual') {
      // Keep the adopting scene visuals (envelope + paper) frozen behind the
      // DOM manual overlay for continuity.
      root.visible = true;
      return;
    }
    root.visible = true;
    if (phase === 'going-to-zoo') playSceneGoingToZoo();
    else if (phase === 'picking') playScenePicking();
    else if (phase === 'adopting') playSceneAdopting();
  }

  layout();
  applyPhase(usePetStore.getState().phase);

  return {
    root,
    layout,
    destroy: () => {
      unsubscribe();
      clearScene();
      root.destroy({ children: true });
    },
  };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
