// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play, paused,
// game over and story complete.
//
// ?seed=N fixes the city. ?shot=title|drive|mission|chase (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_CASH, EVENT_HIT, EVENT_MISSION, EVENT_OVER, EVENT_RAM, EVENT_STORY, EVENT_WANTED } from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const sound = createSound();

// A handle for automated play-tests: the world and the current screen.
window.__game = { world, screen: () => currentScreen };

let currentScreen = SCREEN_TITLE;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function idleControls() {
  return { throttle: 0, steer: 0, moveX: 0, moveY: 0, enter: false, punch: false };
}

function runShot(name) {
  const scene = stageShot(name, world, seed);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    sound.unlock();
    world.reset();
    accumulator = 0;
    currentScreen = SCREEN_PLAY;
    announce('Playing. Mission 1: Dock Pickup.');
  }

  function endGame(story) {
    currentScreen = story ? SCREEN_STORY : SCREEN_OVER;
    if (world.state.cash > best) {
      best = world.state.cash;
      saveBest(best);
    }
    sound.setSiren(false);
    announce(story
      ? `Story complete. Cash ${world.state.cash}. Best ${best}.`
      : `Game over. Cash ${world.state.cash}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) sound.setMuted(!sound.isMuted());
    // Space is the punch during play, but on the title, game-over and story
    // screens it starts the game too, as the panel promises.
    if (actions & (ACTION_CONFIRM | ACTION_PUNCH)) {
      if (currentScreen === SCREEN_TITLE || currentScreen === SCREEN_OVER || currentScreen === SCREEN_STORY) {
        startGame();
        return actions & ~ACTION_PUNCH;
      }
      if (currentScreen === SCREEN_PAUSED) {
        currentScreen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (currentScreen === SCREEN_PLAY) {
        currentScreen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (currentScreen === SCREEN_PAUSED) {
        currentScreen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    return actions;
  }

  function step(actions) {
    if (currentScreen === SCREEN_TITLE) {
      world.step(STEP, idleControls(), true);
      return;
    }
    const move = input.move();
    const drive = input.drive();
    const controls = {
      throttle: drive.throttle,
      steer: drive.steer,
      moveX: move.x,
      moveY: move.y,
      enter: Boolean(actions & ACTION_ENTER),
      punch: Boolean(actions & ACTION_PUNCH),
    };
    const events = world.step(STEP, controls, false);
    if (events & EVENT_CASH) sound.pickup();
    if (events & (EVENT_HIT | EVENT_RAM)) sound.crash();
    if (events & EVENT_MISSION) sound.mission();
    if (events & EVENT_WANTED) announce(`Wanted level ${world.state.wanted}.`);
    sound.setSiren(world.state.wanted > 0);
    if (events & EVENT_STORY) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (currentScreen === SCREEN_TITLE || currentScreen === SCREEN_PLAY) {
      // The one-shot presses (enter a car, punch) belong to the first step only:
      // a slow frame that runs two steps must not enter and leave in one frame.
      let firstStep = true;
      while (accumulator >= STEP && (currentScreen === SCREEN_TITLE || currentScreen === SCREEN_PLAY)) {
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, currentScreen, best);
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentScreen === SCREEN_PLAY) {
      currentScreen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Bay Nights. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
