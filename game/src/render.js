// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player through the city and shows a 1280x720 window of it,
// scaled to fit the browser window. The HUD (cash, wanted stars, health, mission
// objective, minimap) is drawn in screen space so it always reads clearly.

import { BEACH, CAR, GRID, PLAYER, WORLD } from './config.js';
import { PALETTE, FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_STORY = 'story';

const VIEW = { width: 1280, height: 720 };
const MINIMAP = { width: 230, height: 162, margin: 16 };
const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };

const AVENUES = [160, 480, 800, 1120, 1440];
const STREETS = [160, 480, 800, 1120, 1440, 1760, 2080];

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cashLabel = cachedLabel('$');
  const bestLabel = cachedLabel('Best $');
  const finalLabel = cachedLabel('Cash $');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function cameraFor(state) {
    const player = state.player;
    const x = Math.max(VIEW.width / 2, Math.min(WORLD.width - VIEW.width / 2, player.x));
    const y = Math.max(VIEW.height / 2, Math.min(WORLD.height - VIEW.height / 2, player.y));
    return { x: x - VIEW.width / 2, y: y - VIEW.height / 2 };
  }

  function drawGround(state, camera) {
    const city = state.city;
    // Sidewalk-coloured base, then the roads, the park, the beach and the ocean.
    context.fillStyle = PALETTE.sidewalk;
    context.fillRect(camera.x, camera.y, VIEW.width, VIEW.height);
    context.fillStyle = PALETTE.grass;
    context.fillRect(city.park.x, city.park.y, city.park.width, city.park.height);
    context.fillStyle = PALETTE.sand;
    context.fillRect(BEACH.sandFrom, 0, BEACH.waterFrom - BEACH.sandFrom, WORLD.height);
    context.fillStyle = PALETTE.water;
    context.fillRect(BEACH.waterFrom, 0, WORLD.width - BEACH.waterFrom, WORLD.height);
    context.fillStyle = PALETTE.waterDeep;
    for (let y = 120; y < WORLD.height; y += 240) {
      context.fillRect(BEACH.waterFrom + 30, y, WORLD.width - BEACH.waterFrom - 60, 8);
    }
    // Asphalt roads.
    context.fillStyle = PALETTE.asphalt;
    for (const avenue of AVENUES) {
      context.fillRect(0, avenue - GRID.roadWidth / 2, BEACH.sandFrom, GRID.roadWidth);
    }
    for (const street of STREETS) {
      context.fillRect(street - GRID.roadWidth / 2, 0, GRID.roadWidth, WORLD.height);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.asphaltLine;
    for (const avenue of AVENUES) {
      for (let x = 20; x < BEACH.sandFrom; x += 80) context.fillRect(x, avenue - 2, 40, 4);
    }
    for (const street of STREETS) {
      for (let y = 20; y < WORLD.height; y += 80) context.fillRect(street - 2, y, 4, 40);
    }
  }

  function inView(camera, x, y, margin) {
    return x > camera.x - margin && x < camera.x + VIEW.width + margin
      && y > camera.y - margin && y < camera.y + VIEW.height + margin;
  }

  function drawCity(state, camera) {
    const city = state.city;
    for (const building of city.buildings) {
      if (!inView(camera, building.x + building.width / 2, building.y + building.height / 2, 120)) continue;
      context.fillStyle = building.color;
      context.fillRect(building.x, building.y, building.width, building.height);
      context.fillStyle = PALETTE.buildingRoof;
      context.fillRect(building.x + 8, building.y + 8, building.width - 16, building.height - 16);
      context.fillStyle = building.neon;
      context.fillRect(building.x, building.y, building.width, 6);
      if (building.sign !== null) {
        text(building.sign, building.x + building.width / 2, building.y + building.height / 2 + 7, 18, building.neon, 'center');
      }
    }
    for (const palm of city.palms) {
      if (!inView(camera, palm.x, palm.y, 30)) continue;
      context.strokeStyle = PALETTE.palmTrunk;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(palm.x, palm.y);
      context.lineTo(palm.x + 4, palm.y - 14);
      context.stroke();
      context.fillStyle = PALETTE.palm;
      context.beginPath();
      context.arc(palm.x + 4, palm.y - 18, 13, 0, Math.PI * 2);
      context.fill();
    }
    // The mission marker: a pulsing ring with a diamond, and its name — the name
    // stays inside the camera's view so it never clips at a screen edge.
    const target = state.missionTarget;
    if (target !== null) {
      const pulse = 1 + Math.sin(state.elapsed * 4) * 0.12;
      context.strokeStyle = PALETTE.marker;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = PALETTE.markerRing;
      context.save();
      context.translate(target.x, target.y);
      context.rotate(Math.PI / 4);
      context.fillRect(-9, -9, 18, 18);
      context.restore();
      // The label is about 340 px wide at this size, so its centre stays 200 px
      // inside the view: the whole line reads, even at a screen edge.
      const labelX = Math.max(camera.x + 200, Math.min(camera.x + VIEW.width - 200, target.x));
      text(target.label, labelX, target.y - 48, 18, PALETTE.marker, 'center');
    }
    for (const bag of state.cashBags) {
      if (bag.taken || !inView(camera, bag.x, bag.y, 30)) continue;
      context.fillStyle = PALETTE.star;
      context.beginPath();
      context.arc(bag.x, bag.y, 10, 0, Math.PI * 2);
      context.fill();
      text('$', bag.x, bag.y + 5, 14, '#17101f', 'center');
    }
  }

  function drawCar(car, flashing) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const halfLength = CAR.length / 2;
    const halfWidth = CAR.width / 2;
    context.fillStyle = car.color;
    context.fillRect(-halfLength, -halfWidth, CAR.length, CAR.width);
    context.fillStyle = 'rgba(20, 24, 34, 0.85)';
    context.fillRect(-halfLength + 12, -halfWidth + 5, 16, CAR.width - 10);
    context.fillStyle = '#ffd23e';
    context.fillRect(halfLength - 4, -halfWidth + 3, 3, 6);
    context.fillRect(halfLength - 4, halfWidth - 9, 3, 6);
    if (car.kind === 'police' && flashing) {
      const red = Math.floor(stateTime() * 6) % 2 === 0;
      context.fillStyle = red ? PALETTE.policeLightRed : PALETTE.policeLightBlue;
      context.fillRect(-6, -halfWidth - 4, 12, 5);
      context.fillStyle = red ? PALETTE.policeLightBlue : PALETTE.policeLightRed;
      context.fillRect(-6, halfWidth - 1, 12, 5);
    }
    context.restore();
  }

  // The flashing lights need the world's clock; it is set on every draw.
  let clock = 0;
  function stateTime() {
    return clock;
  }

  function drawEntities(state, camera) {
    for (const car of state.cars) {
      if (!inView(camera, car.x, car.y, 80)) continue;
      drawCar(car, true);
    }
    for (const ped of state.peds) {
      if (!inView(camera, ped.x, ped.y, 30)) continue;
      if (ped.downTimer > 0) {
        context.fillStyle = PALETTE.danger;
        context.beginPath();
        context.arc(ped.x, ped.y, 10, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = PALETTE.ped;
      context.beginPath();
      context.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2b2f3a';
      context.beginPath();
      context.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 4, 0, Math.PI * 2);
      context.fill();
    }
    const player = state.player;
    if (!player.inCar) {
      // Blink while invulnerable after a hit.
      if (player.invulnerable <= 0 || Math.floor(player.invulnerable * 10) % 2 === 1) {
        context.fillStyle = PALETTE.player;
        context.beginPath();
        context.arc(player.x, player.y, PLAYER.radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#17101f';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(player.x, player.y);
        context.lineTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
        context.stroke();
      }
    }
  }

  function drawMinimap(state) {
    const x0 = VIEW.width - MINIMAP.width - MINIMAP.margin;
    const y0 = MINIMAP.margin;
    const scaleX = MINIMAP.width / WORLD.width;
    const scaleY = MINIMAP.height / WORLD.height;
    context.fillStyle = 'rgba(28, 22, 38, 0.88)';
    context.fillRect(x0 - 4, y0 - 4, MINIMAP.width + 8, MINIMAP.height + 8);
    context.fillStyle = PALETTE.minimapBg;
    context.fillRect(x0, y0, MINIMAP.width, MINIMAP.height);
    context.strokeStyle = PALETTE.minimapRoad;
    context.lineWidth = 2;
    for (const avenue of AVENUES) {
      context.beginPath();
      context.moveTo(x0, y0 + avenue * scaleY);
      context.lineTo(x0 + MINIMAP.width, y0 + avenue * scaleY);
      context.stroke();
    }
    for (const street of STREETS) {
      context.beginPath();
      context.moveTo(x0 + street * scaleX, y0);
      context.lineTo(x0 + street * scaleX, y0 + MINIMAP.height);
      context.stroke();
    }
    context.fillStyle = PALETTE.water;
    context.fillRect(x0 + BEACH.waterFrom * scaleX, y0, MINIMAP.width - BEACH.waterFrom * scaleX, MINIMAP.height);
    for (const car of state.cars) {
      if (car.kind === 'traffic') continue;
      context.fillStyle = car.kind === 'police' ? PALETTE.policeLightBlue : '#ffffff';
      context.fillRect(x0 + car.x * scaleX - 2, y0 + car.y * scaleY - 2, 4, 4);
    }
    const target = state.missionTarget;
    if (target !== null) {
      context.fillStyle = PALETTE.marker;
      context.save();
      context.translate(x0 + target.x * scaleX, y0 + target.y * scaleY);
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x0 + state.player.x * scaleX, y0 + state.player.y * scaleY, 5, 0, Math.PI * 2);
    context.fill();
  }

  function drawHud(state, camera) {
    context.textBaseline = 'top';
    // Cash, top left.
    context.fillStyle = 'rgba(23, 16, 31, 0.72)';
    context.fillRect(12, 12, 190, 44);
    text(cashLabel(state.cash), 24, 20, 28, PALETTE.star, 'left');
    // Wanted stars, top centre.
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(3 - state.wanted);
    text(stars, VIEW.width / 2, 16, 30, state.wanted > 0 ? PALETTE.danger : PALETTE.muted, 'center');
    if (state.wanted > 0) text('WANTED', VIEW.width / 2, 48, 14, PALETTE.danger, 'center');
    // Health bar, under the cash.
    const barWidth = 170;
    const barX = 22;
    const barY = 64;
    context.fillStyle = 'rgba(23, 16, 31, 0.72)';
    context.fillRect(barX - 4, barY - 4, barWidth + 8, 16);
    context.fillStyle = '#3a3345';
    context.fillRect(barX, barY, barWidth, 8);
    context.fillStyle = state.player.health > 30 ? '#3ae0c8' : PALETTE.danger;
    context.fillRect(barX, barY, barWidth * Math.max(0, state.player.health) / 100, 8);
    // The player's car takes damage too: show its bar while driving.
    if (state.player.inCar && state.playerCar !== null) {
      const car = state.playerCar;
      context.fillStyle = 'rgba(23, 16, 31, 0.72)';
      context.fillRect(barX - 4, barY + 16, barWidth + 8, 16);
      context.fillStyle = '#3a3345';
      context.fillRect(barX, barY + 20, barWidth, 8);
      context.fillStyle = car.health > 30 ? PALETTE.playerCar : PALETTE.danger;
      context.fillRect(barX, barY + 20, barWidth * Math.max(0, car.health) / 100, 8);
    }
    // Mission objective, bottom left, with the distance to its marker.
    const target = state.missionTarget;
    if (target !== null) {
      const dist = Math.round(Math.hypot(target.x - state.player.x, target.y - state.player.y));
      context.fillStyle = 'rgba(23, 16, 31, 0.72)';
      context.fillRect(12, VIEW.height - 56, 560, 44);
      text(`◆ ${target.label}  ·  ${dist}m`, 24, VIEW.height - 46, 20, PALETTE.marker, 'left');
      if (state.missionIndex === 2 && state.missionStage === 'deliver') {
        text(`${Math.max(0, Math.ceil(state.missionTimer))}s`, 560, VIEW.height - 46, 20, PALETTE.danger, 'right');
      }
    }
    // Controls hint, bottom right.
    text('WASD drive / walk · E enter car · Space punch · P pause · M sound', VIEW.width - 16, VIEW.height - 30, 15, PALETTE.muted, 'right');
    drawMinimap(state);
    // A compass arrow at the screen edge when the marker is off-screen.
    if (target !== null) {
      const screenX = (target.x - camera.x) * 1;
      const screenY = (target.y - camera.y) * 1;
      if (screenX < 40 || screenX > VIEW.width - 40 || screenY < 40 || screenY > VIEW.height - 40) {
        const angle = Math.atan2(screenY - VIEW.height / 2, screenX - VIEW.width / 2);
        const arrowX = VIEW.width / 2 + Math.cos(angle) * 300;
        const arrowY = VIEW.height / 2 + Math.sin(angle) * 220;
        context.save();
        context.translate(arrowX, arrowY);
        context.rotate(angle);
        context.fillStyle = PALETTE.marker;
        context.beginPath();
        context.moveTo(18, 0);
        context.lineTo(-10, -11);
        context.lineTo(-10, 11);
        context.closePath();
        context.fill();
        context.restore();
      }
    }
    // Busted warning while the police are closing in on foot.
    if (state.player.bustTimer > 0.15 && !state.player.inCar) {
      text('BUSTED INCOMING — RUN!', VIEW.width / 2, 84, 24, PALETTE.danger, 'center');
    }
    // Banner (mission title card) and toast, centre screen.
    if (state.banner !== null) {
      context.fillStyle = 'rgba(23, 16, 31, 0.82)';
      context.fillRect(VIEW.width / 2 - 330, 120, 660, 84);
      text(state.banner.title, VIEW.width / 2, 134, 30, PALETTE.text, 'center');
      text(state.banner.sub, VIEW.width / 2, 170, 18, PALETTE.muted, 'center');
    } else if (state.toast !== null) {
      text(state.toast.text, VIEW.width / 2, 130, 20, PALETTE.marker, 'center');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.fillStyle = accent;
    context.fillRect(x, y, PANEL.width, 6);
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 36, 22, PALETTE.marker, 'center');
  }

  const TITLE_LINES = [
    'Rico owes Mara Quinn — and Neon Bay always collects.',
    'Four jobs stand between you and a clean slate.',
    'Walk with WASD · get in a car with E · punch with Space.',
    'Steal cars, dodge the cops, and mind the wanted stars.',
    '',
  ];
  const PAUSED_LINES = ['The city waits for you.'];
  const OVER_LINES = ['', ''];

  /** Paint one frame: the city through the camera, then the HUD or a panel. */
  function draw(state, screen, best) {
    clock = state.elapsed;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const camera = cameraFor(state);
    context.save();
    // The clip is in view space (the 1280x720 window), not world space: the
    // translate below moves world coordinates into that window.
    context.beginPath();
    context.rect(0, 0, VIEW.width, VIEW.height);
    context.clip();
    context.translate(-camera.x, -camera.y);
    drawGround(state, camera);
    drawCity(state, camera);
    drawEntities(state, camera);
    context.restore();
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = bestLabel(best);
      drawPanel('NEON BAY NIGHTS', TITLE_LINES, 'Press Space or click to start', PALETTE.buildingNeon);
      return;
    }
    drawHud(state, camera);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume', PALETTE.buildingNeon2);
    } else if (screen === SCREEN_OVER) {
      const busted = state.endReason === 'busted';
      OVER_LINES[0] = busted ? 'The Neon Bay police took you in.' : 'Rico is down — Neon Bay wins this round.';
      OVER_LINES[1] = `${finalLabel(state.cash)}  ·  ${bestLabel(best)}`;
      drawPanel(busted ? 'BUSTED' : 'WASTED', OVER_LINES, 'Press Space or click to play again', PALETTE.danger);
    } else if (screen === SCREEN_STORY) {
      OVER_LINES[0] = `All four jobs done. ${finalLabel(state.cash)}`;
      OVER_LINES[1] = bestLabel(best);
      drawPanel('NEON BAY IS YOURS', OVER_LINES, 'Press Space or click to play again', PALETTE.star);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
