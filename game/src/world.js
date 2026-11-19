// Neon Bay Nights — the game's rules and state, with no drawing and no browser
// in it: the player on foot and in a car, traffic, pedestrians, police, the
// wanted level, the four-mission story and the cash lying around the city.
// step() advances one fixed step and returns what happened as bit flags, so the
// caller can react without the world knowing about screens or sound. Nothing here
// allocates after createWorld returns, except the small mission target object.

import {
  BEACH, CAR, CASH_BAG, GRID, MISSIONS, PEDS, PLAYER, POLICE, STEP, TRAFFIC,
  WANTED, WORLD,
} from './config.js';
import { buildCity, nearestIntersection, onRoad, pushOutOfSolids } from './city.js';
import { createRandom } from './random.js';

export const EVENT_CASH = 1;
export const EVENT_HIT = 2;
export const EVENT_MISSION = 4;
export const EVENT_OVER = 8;
export const EVENT_WANTED = 16;
export const EVENT_RAM = 32;
export const EVENT_STORY = 64;

const TWO_PI = Math.PI * 2;

function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

/** The shortest turn from angle `from` to angle `to`, in (-PI, PI]. */
function angleDiff(from, to) {
  let diff = (to - from) % TWO_PI;
  if (diff > Math.PI) diff -= TWO_PI;
  if (diff <= -Math.PI) diff += TWO_PI;
  return diff;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);

  const player = {
    x: 0, y: 0, angle: 0, health: PLAYER.health,
    inCar: false, punchCooldown: 0, invulnerable: 0,
    lastDamageAt: -99, bustTimer: 0,
  };
  const cars = [];
  const peds = [];
  const cashBags = [];
  const state = {
    player, cars, peds, cashBags, city,
    cash: 0, score: 0, wanted: 0, wantedTimer: 0,
    missionIndex: 0, missionStage: 'pickup', missionTimer: 0,
    missionTarget: null, elapsed: 0, endReason: null,
    banner: null, toast: null, storyDone: false,
    playerCar: null, sportsCar: null,
  };

  /** A random point on a road centre-line, for spawning cars and cash. */
  function randomRoadPoint() {
    const avenueY = [160, 480, 800, 1120, 1440];
    const streetX = [160, 480, 800, 1120, 1440, 1760, 2080];
    if (random() < 0.5) {
      return { x: 120 + random() * (BEACH.sandFrom - 240), y: avenueY[Math.floor(random() * avenueY.length)] };
    }
    return { x: streetX[Math.floor(random() * streetX.length)], y: 120 + random() * (WORLD.height - 240) };
  }

  function makeCar(x, y, angle, color, kind) {
    return {
      x, y, angle, speed: 0, color, kind,
      health: CAR.health, occupied: false,
      ramCooldown: 0, target: null, axis: 'avenue', dir: 1, stuckTimer: 0,
    };
  }

  function reset() {
    player.x = city.places.safehouse.x;
    player.y = city.places.safehouse.y + 60;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.inCar = false;
    player.punchCooldown = 0;
    player.invulnerable = 0;
    player.lastDamageAt = -99;
    player.bustTimer = 0;
    state.cash = 0;
    state.score = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.missionIndex = 0;
    state.missionStage = 'pickup';
    state.missionTimer = 0;
    state.elapsed = 0;
    state.endReason = null;
    state.banner = { title: 'Mission 1: Dock Pickup', sub: 'Mara Quinn needs a package from the docks. Go get it.', until: 5 };
    state.toast = null;
    state.storyDone = false;
    state.playerCar = null;

    cars.length = 0;
    // The sports car at the dealership, and two ordinary parked cars to steal.
    const sports = makeCar(city.places.dealership.x, city.places.dealership.y + 60, 0, '#ff2e4d', 'sports');
    state.sportsCar = sports;
    cars.push(sports);
    cars.push(makeCar(800, 1120 + 30, 0, '#e8b23e', 'parked'));
    cars.push(makeCar(1760, 800 - 30, Math.PI, '#7fb3d5', 'parked'));
    for (let index = 0; index < TRAFFIC.count; index += 1) {
      const point = randomRoadPoint();
      const car = makeCar(point.x, point.y, 0, '#7fb3d5', 'traffic');
      car.speed = TRAFFIC.speed + (random() - 0.5) * TRAFFIC.speedJitter;
      car.axis = random() < 0.5 ? 'avenue' : 'street';
      car.dir = random() < 0.5 ? 1 : -1;
      car.angle = car.axis === 'avenue' ? (car.dir === 1 ? 0 : Math.PI) : (car.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
      car.target = nearestIntersection(city, point.x, point.y);
      cars.push(car);
    }
    peds.length = 0;
    for (let index = 0; index < PEDS.count; index += 1) {
      const point = randomRoadPoint();
      peds.push({
        x: point.x + (random() - 0.5) * 40,
        y: point.y + (random() - 0.5) * 40,
        angle: random() * TWO_PI,
        speed: PEDS.speed + (random() - 0.5) * PEDS.speedJitter,
        downTimer: 0, retarget: 1 + random() * 4,
      });
    }
    cashBags.length = 0;
    for (let index = 0; index < CASH_BAG.count; index += 1) {
      const point = randomRoadPoint();
      cashBags.push({ x: point.x, y: point.y, taken: false });
    }
    updateMissionTarget();
  }

  /** Where the current mission wants the player, and what it is called. */
  function updateMissionTarget() {
    const places = city.places;
    const index = state.missionIndex;
    if (index >= MISSIONS.length) {
      state.missionTarget = null;
      return;
    }
    if (index === 0) {
      state.missionTarget = state.missionStage === 'pickup'
        ? { x: places.docks.x, y: places.docks.y, label: 'Pick up the package at the Docks' }
        : { x: places.motel.x, y: places.motel.y, label: 'Deliver the package to the Motel' };
    } else if (index === 1) {
      state.missionTarget = state.missionStage === 'pickup'
        ? { x: places.dealership.x, y: places.dealership.y, label: 'Steal the red sports car at the Dealership' }
        : { x: places.chopshop.x, y: places.chopshop.y, label: 'Deliver the car to the Chop Shop' };
    } else if (index === 2) {
      state.missionTarget = state.missionStage === 'pickup'
        ? { x: places.beachbar.x, y: places.beachbar.y, label: 'Pick up the parcel at the Beach Bar' }
        : { x: places.safehouse.x, y: places.safehouse.y, label: 'Deliver it to the Safehouse — fast!' };
    } else {
      state.missionTarget = { x: places.safehouse.x, y: places.safehouse.y, label: 'Lose the cops and reach the Safehouse' };
    }
  }

  function showBanner(title, sub, seconds) {
    state.banner = { title, sub, until: state.elapsed + seconds };
  }

  function showToast(text, seconds) {
    state.toast = { text, until: state.elapsed + seconds };
  }

  function addWanted(stars) {
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + stars);
    if (state.wanted > before) {
      state.wantedTimer = 0;
      return EVENT_WANTED;
    }
    return 0;
  }

  /** Drive one car one step from a throttle (-1..1) and a steering input (-1..1). */
  function driveCar(car, dt, throttle, steer) {
    if (throttle > 0) car.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 10) car.speed -= CAR.brake * dt;
      else car.speed += CAR.reverseAccel * throttle * dt;
    }
    car.speed -= car.speed * CAR.drag * dt;
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const turning = car.speed >= 0 ? 1 : -1;
    car.angle += steer * CAR.turnRate * turning * clamp(Math.abs(car.speed) / 220, 0, 1) * dt;
    const beforeX = car.x;
    const beforeY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const crashed = pushOutOfSolids(city, car, CAR.width / 2 + 4);
    if (crashed) {
      const hitSpeed = Math.abs(car.speed);
      car.speed *= 0.4;
      // Sliding along a wall keeps most of the motion: only a hard hit hurts.
      if (hitSpeed > 350 && car === state.playerCar) {
        car.health -= 5;
        return 'crash';
      }
      // If the car barely moved, it is wedged: back it out a touch.
      if (distance(beforeX, beforeY, car.x, car.y) < 0.5) {
        car.x = beforeX - Math.cos(car.angle) * 6;
        car.y = beforeY - Math.sin(car.angle) * 6;
      }
    }
    return null;
  }

  function stepTraffic(dt) {
    for (const car of cars) {
      if (car.kind !== 'traffic') continue;
      const target = car.target;
      const wanted = angleTo(car.x, car.y, target.x, target.y);
      const turn = clamp(angleDiff(car.angle, wanted) * 2.2, -1, 1);
      // Slow down for a car ahead on the same road.
      let blocked = false;
      for (const other of cars) {
        if (other === car || other.kind === 'parked' || other.kind === 'sports') continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (ahead > 0 && ahead < 58 && side < 30) { blocked = true; break; }
      }
      const cruise = blocked ? 0 : TRAFFIC.speed + (car.speed - TRAFFIC.speed) * 0.2;
      car.speed += (cruise - car.speed) * Math.min(1, dt * 2);
      car.angle += turn * 2.4 * dt;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      pushOutOfSolids(city, car, CAR.width / 2 + 4);
      if (distance(car.x, car.y, target.x, target.y) < 26) {
        // At an intersection: mostly keep going, sometimes turn onto the crossing road.
        const straight = random() < 0.7;
        if (car.axis === 'avenue') {
          const nextX = target.x + car.dir * GRID.spacing;
          if (straight && nextX > 60 && nextX < BEACH.sandFrom - 60) {
            car.target = { x: nextX, y: target.y };
          } else {
            car.axis = 'street';
            car.dir = random() < 0.5 ? 1 : -1;
            const nextY = target.y + car.dir * GRID.spacing;
            car.target = { x: target.x, y: clamp(nextY, 60, WORLD.height - 60) };
          }
        } else {
          const nextY = target.y + car.dir * GRID.spacing;
          if (straight && nextY > 60 && nextY < WORLD.height - 60) {
            car.target = { x: target.x, y: nextY };
          } else {
            car.axis = 'avenue';
            car.dir = random() < 0.5 ? 1 : -1;
            const nextX = target.x + car.dir * GRID.spacing;
            car.target = { x: clamp(nextX, 60, BEACH.sandFrom - 60), y: target.y };
          }
        }
      }
    }
  }

  function stepPeds(dt) {
    for (const ped of peds) {
      if (ped.downTimer > 0) {
        ped.downTimer -= dt;
        continue;
      }
      ped.retarget -= dt;
      if (ped.retarget <= 0) {
        ped.angle = random() * TWO_PI;
        ped.retarget = 2 + random() * 4;
      }
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (pushOutOfSolids(city, ped, 12)) ped.angle += Math.PI / 2;
      if (ped.x < 20 || ped.x > WORLD.width - 20 || ped.y < 20 || ped.y > WORLD.height - 20) {
        ped.angle += Math.PI;
      }
    }
  }

  function policeCount() {
    let count = 0;
    for (const car of cars) if (car.kind === 'police') count += 1;
    return count;
  }

  function spawnPolice() {
    const point = randomRoadPoint();
    if (distance(point.x, point.y, player.x, player.y) < 380) return;
    const car = makeCar(point.x, point.y, 0, '#2f6fd0', 'police');
    car.speed = POLICE.speed;
    cars.push(car);
  }

  function stepPolice(dt) {
    const wanted = state.wanted;
    while (policeCount() < wanted) spawnPolice();
    while (policeCount() > wanted) {
      for (let index = cars.length - 1; index >= 0; index -= 1) {
        if (cars[index].kind === 'police') { cars.splice(index, 1); break; }
      }
    }
    for (const car of cars) {
      if (car.kind !== 'police') continue;
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      const target = player.inCar && state.playerCar ? state.playerCar : player;
      const dist = distance(car.x, car.y, target.x, target.y);
      // Chase on the roads toward the player's nearest intersection; ram head-on when close.
      const goal = dist > 260 ? nearestIntersection(city, target.x, target.y) : target;
      const wantedAngle = angleTo(car.x, car.y, goal.x, goal.y);
      const turn = clamp(angleDiff(car.angle, wantedAngle) * 2.4, -1, 1);
      // A cop pulling up to an on-foot player slows down and stops beside them
      // to make the arrest — at full speed it would only ever drive past.
      const closeOnFoot = !player.inCar && dist < 90;
      const cruise = closeOnFoot ? (dist < 45 ? 0 : 90) : POLICE.speed;
      car.speed += (cruise - car.speed) * Math.min(1, dt * 3);
      car.angle += turn * 3.1 * dt;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (pushOutOfSolids(city, car, CAR.width / 2 + 4)) car.speed *= 0.6;
      // A cop sitting next to its target is engaging, not stuck: only a cop
      // crawling far from the player can be wedged against a building.
      if (Math.abs(car.speed) < 25 && dist > 100) {
        car.stuckTimer += dt;
        if (car.stuckTimer > 2) {
          const point = randomRoadPoint();
          car.x = point.x;
          car.y = point.y;
          car.stuckTimer = 0;
        }
      } else {
        car.stuckTimer = 0;
      }
    }
  }

  function stepPlayer(dt, controls) {
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.inCar) {
      const car = state.playerCar;
      const result = driveCar(car, dt, controls.throttle, controls.steer);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      if (result === 'crash') return EVENT_HIT;
      if (car.health <= 0) {
        state.endReason = 'busted';
        return EVENT_OVER;
      }
      if (controls.enter && Math.abs(car.speed) < 40) {
        // Step out beside the car.
        player.inCar = false;
        state.playerCar = null;
        car.occupied = false;
        car.kind = car === state.sportsCar ? 'sports' : 'parked';
        player.x = car.x - Math.sin(car.angle) * 44;
        player.y = car.y + Math.cos(car.angle) * 44;
        pushOutOfSolids(city, player, PLAYER.radius);
      }
      return 0;
    }
    // On foot: eight-way movement, punch, and stealing a parked car.
    const magnitude = Math.hypot(controls.moveX, controls.moveY);
    if (magnitude > 0) {
      const nx = controls.moveX / magnitude;
      const ny = controls.moveY / magnitude;
      player.x += nx * PLAYER.walkSpeed * dt;
      player.y += ny * PLAYER.walkSpeed * dt;
      player.angle = Math.atan2(ny, nx);
      pushOutOfSolids(city, player, PLAYER.radius);
    }
    if (controls.punch && player.punchCooldown <= 0) {
      player.punchCooldown = PLAYER.punchCooldown;
      let hit = null;
      for (const ped of peds) {
        if (ped.downTimer > 0) continue;
        const dist = distance(player.x, player.y, ped.x, ped.y);
        if (dist < PLAYER.punchRange && Math.abs(angleDiff(player.angle, angleTo(player.x, player.y, ped.x, ped.y))) < 1.1) {
          hit = ped;
          break;
        }
      }
      if (hit !== null) {
        hit.downTimer = 3;
        state.cash += 10;
        state.score = state.cash;
        return EVENT_CASH | addWanted(1);
      }
    }
    if (controls.enter) {
      let nearest = null;
      let nearestDist = CAR.enterRange;
      for (const car of cars) {
        if (car.kind !== 'parked' && car.kind !== 'sports') continue;
        if (car.occupied) continue;
        const dist = distance(player.x, player.y, car.x, car.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = car;
        }
      }
      if (nearest !== null) {
        player.inCar = true;
        state.playerCar = nearest;
        nearest.occupied = true;
        nearest.kind = 'player';
        let events = 0;
        if (nearest === state.sportsCar) {
          events |= addWanted(1);
          showToast('Stolen! The cops are coming.', 3);
        } else {
          events |= addWanted(1);
          showToast('Car stolen — that adds a star.', 3);
        }
        // Mission 2 advances the moment the sports car is stolen.
        if (nearest === state.sportsCar && state.missionIndex === 1 && state.missionStage === 'pickup') {
          state.missionStage = 'deliver';
          updateMissionTarget();
          showBanner('Mission 2: Hot Wheels', 'Get the car to the Chop Shop — and lose the cops.', 4);
        }
        return events;
      }
    }
    return 0;
  }

  function stepCollisions(dt) {
    let events = 0;
    const body = player.inCar && state.playerCar ? state.playerCar : player;
    // Traffic hitting the player on foot hurts; hitting the player's car dents it.
    for (const car of cars) {
      if (car.kind !== 'traffic') continue;
      const dist = distance(car.x, car.y, body.x, body.y);
      if (dist > 46) continue;
      if (player.inCar) {
        if (car.speed > 60 && player.invulnerable <= 0) {
          state.playerCar.health -= 6;
          player.invulnerable = 1;
          events |= EVENT_HIT;
        }
      } else if (player.invulnerable <= 0 && car.speed > 40) {
        player.health -= 25;
        player.invulnerable = 1;
        player.lastDamageAt = state.elapsed;
        // Knock the player away from the car.
        const away = angleTo(car.x, car.y, player.x, player.y);
        player.x += Math.cos(away) * 30;
        player.y += Math.sin(away) * 30;
        pushOutOfSolids(city, player, PLAYER.radius);
        events |= EVENT_HIT;
        if (player.health <= 0) {
          state.endReason = 'wasted';
          events |= EVENT_OVER;
        }
      }
      // Nudge traffic off the player so it does not sit on top of them.
      const push = angleTo(body.x, body.y, car.x, car.y);
      car.x += Math.cos(push) * 2;
      car.y += Math.sin(push) * 2;
    }
    // Police rams and busts.
    for (const car of cars) {
      if (car.kind !== 'police') continue;
      const dist = distance(car.x, car.y, body.x, body.y);
      if (player.inCar) {
        if (dist < 48 && car.ramCooldown <= 0) {
          car.ramCooldown = POLICE.ramCooldown;
          state.playerCar.health -= POLICE.ramDamage;
          const away = angleTo(car.x, car.y, state.playerCar.x, state.playerCar.y);
          state.playerCar.x += Math.cos(away) * 14;
          state.playerCar.y += Math.sin(away) * 14;
          events |= EVENT_RAM;
          if (state.playerCar.health <= 0) {
            state.endReason = 'busted';
            events |= EVENT_OVER;
          }
        }
      } else if (dist < 40) {
        player.bustTimer += dt;
        if (player.bustTimer >= POLICE.bustSeconds) {
          state.endReason = 'busted';
          events |= EVENT_OVER;
        }
      } else {
        player.bustTimer = Math.max(0, player.bustTimer - dt * 2);
      }
    }
    return events;
  }

  function stepMissions(dt) {
    let events = 0;
    if (state.missionIndex >= MISSIONS.length) return 0;
    const target = state.missionTarget;
    if (target === null) return 0;
    const body = player.inCar && state.playerCar ? state.playerCar : player;
    // Mission 3's delivery leg is timed.
    if (state.missionIndex === 2 && state.missionStage === 'deliver') {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        state.missionStage = 'pickup';
        updateMissionTarget();
        showToast('Too slow — the buyer walked away. Pick it up again.', 4);
        return 0;
      }
    }
    if (distance(body.x, body.y, target.x, target.y) > 55) return 0;
    // Mission 2's pickup is the theft itself, not reaching the marker — and if
    // the player is already driving the sports car when the mission starts, the
    // theft already happened.
    if (state.missionIndex === 1 && state.missionStage === 'pickup') {
      if (player.inCar && state.playerCar === state.sportsCar) {
        state.missionStage = 'deliver';
        updateMissionTarget();
        showBanner('Mission 2: Hot Wheels', 'Get the car to the Chop Shop — and lose the cops.', 4);
      }
      return 0;
    }
    const mission = MISSIONS[state.missionIndex];
    if (state.missionStage === 'pickup') {
      state.missionStage = 'deliver';
      if (state.missionIndex === 2) state.missionTimer = mission.timeLimit;
      updateMissionTarget();
      if (state.missionIndex === 0) showBanner('Package secured', 'Take it to the Motel.', 3);
      if (state.missionIndex === 2) showBanner('Beach Run', 'Deliver it to the Safehouse — 75 seconds!', 3);
      return 0;
    }
    // Delivery reached: pay out and move to the next mission.
    state.cash += mission.pay;
    state.score = state.cash;
    events |= EVENT_MISSION;
    state.missionIndex += 1;
    if (state.missionIndex >= MISSIONS.length) {
      state.storyDone = true;
      showBanner('Story complete', 'Neon Bay is yours, Rico.', 5);
      return events | EVENT_STORY;
    }
    state.missionStage = 'pickup';
    updateMissionTarget();
    const next = MISSIONS[state.missionIndex];
    if (state.missionIndex === 1) showBanner('Mission 2: Hot Wheels', 'Steal the red sports car at the Dealership.', 4);
    if (state.missionIndex === 2) showBanner('Mission 3: Beach Run', 'Pick up the parcel at the Beach Bar.', 4);
    if (state.missionIndex === 3) {
      showBanner('Mission 4: The Getaway', 'Three stars. Lose the cops and reach the Safehouse.', 4);
      events |= addWanted(3 - state.wanted);
    }
    return events;
  }

  function stepCashBags() {
    let events = 0;
    const body = player.inCar && state.playerCar ? state.playerCar : player;
    for (const bag of cashBags) {
      if (bag.taken) continue;
      if (distance(body.x, body.y, bag.x, bag.y) < 44) {
        bag.taken = true;
        state.cash += CASH_BAG.value;
        state.score = state.cash;
        events |= EVENT_CASH;
      }
    }
    return events;
  }

  function stepWanted(dt) {
    if (state.wanted === 0) return;
    let nearest = Infinity;
    for (const car of cars) {
      if (car.kind !== 'police') continue;
      nearest = Math.min(nearest, distance(car.x, car.y, player.x, player.y));
    }
    // The spray shop scrubs the wanted level for cash.
    const shop = city.places.sprayshop;
    if (distance(player.x, player.y, shop.x, shop.y) < 60 && state.cash >= WANTED.sprayShopCost) {
      state.cash -= WANTED.sprayShopCost;
      state.score = state.cash;
      state.wanted = 0;
      state.wantedTimer = 0;
      showToast('Clean ride — the heat is off.', 3);
      return;
    }
    if (nearest > WANTED.policeNear) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        showToast('The heat is cooling off.', 2);
      }
    } else {
      state.wantedTimer = 0;
    }
  }

  /**
   * One fixed step. `controls` carries throttle (-1..1), steer (-1..1), moveX/moveY
   * (-1..1 each) and the edge-triggered enter/punch presses. With `harmless` set
   * (the title screen's backdrop) traffic and pedestrians move but nothing touches
   * the player and nothing scores.
   */
  function step(dt, controls, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.banner !== null && state.elapsed > state.banner.until) state.banner = null;
    if (state.toast !== null && state.elapsed > state.toast.until) state.toast = null;

    stepTraffic(dt);
    stepPeds(dt);
    if (harmless) return 0;

    events |= stepPlayer(dt, controls);
    if (events & EVENT_OVER) return events;
    stepPolice(dt);
    events |= stepCollisions(dt);
    if (events & EVENT_OVER) return events;
    events |= stepMissions(dt);
    if (events & EVENT_OVER) return events;
    events |= stepCashBags();
    stepWanted(dt);

    // Slow health regen after a while without damage.
    if (!player.inCar && player.health < PLAYER.health && state.elapsed - player.lastDamageAt > PLAYER.regenDelay) {
      player.health = Math.min(PLAYER.health, player.health + PLAYER.regenRate * dt);
    }
    return events;
  }

  /**
   * Stage a scene for a screenshot: put the player in a car, jump the story to a
   * mission and stage, or set the wanted level. Every state it sets is one real
   * play can reach, so the frame is what a short game really looks like.
   */
  function stage(options) {
    if (options.missionIndex !== undefined) state.missionIndex = options.missionIndex;
    if (options.missionStage !== undefined) state.missionStage = options.missionStage;
    if (options.wanted !== undefined) state.wanted = options.wanted;
    if (options.missionTimer !== undefined) state.missionTimer = options.missionTimer;
    updateMissionTarget();
    if (options.inCar) {
      const car = options.car ?? state.sportsCar;
      player.inCar = true;
      state.playerCar = car;
      car.occupied = true;
      car.kind = 'player';
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
    }
    if (options.cash !== undefined) {
      state.cash = options.cash;
      state.score = options.cash;
    }
  }

  reset();
  return { state, city, reset, step, stage };
}
