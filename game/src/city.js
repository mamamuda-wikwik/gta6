// Neon Bay's layout: a road grid, the buildings inside its blocks, the palm trees
// along its sidewalks, the beach and ocean on the east edge, and the named places
// the missions use. Everything is placed from the seeded random, so the same seed
// always builds the same city. Nothing here draws or steps: it only describes.

import { BEACH, GRID, WORLD } from './config.js';

/** Avenue centre-lines (east-west roads) and street centre-lines (north-south). */
const AVENUES = [160, 480, 800, 1120, 1440];
const STREETS = [160, 480, 800, 1120, 1440, 1760, 2080];

/** The named places, each on a road or on the sand where a marker can stand. */
const PLACE_DEFS = [
  { id: 'safehouse', name: 'Safehouse', x: 480, y: 480 },
  { id: 'docks', name: 'Docks', x: 480, y: 1440 },
  { id: 'motel', name: 'Motel', x: 160, y: 160 },
  { id: 'dealership', name: 'Dealership', x: 1120, y: 480 },
  { id: 'chopshop', name: 'Chop Shop', x: 1760, y: 1440 },
  { id: 'beachbar', name: 'Beach Bar', x: 2340, y: 800 },
  { id: 'sprayshop', name: 'Spray Shop', x: 480, y: 1120 },
  { id: 'hospital', name: 'Hospital', x: 1440, y: 160 },
];

const BUILDING_COLORS = ['#3a3345', '#453b52', '#332e40', '#4b4258'];
const NEON_COLORS = ['#ff5da2', '#3ae0c8', '#ffd23e', '#7fb3ff'];

/** The park block: grass and palms, no building. */
const PARK_BLOCK = { street: 3, avenue: 2 };

export function buildCity(random) {
  const buildings = [];
  const palms = [];

  // One building per block, placed with a seeded offset inside the block.
  for (let avenue = 0; avenue < AVENUES.length - 1; avenue += 1) {
    for (let street = 0; street < STREETS.length - 1; street += 1) {
      const left = STREETS[street] + GRID.roadWidth / 2 + 14;
      const top = AVENUES[avenue] + GRID.roadWidth / 2 + 14;
      const right = STREETS[street + 1] - GRID.roadWidth / 2 - 14;
      const bottom = AVENUES[avenue + 1] - GRID.roadWidth / 2 - 14;
      if (street === PARK_BLOCK.street && avenue === PARK_BLOCK.avenue) continue;
      const width = 90 + random() * 70;
      const height = 70 + random() * 60;
      const x = left + random() * Math.max(1, right - left - width);
      const y = top + random() * Math.max(1, bottom - top - height);
      buildings.push({
        x,
        y,
        width,
        height,
        color: BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)],
        neon: NEON_COLORS[Math.floor(random() * NEON_COLORS.length)],
        sign: null,
      });
    }
  }

  // The south strip below the last avenue holds the docks building.
  buildings.push({
    x: 380, y: 1560, width: 200, height: 120,
    color: '#453b52', neon: '#3ae0c8', sign: 'DOCKS',
  });

  // Palm trees along the sidewalks and the beach.
  for (let index = 0; index < 46; index += 1) {
    const onStreet = random() < 0.5;
    if (onStreet) {
      const street = STREETS[Math.floor(random() * STREETS.length)];
      const avenue = AVENUES[Math.floor(random() * AVENUES.length)];
      palms.push({
        x: street + (random() < 0.5 ? -1 : 1) * (GRID.roadWidth / 2 + 12),
        y: avenue + (random() - 0.5) * 220,
      });
    } else {
      palms.push({ x: BEACH.sandFrom + 20 + random() * 120, y: 120 + random() * (WORLD.height - 240) });
    }
  }

  // The named places: each gets its own building beside its marker, with a sign.
  const places = {};
  for (const def of PLACE_DEFS) {
    const building = def.id === 'docks'
      ? buildings[buildings.length - 1]
      : {
          x: def.x + 70, y: def.y - 110, width: 150, height: 90,
          color: '#453b52', neon: NEON_COLORS[Math.floor(random() * NEON_COLORS.length)],
          sign: def.name.toUpperCase(),
        };
    if (def.id !== 'docks') buildings.push(building);
    places[def.id] = { id: def.id, name: def.name, x: def.x, y: def.y, building };
  }

  const intersections = [];
  for (const avenue of AVENUES) {
    for (const street of STREETS) intersections.push({ x: street, y: avenue });
  }

  return { buildings, palms, places, intersections, park: { x: 1182, y: 862, width: 196, height: 196 } };
}

/** True when the point is on a road (asphalt), not on a sidewalk or a block. */
export function onRoad(city, x, y) {
  const half = GRID.roadWidth / 2;
  for (const avenue of AVENUES) if (Math.abs(y - avenue) <= half) return true;
  for (const street of STREETS) if (Math.abs(x - street) <= half && x < BEACH.sandFrom) return true;
  return false;
}

/** The nearest intersection to a point, for the driving AI's waypoints. */
export function nearestIntersection(city, x, y) {
  let best = city.intersections[0];
  let bestDistance = Infinity;
  for (const point of city.intersections) {
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}

/**
 * Push a circle out of every solid thing: buildings, the ocean, and the world edge.
 * Returns true when anything pushed it, so callers can kill speed into a wall.
 */
export function pushOutOfSolids(city, body, radius) {
  let pushed = false;
  const minX = radius;
  const minY = radius;
  const maxX = WORLD.width - radius;
  const maxY = WORLD.height - radius;
  if (body.x < minX) { body.x = minX; pushed = true; }
  if (body.x > maxX) { body.x = maxX; pushed = true; }
  if (body.y < minY) { body.y = minY; pushed = true; }
  if (body.y > maxY) { body.y = maxY; pushed = true; }
  // The ocean is solid: the player cannot swim.
  if (body.x + radius > BEACH.waterFrom) { body.x = BEACH.waterFrom - radius; pushed = true; }
  for (const building of city.buildings) {
    const nearestX = Math.max(building.x, Math.min(body.x, building.x + building.width));
    const nearestY = Math.max(building.y, Math.min(body.y, building.y + building.height));
    const dx = body.x - nearestX;
    const dy = body.y - nearestY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= radius * radius) continue;
    pushed = true;
    if (distanceSquared === 0) {
      // Dead centre of a building (should not happen): shove it out to the left.
      body.x = building.x - radius;
      continue;
    }
    const distance = Math.sqrt(distanceSquared);
    body.x = nearestX + (dx / distance) * radius;
    body.y = nearestY + (dy / distance) * radius;
  }
  return pushed;
}
