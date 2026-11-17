// Pedestrian dialogue: the city talks back. Mara can walk up to any
// pedestrian and press E to talk — they greet her, gossip, warn her about
// the police, or pass on a useful rumour. A few named faces (Rosa, Dario,
// Nico, Tomas, Lena) have their own lines. v5: the world is more than 3D.
// Line bank + line picker are from GPT-6.1 Sol (v5 calls S5a/S5b, 2026-11-17),
// used verbatim; the wiring (named NPCs, talk range, barks) is built here.
import { districtAt } from './city.js';
import { spawnPed } from './traffic.js';

const LINES = {
  greet: {
    harbor: [
      'Morning, Mara, the fish boats came in early today.',
      'Hey, welcome to the docks, mind the wet boards.',
      'Good to see you, we just cleared a path through the crates.',
      'Hi, the fish stall has a fresh catch if you are hungry.',
      'Morning, mind the puddles by those crates.',
      'Hey, Mara, come say hello before the next boat unloads.'
    ],
    downtown: [
      'Morning, Mara, the office crowd is out early.',
      'Hey, good to see you between all these towers.',
      'Hi, you caught a quiet moment in the traffic.',
      'Good morning, the office cafe just opened.',
      'Hey, Mara, did you find a place to park near the towers?',
      'Hello, hope the traffic didn\'t hold you up.'
    ],
    oldtown: [
      'Morning, Mara, the market stalls are just opening.',
      'Hey, there is a free table outside the cafe.',
      'Hello, good to see you back on these old streets.',
      'Morning, the cafe has fresh bread if you want some.',
      'Hi, Mara, found anything good at the market today?',
      'Hey, come sit for a minute before the market gets busy.'
    ],
    marina: [
      'Morning, Mara, the boats are heading out already.',
      'Hey, nice day for a walk along the beach.',
      'Hello, the hotel cafe has a table free outside.',
      'Good to see you, the beach is quiet this morning.',
      'Hi, Mara, did you see the new boat by the pier?',
      'Hey, welcome back, the hotel crowd is still asleep.'
    ]
  },
  night: [
    'These lamps barely reach the next corner.',
    'The streets get quiet once the shops close.',
    'I should head home before the last bus leaves.',
    'Glad they finally fixed the lamp by my door.',
    'Are you heading home too, Mara?',
    'Keep your voice down, people are sleeping.'
  ],
  scared: [
    'Mara, please leave before those cops get here.',
    'Those police lights are coming this way.',
    'I don\'t want any trouble, so I\'m backing off.',
    'Keep away from me until the police stop chasing you.',
    'Please go, I have nothing to do with this.',
    'Mara, take those cops somewhere else.'
  ],
  pair: [
    'I heard the hotel owner is selling his boat.',
    'That explains why he keeps asking about cheap taxis.',
    'Are we still meeting at the market after work?',
    'Only if you promise not to spend an hour picking fruit.',
    'They closed this street again for pipe repairs.',
    'They fixed those pipes last week and left the same hole.'
  ],
  tip: [
    'I heard there\'s something shiny hidden behind the fish crates at the Harbor.',
    'People say a street race starts on the Downtown avenue after dark.',
    'El Faro is the taco bar in Old Town that stays open after the market closes.',
    'Lena at Sunray Garage in Downtown pays for car work.',
    'There\'s a beach hideout past the rocks, away from the hotels.',
    'Someone spotted something shiny under the steps by the Old Town market.'
  ],
  named: {
    rosa: [
      'Morning, Mara, these oranges are sweeter than they look.',
      'Take a peach for the road, you look hungry.',
      'The Old Town market is slow today, so stay and chat.',
      'How have you been, love?'
    ],
    dario: [
      'Need a taxi, Mara, or are you driving yourself today?',
      'I know every street in Porto Verde, even the ones without signs.',
      'Take the back street past the market to miss the tower traffic.',
      'The beach road is quicker unless the hotels are unloading luggage.'
    ],
    nico: [
      'Mara, is your car the fastest one in Porto Verde?',
      'I watch the fast cars from the beach every afternoon.',
      'Can your car beat that red one by the hotel?',
      'One day I\'m getting a fast car instead of this bike.'
    ],
    tomas: [
      'Welcome to El Faro, Mara, your usual tacos are almost ready.',
      'Old Town gets noisy, but there is always a seat at my bar.',
      'I run this place on fresh tortillas and very strong coffee.',
      'Come back after the market closes and I will save you a plate.'
    ],
    lena: [
      'Bring it into Sunray Garage, Mara, I can fix that rattle.',
      'I pay for car work, not for stories about how the dent got there.',
      'Your brakes are fine, which makes your parking harder to explain.',
      'Half of Downtown drives like repairs are free.'
    ]
  }
};

