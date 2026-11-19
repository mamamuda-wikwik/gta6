// The screenshot scenes behind ?shot=title|drive|mission|chase. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot that follows the road grid toward its waypoints, so the
// frame is what a short game really looks like and the same seed always gives
// the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createRandom } from './random.js';

const AVENUES = [160, 480, 800, 1120, 1440];
const STREETS = [160, 480, 800, 1120, 1440, 1760, 2080];

const TITLE_SECONDS = 5;
const DRIVE_SECONDS = 22;
const MISSION_SECONDS = 12;
const CHASE_SECONDS = 10;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function nearestLine(lines, value) {
  let best = lines[0];
  for (const line of lines) if (Math.abs(line - value) < Math.abs(best - value)) best = line;
  return best;
}

/**
 * A Manhattan path along the roads from `from` to `to`: first to the nearest
 * intersection, then along the avenue to the target's street, then along the
 * street to the target.
 */
function roadPath(from, to) {
  const avenue = nearestLine(AVENUES, from.y);
  const street = nearestLine(STREETS, from.x);
  const targetAvenue = nearestLine(AVENUES, to.y);
  const targetStreet = nearestLine(STREETS, to.x);
  return [
    { x: street, y: avenue },
    { x: targetStreet, y: avenue },
    { x: targetStreet, y: targetAvenue },
    { x: to.x, y: to.y },
  ];
}

/** Steer a car toward a waypoint: returns {throttle, steer}. */
function driveToward(car, waypoint) {
  const desired = Math.atan2(waypoint.y - car.y, waypoint.x - car.x);
  let diff = (desired - car.angle) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff <= -Math.PI) diff += Math.PI * 2;
  return {
    throttle: Math.abs(diff) > 0.9 ? 0.35 : 1,
    steer: clamp(diff * 2.5, -1, 1),
  };
}

function idleControls() {
  return { throttle: 0, steer: 0, moveX: 0, moveY: 0, enter: false, punch: false };
}

/**
 * Set `world` to the named scene (title, drive, mission or chase; any other
 * name is title) and return the screen to draw over it and the best score.
 */
export function stageShot(name, world, seed) {
  const random = createRandom((seed ?? 1) + 7);
  world.reset();
  const state = world.state;
  if (name !== 'drive' && name !== 'mission' && name !== 'chase') {
    for (let index = 0; index < TITLE_SECONDS / STEP; index += 1) world.step(STEP, idleControls(), true);
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'drive') {
    world.stage({ inCar: true });
    let waypoints = roadPath(state.player, { x: 1760, y: 1440 });
    for (let index = 0; index < DRIVE_SECONDS / STEP; index += 1) {
      const car = state.playerCar;
      if (car === null) break;
      if (waypoints.length === 0) {
        const target = {
          x: STREETS[Math.floor(random() * STREETS.length)],
          y: AVENUES[Math.floor(random() * AVENUES.length)],
        };
        waypoints = roadPath(car, target);
      }
      const waypoint = waypoints[0];
      if (Math.hypot(waypoint.x - car.x, waypoint.y - car.y) < 34) waypoints.shift();
      else {
        const controls = driveToward(car, waypoint);
        world.step(STEP, { ...controls, moveX: 0, moveY: 0, enter: false, punch: false }, false);
      }
    }
    return { screen: SCREEN_PLAY, best: state.cash };
  }

  if (name === 'mission') {
    // Mid-mission 1: the package is in hand, the motel is the marker, and the
    // player is driving up from the docks.
    world.stage({ inCar: true, missionIndex: 0, missionStage: 'deliver' });
    const car = state.playerCar;
    car.x = 480;
    car.y = 1320;
    car.angle = 0;
    state.player.x = car.x;
    state.player.y = car.y;
    let waypoints = roadPath(car, state.missionTarget);
    for (let index = 0; index < MISSION_SECONDS / STEP; index += 1) {
      const current = state.playerCar;
      if (current === null) break;
      if (waypoints.length === 0) waypoints = roadPath(current, state.missionTarget);
      const waypoint = waypoints[0];
      if (Math.hypot(waypoint.x - current.x, waypoint.y - current.y) < 34) waypoints.shift();
      else {
        const controls = driveToward(current, waypoint);
        world.step(STEP, { ...controls, moveX: 0, moveY: 0, enter: false, punch: false }, false);
      }
    }
    return { screen: SCREEN_PLAY, best: state.cash };
  }

  // Chase: the final mission, three stars, police closing in, cash already earned.
  world.stage({ inCar: true, missionIndex: 3, missionStage: 'deliver', wanted: 3, cash: 550 });
  const car = state.playerCar;
  car.x = 1120;
  car.y = 800;
  car.angle = 0;
  state.player.x = car.x;
  state.player.y = car.y;
  let waypoints = roadPath(car, { x: 480, y: 480 });
  for (let index = 0; index < CHASE_SECONDS / STEP; index += 1) {
    const current = state.playerCar;
    if (current === null) break;
    if (waypoints.length === 0) {
      const target = {
        x: STREETS[Math.floor(random() * STREETS.length)],
        y: AVENUES[Math.floor(random() * AVENUES.length)],
      };
      waypoints = roadPath(current, target);
    }
    const waypoint = waypoints[0];
    if (Math.hypot(waypoint.x - current.x, waypoint.y - current.y) < 34) waypoints.shift();
    else {
      const controls = driveToward(current, waypoint);
      world.step(STEP, { ...controls, moveX: 0, moveY: 0, enter: false, punch: false }, false);
    }
  }
  return { screen: SCREEN_PLAY, best: state.cash };
}
