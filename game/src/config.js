// Neon Bay Nights — every tuning number and colour in one place.
// The world is a fixed 2560x1800 city; the camera shows a 1280x720 window of it,
// scaled to fit the browser window, so no rule below depends on the screen size.
export const WORLD = { width: 2560, height: 1800 };

/** The road grid: avenues run east-west, streets north-south, every 320 px. */
export const GRID = { spacing: 320, roadWidth: 96, sidewalk: 26 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The beach and ocean strip along the east edge of the city. */
export const BEACH = { sandFrom: 2280, waterFrom: 2430 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  punchRange: 46,
  punchCooldown: 0.45,
  health: 100,
  regenDelay: 8,
  regenRate: 6,
};

export const CAR = {
  length: 54,
  width: 28,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 180,
  turnRate: 2.9,
  drag: 0.55,
  health: 100,
  enterRange: 70,
};

/** Traffic cars cruise the roads; police cars are faster and chase the player. */
export const TRAFFIC = { count: 10, speed: 150, speedJitter: 40 };
export const POLICE = { count: 3, speed: 330, ramDamage: 16, ramCooldown: 0.6, bustSeconds: 0.9 };
export const PEDS = { count: 14, speed: 55, speedJitter: 25 };

/** Wanted stars: 0 to 3. One star per crime, decay when no police is near. */
export const WANTED = { max: 3, decaySeconds: 6, policeNear: 620, sprayShopCost: 150 };

/** Cash bags lying around the city, and what each mission pays. */
export const CASH_BAG = { count: 8, value: 25 };
export const MISSIONS = [
  { id: 1, name: 'Dock Pickup', pay: 200, timeLimit: 0 },
  { id: 2, name: 'Hot Wheels', pay: 350, timeLimit: 0 },
  { id: 3, name: 'Beach Run', pay: 400, timeLimit: 75 },
  { id: 4, name: 'The Getaway', pay: 500, timeLimit: 0 },
];

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-bay-nights.best';

/** Sunset palette: a sun-soaked coastal city at golden hour. */
export const PALETTE = {
  backdrop: '#17101f',
  asphalt: '#2b2f3a',
  asphaltLine: '#c9a227',
  sidewalk: '#4a4238',
  sand: '#e8c98a',
  water: '#1d6f8e',
  waterDeep: '#155a75',
  grass: '#3f7a4a',
  building: '#3a3345',
  buildingRoof: '#4b4258',
  buildingNeon: '#ff5da2',
  buildingNeon2: '#3ae0c8',
  palm: '#2f8f4e',
  palmTrunk: '#7a5a3a',
  player: '#ffd23e',
  playerCar: '#ff5da2',
  trafficCar: '#7fb3d5',
  policeCar: '#2f6fd0',
  policeLightRed: '#ff2e4d',
  policeLightBlue: '#2e9bff',
  ped: '#e8e0d0',
  marker: '#3ae0c8',
  markerRing: '#ffd23e',
  text: '#f5efe4',
  muted: '#b8a894',
  panel: '#221a2e',
  danger: '#ff2e4d',
  star: '#ffd23e',
  minimapRoad: '#5a6274',
  minimapBg: '#1c1626',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