// --- line picker + talk action (Sol S5b, verbatim) ---
function pickLine(G, ped) {
  let list;
  if (ped.state === 'flee' || ped.state === 'down') {
    list = LINES.scared;
  } else if (G.wanted >= 1) {
    list = G.rng() < 0.7 ? LINES.scared : null;
  } else if (ped.kind === 'named') {
    list = LINES.named[ped.namedKey];
  } else if (ped.kind === 'stander') {
    list = LINES.pair;
  } else if (G.dayT >= 0.1 && G.dayT < 0.55) {
    list = G.rng() < 0.6 ? LINES.night : null;
  } else {
    list = G.rng() < 0.25 ? LINES.tip : null;
  }
  if (list === null) {
    const key = districtAt(ped.pos.x, ped.pos.z).toLowerCase().replace(' ', '');
    list = LINES.greet[key];
  }
  if (!list || list.length === 0) return LINES.greet.downtown[0] ?? '';
  const index = Math.min(list.length - 1, Math.floor(G.rng() * list.length));
  return list[index] ?? LINES.greet.downtown[0] ?? '';
}

export function talkTo(G, ped) {
  if (G.time - (ped.talkAt || 0) < 20) return false;
  ped.talkAt = G.time;
  G.hud.showDialog(ped.name, pickLine(G, ped), () => {});
  return true;
}

// --- named faces on the street (Tomas + Lena live inside the interiors) ---
export function createDialogue(G) {
  G.lastBark = -99;
  const rosa = spawnPed(G, -264, 258, null, { name: 'Rosa', namedKey: 'rosa', kind: 'named', stand: true });
  rosa.yaw = Math.PI * 0.75; rosa.group.rotation.y = rosa.yaw;
  const dario = spawnPed(G, 108, -150, null, { name: 'Dario', namedKey: 'dario', kind: 'named', stand: true });
  dario.yaw = -Math.PI / 2; dario.group.rotation.y = dario.yaw;
  const nico = spawnPed(G, 270, 395, null, { name: 'Nico', namedKey: 'nico', kind: 'named', stand: true });
  nico.yaw = Math.PI; nico.group.rotation.y = nico.yaw;
  G.namedPeds = { rosa, dario, nico };
}

// Nearest pedestrian Mara can talk to: on foot range, not down, not an
// officer, not fleeing, and not an interior NPC (they are talked to inside).
export function nearestTalkablePed(G, maxDist) {
  const p = G.player;
  let best = null, bd = maxDist;
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'flee' || ped.interior) continue;
    if (G.officers && G.officers.includes(ped)) continue;
    const d = Math.hypot(ped.pos.x - p.pos.x, ped.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = ped; }
  }
  return best;
}

// Try to talk: returns true when a conversation started.
export function tryTalk(G) {
  if (!G.player.onFoot || G.interior) return false;
  const ped = nearestTalkablePed(G, 2.5);
  if (!ped) return false;
  return talkTo(G, ped);
}

// Ambient barks: a nearby pedestrian occasionally says something as Mara
// passes on foot — a greeting, never a full conversation. Throttled hard.
export function updateDialogue(G, dt) {
  if (G.state !== 'playing' || G.hud.dialogOpen || !G.player.onFoot || G.interior) return;
  if (G.time - G.lastBark < 12) return;
  const ped = nearestTalkablePed(G, 6);
  if (!ped || G.wanted >= 1) return;
  G.lastBark = G.time;
  const key = districtAt(ped.pos.x, ped.pos.z).toLowerCase().replace(' ', '');
  const list = (G.dayT >= 0.1 && G.dayT < 0.55) ? LINES.night : LINES.greet[key];
  const line = list[Math.floor(G.rng() * list.length)];
  G.hud.toast(`${ped.name}: “${line}”`);
}
