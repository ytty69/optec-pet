import { Application, Container, FederatedPointerEvent, Graphics, Text, Ticker } from 'pixi.js';
import { createAnimalSprite } from './sprites';
import { usePetStore, type Animal, type Phase } from './state';
import { createAdoptionController } from './AdoptionScene';
import { dlog } from './debug';
import { useMenuStore } from '../ui/menuStore';

const HIT_HALF = 60;

export async function mountPetStage(host: HTMLElement): Promise<() => void> {
  console.log('[optec-pet renderer] window size:', window.innerWidth, 'x', window.innerHeight, 'DPR:', window.devicePixelRatio);
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  host.appendChild(app.canvas);

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  // Layers: pet on bottom, adoption overlay on top.
  const petLayer = new Container();
  app.stage.addChild(petLayer);

  const adoption = createAdoptionController(app);
  app.stage.addChild(adoption.root);

  let pet = spawnPet(onPetClick, onRightDown);
  petLayer.addChild(pet);

  const unsubscribeAnimal = usePetStore.subscribe((state, prev) => {
    if (state.animal === prev.animal) return;
    const oldX = pet.x;
    const oldY = pet.y;
    const oldFacing = Math.sign(pet.scale.x) || 1;
    petLayer.removeChild(pet);
    pet.destroy({ children: true });
    pet = spawnPet(onPetClick, onRightDown);
    pet.x = oldX;
    pet.y = oldY;
    pet.scale.x = Math.abs(pet.scale.x) * oldFacing;
    petLayer.addChild(pet);
  });

  const unsubscribePhase = usePetStore.subscribe((state, prev) => {
    if (state.phase === prev.phase) return;
    applyPhase(state.phase);
  });

  function applyPhase(phase: Phase) {
    const living = phase === 'living';
    petLayer.visible = living;
    dlog(`petstage applyPhase ${phase} → forceInteractive=${!living}`);
    if (!window.pet) {
      dlog('!! window.pet is undefined (preload not loaded)');
      return;
    }
    try {
      window.pet.setForceInteractive(!living);
    } catch (err) {
      dlog(`!! setForceInteractive threw: ${(err as Error).message}`);
    }
  }

  const anim = { direction: 1, speed: 60, animTime: 0, jumpV: 0, baseY: pet.y };

  // ---------- Right-click drag ----------
  // Right-click on the pet is dual purpose:
  //   • quick right-click (no movement) opens the context menu
  //   • right-click + drag moves the pet, using OS cursor polling so it can
  //     cross onto extended displays that the browser pointermove drops.
  const DRAG_THRESHOLD_SQ = 25;

  let rightPressed = false;
  let rightDownX = 0;
  let rightDownY = 0;
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let savedSpeed = anim.speed;
  let dragCursorUnsub: (() => void) | null = null;
  let lastCursorMoveAt = 0;

  function beginDrag() {
    dragging = true;
    savedSpeed = anim.speed;
    anim.speed = 0;
    app.canvas.style.cursor = 'grabbing';
    window.pet?.setForceInteractive(true);
    lastCursorMoveAt = performance.now();
    window.pet?.setDragMode(true);
    dragCursorUnsub = window.pet?.onDragCursor((pos) => {
      if (!dragging) return;
      lastCursorMoveAt = performance.now();
      pet.x = pos.x + dragOffsetX;
      pet.y = pos.y + dragOffsetY;
      anim.baseY = pet.y;
      anim.jumpV = 0;
    }) ?? null;
  }

  function endDrag() {
    rightPressed = false;
    if (!dragging) return;
    dragging = false;
    anim.speed = savedSpeed;
    anim.baseY = pet.y;
    app.canvas.style.cursor = 'grab';
    window.pet?.setDragMode(false);
    if (dragCursorUnsub) {
      dragCursorUnsub();
      dragCursorUnsub = null;
    }
    const living = usePetStore.getState().phase === 'living';
    window.pet?.setForceInteractive(!living);
  }

  function onRightDown(e: FederatedPointerEvent) {
    rightPressed = true;
    rightDownX = e.global.x;
    rightDownY = e.global.y;
    dragOffsetX = pet.x - e.global.x;
    dragOffsetY = pet.y - e.global.y;
  }

  const onWindowPointerMove = (ev: PointerEvent) => {
    if (!rightPressed || dragging) return;
    const dx = ev.clientX - rightDownX;
    const dy = ev.clientY - rightDownY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_SQ) beginDrag();
  };

  const onWindowPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 2) return;
    if (dragging) endDrag();
    else if (rightPressed) {
      rightPressed = false;
      useMenuStore.getState().show(ev.clientX, ev.clientY);
    }
  };

  const onWindowKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') endDrag();
  };

  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('keydown', onWindowKeyDown);

  // Watchdog: if the pointerup event is dropped (Windows sometimes drops it
  // when the release happens over an area the transparent window doesn't
  // render), end the drag once the cursor has been idle for a moment.
  const dragWatchdog = setInterval(() => {
    if (!dragging) return;
    if (performance.now() - lastCursorMoveAt > 700) endDrag();
  }, 200);

  // Triple-click within TRIPLE_WINDOW_MS triggers the poop gag; single/double
  // click still causes the jump.
  const TRIPLE_WINDOW_MS = 500;
  const recentClicks: number[] = [];

  // Reactions: every N (random 5-14) total clicks the pet plays a random
  // reaction (text + small animation). Independent from triple-click.
  let totalClicks = 0;
  let nextReactionAt = randomTarget();
  let reactionBusy = false;

  function randomTarget() {
    return 5 + Math.floor(Math.random() * 10);
  }

  function onPetClick(_e: FederatedPointerEvent) {
    const now = performance.now();
    while (recentClicks.length && now - recentClicks[0] > TRIPLE_WINDOW_MS) {
      recentClicks.shift();
    }
    recentClicks.push(now);

    if (recentClicks.length >= 3) {
      recentClicks.length = 0;
      triggerPoop();
      return;
    }

    totalClicks++;
    if (!reactionBusy && totalClicks >= nextReactionAt) {
      totalClicks = 0;
      nextReactionAt = randomTarget();
      playRandomReaction();
      return;
    }

    if (Math.abs(pet.y - anim.baseY) < 1) anim.jumpV = -240;
  }

  // ---------- Reactions ----------

  interface Reaction {
    text: string;
    duration: number;
    play(): void;
  }

  function showBubble(text: string, durationS: number): () => void {
    const bubble = new Container();
    const label = new Text({
      text,
      style: {
        fill: 0x3a2410,
        fontSize: 14,
        fontFamily: 'sans-serif',
        wordWrap: true,
        wordWrapWidth: 220,
        align: 'center',
      },
    });
    label.anchor.set(0.5, 0.5);
    const pad = 10;
    const w = Math.max(80, label.width + pad * 2);
    const h = label.height + pad * 2;
    const bg = new Graphics()
      .roundRect(-w / 2, -h, w, h, 8)
      .fill({ color: 0xfef7e0, alpha: 0.96 })
      .stroke({ color: 0x3a2410, width: 2 })
      // tail
      .moveTo(-6, 0)
      .lineTo(6, 0)
      .lineTo(0, 12)
      .closePath()
      .fill({ color: 0xfef7e0, alpha: 0.96 })
      .stroke({ color: 0x3a2410, width: 2 })
      // repaint seam
      .rect(-5, -1, 10, 2)
      .fill({ color: 0xfef7e0, alpha: 0.96 });
    bubble.addChild(bg);
    label.y = -h / 2;
    bubble.addChild(label);

    bubble.alpha = 0;
    petLayer.addChild(bubble);
    const start = performance.now();
    const FADE = 0.25;
    const follow = (_tk: Ticker) => {
      bubble.x = pet.x;
      bubble.y = pet.y - 70;
      const t = (performance.now() - start) / 1000;
      if (t < FADE) bubble.alpha = t / FADE;
      else if (t < durationS - FADE) bubble.alpha = 1;
      else if (t < durationS) bubble.alpha = (durationS - t) / FADE;
      else stop();
    };
    const stop = () => {
      app.ticker.remove(follow);
      if (bubble.parent) petLayer.removeChild(bubble);
      bubble.destroy({ children: true });
    };
    app.ticker.add(follow);
    return stop;
  }

  function runTicker(fn: (elapsedS: number) => boolean) {
    const start = performance.now();
    const tick = (_tk: Ticker) => {
      const t = (performance.now() - start) / 1000;
      if (!fn(t)) {
        app.ticker.remove(tick);
      }
    };
    app.ticker.add(tick);
    return () => app.ticker.remove(tick);
  }

  // ---- Animations ----

  function animHeadTilt(durS: number): () => void {
    const orig = pet.rotation;
    pet.rotation = -0.3;
    return runTicker((t) => {
      if (t >= durS) {
        pet.rotation = orig;
        return false;
      }
      return true;
    });
  }

  function animLickFur(durS: number): () => void {
    const origSy = pet.scale.y;
    return runTicker((t) => {
      if (t >= durS) {
        pet.scale.y = origSy;
        return false;
      }
      // Small rhythmic squash to fake grooming motion.
      pet.scale.y = origSy * (1 - 0.06 * (Math.sin(t * 8) + 1) * 0.5);
      return true;
    });
  }

  function animTailHug(durS: number): () => void {
    const tail = pet.getChildByLabel('tail') as Container | null;
    const origRot = tail?.rotation ?? 0;
    return runTicker((t) => {
      if (t >= durS) {
        if (tail) tail.rotation = origRot;
        return false;
      }
      if (tail) tail.rotation = origRot + Math.sin(t * 10) * 0.6;
      return true;
    });
  }

  function animRollOver(durS: number): () => void {
    const origRot = pet.rotation;
    return runTicker((t) => {
      if (t >= durS) {
        pet.rotation = origRot;
        return false;
      }
      const flipIn = 0.4;
      const flipOut = 0.4;
      if (t < flipIn) pet.rotation = origRot + Math.PI * (t / flipIn);
      else if (t < durS - flipOut) pet.rotation = origRot + Math.PI;
      else pet.rotation = origRot + Math.PI * (1 - (t - (durS - flipOut)) / flipOut);
      return true;
    });
  }

  function animBringYarn(durS: number): () => void {
    const yarn = new Container();
    yarn.scale.set(3);
    yarn.addChild(
      new Graphics()
        .circle(0, 0, 4).fill(0x2a1608)
        .circle(0, 0, 3).fill(0xff9a4a)
        .moveTo(-2, -1).lineTo(2, 1).stroke({ color: 0xd45a2a, width: 0.6 })
        .moveTo(-2, 1).lineTo(2, -1).stroke({ color: 0xd45a2a, width: 0.6 })
        .moveTo(0, -2).lineTo(0, 2).stroke({ color: 0xd45a2a, width: 0.6 }),
    );
    const facing = Math.sign(pet.scale.x) || 1;
    yarn.x = pet.x + facing * 30;
    yarn.y = pet.y + 42;
    yarn.alpha = 0;
    petLayer.addChild(yarn);
    return runTicker((t) => {
      if (t >= durS) {
        if (yarn.parent) petLayer.removeChild(yarn);
        yarn.destroy({ children: true });
        return false;
      }
      const FADE = 0.3;
      if (t < FADE) yarn.alpha = t / FADE;
      else if (t < durS - FADE) yarn.alpha = 1;
      else yarn.alpha = (durS - t) / FADE;
      // Tiny bob so it doesn't look pasted.
      yarn.y = pet.y + 42 + Math.sin(t * 4) * 1.5;
      return true;
    });
  }

  function animSneakOff(durS: number): () => void {
    const startX = pet.x;
    const margin = 60;
    const targetX = pet.x < window.innerWidth / 2 ? margin : window.innerWidth - margin;
    const origSpeed = anim.speed;
    const origFacing = Math.sign(pet.scale.x) || 1;
    anim.speed = 0;
    // Face away from the viewer: toward the closer edge.
    pet.scale.x = Math.abs(pet.scale.x) * (targetX < pet.x ? -1 : 1);
    return runTicker((t) => {
      if (t >= durS) {
        anim.speed = origSpeed;
        pet.scale.x = Math.abs(pet.scale.x) * origFacing;
        return false;
      }
      const travel = 0.9;
      if (t < travel) pet.x = startX + (targetX - startX) * (t / travel);
      else pet.x = targetX;
      return true;
    });
  }

  // ---- Dog animations ----

  function animGentleWag(durS: number): () => void {
    const tail = pet.getChildByLabel('tail') as Container | null;
    const origTailRot = tail?.rotation ?? 0;
    const origSpeed = anim.speed;
    anim.speed = 0;
    return runTicker((t) => {
      if (t >= durS) {
        if (tail) tail.rotation = origTailRot;
        anim.speed = origSpeed;
        return false;
      }
      if (tail) tail.rotation = origTailRot + Math.sin(t * 8) * 0.45;
      return true;
    });
  }

  function animSniffScreen(durS: number): () => void {
    const startX = pet.x;
    const facing = Math.sign(pet.scale.x) || 1;
    const targetX = startX + facing * 32;
    const origSpeed = anim.speed;
    anim.speed = 0;
    return runTicker((t) => {
      if (t >= durS) {
        pet.x = startX;
        pet.y = anim.baseY;
        anim.speed = origSpeed;
        return false;
      }
      const reach = 0.45;
      const back = 0.75;
      if (t < reach) pet.x = startX + (targetX - startX) * (t / reach);
      else if (t < back) pet.x = targetX;
      else pet.x = targetX + (startX - targetX) * ((t - back) / (durS - back));
      // Sniffing bob.
      pet.y = anim.baseY + Math.sin(t * 12) * 1.5;
      return true;
    });
  }

  function animSitPant(durS: number): () => void {
    const origSy = pet.scale.y;
    const origSpeed = anim.speed;
    anim.speed = 0;
    return runTicker((t) => {
      if (t >= durS) {
        pet.scale.y = origSy;
        anim.speed = origSpeed;
        return false;
      }
      const settle = 0.3;
      if (t < settle) pet.scale.y = origSy * (1 - 0.15 * (t / settle));
      else pet.scale.y = origSy * (0.85 + 0.03 * Math.sin(t * 8));
      return true;
    });
  }

  function animCrazyWag(durS: number): () => void {
    const tail = pet.getChildByLabel('tail') as Container | null;
    const origTailRot = tail?.rotation ?? 0;
    const origRot = pet.rotation;
    const origSpeed = anim.speed;
    const startX = pet.x;
    anim.speed = 0;
    let lastJumpT = -1;
    return runTicker((t) => {
      if (t >= durS) {
        if (tail) tail.rotation = origTailRot;
        pet.rotation = origRot;
        pet.x = startX;
        anim.speed = origSpeed;
        return false;
      }
      if (tail) tail.rotation = origTailRot + Math.sin(t * 20) * 1.0;
      pet.rotation = origRot + Math.sin(t * 10) * 0.1;
      // Bounce every ~0.55s if grounded.
      if (Math.abs(pet.y - anim.baseY) < 1 && t - lastJumpT > 0.55) {
        anim.jumpV = -180;
        lastJumpT = t;
      }
      return true;
    });
  }

  function animPawsUp(durS: number): () => void {
    const origRot = pet.rotation;
    const origSpeed = anim.speed;
    const startY = pet.y;
    anim.speed = 0;
    return runTicker((t) => {
      if (t >= durS) {
        pet.rotation = origRot;
        pet.y = startY;
        anim.speed = origSpeed;
        return false;
      }
      const settle = 0.4;
      const holdEnd = durS - 0.4;
      let p = 0;
      if (t < settle) p = t / settle;
      else if (t < holdEnd) p = 1;
      else p = 1 - (t - holdEnd) / 0.4;
      pet.rotation = origRot - 0.28 * p;
      pet.y = startY - 5 * p;
      return true;
    });
  }

  function animBringBone(durS: number): () => void {
    const bone = new Container();
    bone.scale.set(3);
    bone.addChild(
      new Graphics()
        // outline
        .circle(-5, -2, 2.5).fill(0x3a2410)
        .circle(-5, 2, 2.5).fill(0x3a2410)
        .circle(5, -2, 2.5).fill(0x3a2410)
        .circle(5, 2, 2.5).fill(0x3a2410)
        .rect(-6, -1.5, 12, 3).fill(0x3a2410)
        // fill
        .circle(-5, -2, 1.7).fill(0xfef7e0)
        .circle(-5, 2, 1.7).fill(0xfef7e0)
        .circle(5, -2, 1.7).fill(0xfef7e0)
        .circle(5, 2, 1.7).fill(0xfef7e0)
        .rect(-5, -0.8, 10, 1.6).fill(0xfef7e0)
        // shine
        .rect(-4, -0.5, 3, 0.5).fill(0xffffff),
    );
    const facing = Math.sign(pet.scale.x) || 1;
    const boneX = pet.x + facing * 32;
    bone.x = boneX;
    bone.y = pet.y + 42;
    bone.alpha = 0;
    petLayer.addChild(bone);
    return runTicker((t) => {
      if (t >= durS) {
        if (bone.parent) petLayer.removeChild(bone);
        bone.destroy({ children: true });
        return false;
      }
      const FADE = 0.3;
      if (t < FADE) bone.alpha = t / FADE;
      else if (t < durS - FADE) bone.alpha = 1;
      else bone.alpha = (durS - t) / FADE;
      bone.y = pet.y + 42 + Math.sin(t * 4) * 1.5;
      return true;
    });
  }

  // ---- Rabbit animations ----

  function animNoseTwitch(durS: number): () => void {
    const startY = pet.y;
    const origSpeed = anim.speed;
    anim.speed = 0;
    return runTicker((t) => {
      if (t >= durS) {
        pet.y = anim.baseY;
        anim.speed = origSpeed;
        return false;
      }
      // Rapid tiny twitches — the whole body wiggles a hair with the nose.
      pet.y = startY + Math.sin(t * 26) * 0.7;
      return true;
    });
  }

  function animDoubleHop(durS: number): () => void {
    const origSpeed = anim.speed;
    anim.speed = 0;
    let hopsFired = 0;
    return runTicker((t) => {
      if (t >= durS) {
        anim.speed = origSpeed;
        return false;
      }
      if (hopsFired === 0 && t > 0.3 && Math.abs(pet.y - anim.baseY) < 1) {
        anim.jumpV = -280;
        hopsFired = 1;
      } else if (hopsFired === 1 && t > 1.3 && Math.abs(pet.y - anim.baseY) < 1) {
        anim.jumpV = -260;
        hopsFired = 2;
      }
      return true;
    });
  }

  function animCarrotNibble(durS: number): () => void {
    const carrot = new Container();
    carrot.scale.set(3);
    carrot.addChild(
      new Graphics()
        // outline
        .rect(-2, -1, 4, 6).fill(0x3a2410)
        .rect(-1, -4, 3, 3).fill(0x1a3010)
        // orange body
        .rect(-1, 0, 2, 4).fill(0xff8a3a)
        .rect(-1, 4, 2, 1).fill(0xd66020)
        // leaves
        .rect(-1, -3, 2, 3).fill(0x4a9a3a)
        .rect(0, -4, 1, 2).fill(0x6bc054),
    );
    const facing = Math.sign(pet.scale.x) || 1;
    carrot.x = pet.x + facing * 24;
    carrot.y = pet.y + 30;
    carrot.alpha = 0;
    petLayer.addChild(carrot);
    const origSy = pet.scale.y;
    const origSpeed = anim.speed;
    anim.speed = 0;
    return runTicker((t) => {
      if (t >= durS) {
        if (carrot.parent) petLayer.removeChild(carrot);
        carrot.destroy({ children: true });
        pet.scale.y = origSy;
        anim.speed = origSpeed;
        return false;
      }
      const FADE = 0.3;
      if (t < FADE) carrot.alpha = t / FADE;
      else if (t < durS - FADE) carrot.alpha = 1;
      else carrot.alpha = (durS - t) / FADE;
      pet.scale.y = origSy * (1 - 0.04 * (Math.sin(t * 14) + 1) * 0.5);
      return true;
    });
  }

  function animCurlBall(durS: number): () => void {
    const origSy = pet.scale.y;
    const origSx = pet.scale.x;
    const origSpeed = anim.speed;
    anim.speed = 0;
    return runTicker((t) => {
      if (t >= durS) {
        pet.scale.y = origSy;
        pet.scale.x = origSx;
        anim.speed = origSpeed;
        return false;
      }
      const settle = 0.4;
      const holdEnd = durS - 0.4;
      let p = 0;
      if (t < settle) p = t / settle;
      else if (t < holdEnd) p = 1;
      else p = 1 - (t - holdEnd) / 0.4;
      // Curl into a rounder ball — shorter vertically, slightly wider.
      pet.scale.y = origSy * (1 - 0.35 * p);
      pet.scale.x = origSx * (1 + 0.18 * p);
      return true;
    });
  }

  function animBackKick(durS: number): () => void {
    const legs = pet.getChildByLabel('legs') as Container | null;
    const origLegRot = legs?.rotation ?? 0;
    const origLegY = legs?.y ?? 0;
    const origSpeed = anim.speed;
    anim.speed = 0;
    return runTicker((t) => {
      if (t >= durS) {
        if (legs) {
          legs.rotation = origLegRot;
          legs.y = origLegY;
        }
        anim.speed = origSpeed;
        return false;
      }
      if (legs) {
        legs.rotation = origLegRot + Math.sin(t * 16) * 0.18;
        legs.y = origLegY + Math.sin(t * 16) * 1.5;
      }
      return true;
    });
  }

  function animBackTurn(durS: number): () => void {
    const origSx = pet.scale.x;
    const origSpeed = anim.speed;
    anim.speed = 0;
    pet.scale.x = -origSx; // flip to face away
    return runTicker((t) => {
      if (t >= durS) {
        pet.scale.x = origSx;
        anim.speed = origSpeed;
        return false;
      }
      return true;
    });
  }

  const CAT_REACTIONS: Reaction[] = [
    { text: '歪头眨了眨眼睛，安静地盯着你', duration: 2.6, play: () => animHeadTilt(2.6) },
    { text: '舔毛，淡淡瞥了你一眼', duration: 2.8, play: () => animLickFur(2.8) },
    { text: '竖起尾巴缠上你，贴贴', duration: 2.6, play: () => animTailHug(2.6) },
    { text: '肚皮翻过来，求你摸一会儿', duration: 3.0, play: () => animRollOver(3.0) },
    { text: '叼来小毛线球，放到你手边', duration: 3.2, play: () => animBringYarn(3.2) },
    { text: '蹲到角落，只留个蓬松后脑勺给你', duration: 3.4, play: () => animSneakOff(3.4) },
  ];

  const DOG_REACTIONS: Reaction[] = [
    { text: '晃着尾巴，抬头乖乖看向你', duration: 2.6, play: () => animGentleWag(2.6) },
    { text: '鼻子凑过来蹭屏幕，嗅嗅你的气息', duration: 2.8, play: () => animSniffScreen(2.8) },
    { text: '原地坐好，吐着小舌头等待指令', duration: 3.0, play: () => animSitPant(3.0) },
    { text: '疯狂摇尾巴，原地蹦蹦跳跳转圈圈', duration: 3.4, play: () => animCrazyWag(3.4) },
    { text: '前爪搭上来，满眼亮晶晶望着你', duration: 2.8, play: () => animPawsUp(2.8) },
    { text: '叼来骨头，开心邀功', duration: 3.2, play: () => animBringBone(3.2) },
  ];

  const RABBIT_REACTIONS: Reaction[] = [
    { text: '圆鼻子一抽一抽，安静不动', duration: 2.6, play: () => animNoseTwitch(2.6) },
    { text: '轻轻蹦两下，耳朵竖得笔直', duration: 2.6, play: () => animDoubleHop(2.6) },
    { text: '抱着胡萝卜小口啃，一脸满足', duration: 3.2, play: () => animCarrotNibble(3.2) },
    { text: '蜷成一团小白球，乖乖靠在你手边', duration: 3.0, play: () => animCurlBall(3.0) },
    { text: '轻轻蹬蹬后腿，示意再多摸两下', duration: 2.8, play: () => animBackKick(2.8) },
    { text: '背过身子，只露出一团毛茸茸屁股', duration: 3.0, play: () => animBackTurn(3.0) },
  ];

  function getReactions(animal: Animal): Reaction[] {
    if (animal === 'cat') return CAT_REACTIONS;
    if (animal === 'dog') return DOG_REACTIONS;
    return RABBIT_REACTIONS;
  }

  function playRandomReaction() {
    if (reactionBusy) return;
    const list = getReactions(usePetStore.getState().animal);
    if (!list.length) return;
    const r = list[Math.floor(Math.random() * list.length)]!;
    reactionBusy = true;
    r.play();
    showBubble(r.text, r.duration);
    setTimeout(() => { reactionBusy = false; }, r.duration * 1000);
  }

  function triggerPoop() {
    const facing = Math.sign(pet.scale.x) || 1;
    const groundY = pet.y + 44;
    const poop = createPoopSprite();
    poop.x = pet.x - facing * 28;
    poop.y = groundY;
    poop.scale.set(0);
    petLayer.addChild(poop);

    // Squat: temporarily drop the pet a couple of pixels so it looks like it
    // squats down for the deed.
    const restY = anim.baseY;
    const squatEnd = performance.now() + 500;
    pet.y = restY + 3;

    const startTime = performance.now();
    const POP_S = 0.35;
    const HOLD_S = 3.2;
    const FADE_S = 1;
    const TARGET_SCALE = 3;

    const life = (_tk: Ticker) => {
      const now = performance.now();
      // Release squat halfway through the pop.
      if (now > squatEnd && pet.y > restY) pet.y = restY;

      const t = (now - startTime) / 1000;
      if (t < POP_S) {
        const p = t / POP_S;
        // Overshoot + settle for a satisfying "plop".
        const s = TARGET_SCALE * (1 + 0.35 * Math.sin(p * Math.PI));
        poop.scale.set(Math.min(s, TARGET_SCALE * 1.2));
      } else if (t < POP_S + HOLD_S) {
        poop.scale.set(TARGET_SCALE);
        poop.alpha = 1;
      } else if (t < POP_S + HOLD_S + FADE_S) {
        const p = (t - POP_S - HOLD_S) / FADE_S;
        poop.alpha = 1 - p;
      } else {
        app.ticker.remove(life);
        petLayer.removeChild(poop);
        poop.destroy({ children: true });
      }
    };
    app.ticker.add(life);
  }

  const onResize = () => {
    adoption.layout();
    // Keep pet baseline near the bottom of the new viewport.
    anim.baseY = window.innerHeight - 120;
    if (Math.abs(pet.y - anim.baseY) < 60) pet.y = anim.baseY;
  };
  window.addEventListener('resize', onResize);

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    anim.animTime += dt;

    if (petLayer.visible) {
      // Don't move or clamp the pet while the user is dragging it — the drag
      // handler owns the position and clamping to window.innerWidth would
      // snap it back and block cross-monitor drops.
      if (!dragging) {
        pet.x += anim.direction * anim.speed * dt;
        const margin = 60;
        if (pet.x < margin) {
          pet.x = margin;
          anim.direction = 1;
          pet.scale.x = Math.abs(pet.scale.x);
        } else if (pet.x > window.innerWidth - margin) {
          pet.x = window.innerWidth - margin;
          anim.direction = -1;
          pet.scale.x = -Math.abs(pet.scale.x);
        }
      }

      if (anim.jumpV !== 0 || pet.y < anim.baseY) {
        anim.jumpV += 900 * dt;
        pet.y += anim.jumpV * dt;
        if (pet.y >= anim.baseY) {
          pet.y = anim.baseY;
          anim.jumpV = 0;
        }
      }

      const legs = pet.getChildByLabel('legs') as Container | null;
      if (legs) legs.y = Math.sin(anim.animTime * 8) * 2;

      window.pet.updateBounds({
        x: pet.x - HIT_HALF,
        y: pet.y - HIT_HALF,
        w: HIT_HALF * 2,
        h: HIT_HALF * 2,
      });
    }
  });

  // Apply initial phase now that everything is mounted.
  applyPhase(usePetStore.getState().phase);

  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('keydown', onWindowKeyDown);
    clearInterval(dragWatchdog);
    if (dragCursorUnsub) dragCursorUnsub();
    unsubscribeAnimal();
    unsubscribePhase();
    adoption.destroy();
    app.destroy(true, { children: true, texture: true });
  };
}

function createPoopSprite(): Container {
  const c = new Container();
  c.scale.set(3);
  const dark = 0x2a1608;
  const mid = 0x5c3a1c;
  const light = 0x8b5528;
  const shine = 0xb87a44;
  c.addChild(
    new Graphics()
      // bottom (widest)
      .rect(-6, -2, 12, 4).fill(dark)
      .rect(-5, -1, 10, 3).fill(mid)
      .rect(-4, -1, 8, 1).fill(light)
      // middle coil
      .rect(-4, -5, 8, 3).fill(dark)
      .rect(-3, -4, 6, 2).fill(mid)
      .rect(-2, -4, 4, 1).fill(light)
      // top peak
      .rect(-2, -8, 4, 3).fill(dark)
      .rect(-1, -7, 2, 2).fill(mid)
      .rect(-1, -7, 1, 1).fill(shine),
  );
  return c;
}

function spawnPet(
  onClick: (e: FederatedPointerEvent) => void,
  onRightDown: (e: FederatedPointerEvent) => void,
): Container {
  const { animal } = usePetStore.getState();
  const sprite = createAnimalSprite(animal);
  sprite.x = 200;
  sprite.y = window.innerHeight - 120;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  sprite.on('click', (e) => {
    if (e.button === 0) onClick(e);
  });
  sprite.on('rightdown', onRightDown);
  return sprite;
}
