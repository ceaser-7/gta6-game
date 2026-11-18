// Porto Verde — the dialogue bank: every ped talks. Lines are original,
// written for this city. E to talk, 20 s per-ped cooldown, ambient barks.
import { G } from './util.js';
import { showDialog, toast } from './hud.js';
import { isDay } from './peds.js';

const GREET = [
  'Morning. The sea air is kind today.',
  'Hey, Mara. You look like you have somewhere to be.',
  'Nice day for a drive, if the cops let you.',
  'You are Rook\u2019s driver, right? I heard about the debt.',
  'Careful on the Marina road. The tourists brake for nothing.',
  'I saw your car parked by the plaza. Nice paint.',
  'The market is good today. The oranges are sweet.',
  'You ever just walk the beach at sunset? It clears the head.',
  'Downtown is all glass now. I miss the old signs.',
  'If you are looking for work, Rook is the one to ask. Or avoid.',
];
const GOSSIP = [
  'They say the Sunray Garage has a car on the lift worth a fortune.',
  'Someone left twelve gold coins around the city. A bet, maybe.',
  'The taco bar on the Old Town road does the best food in Porto Verde.',
  'A courier van runs the same route every day. Same van, same driver.',
  'The cops put roadblocks up past three stars now. Best keep it clean.',
  'There is a race at sunset. The arch is on the north road.',
  'I heard Rook collects debts the old way. No paperwork.',
  'The Marina crowd pays double for everything. Good for business.',
  'A friend of mine fixed the project car at Sunray. Cost him a week.',
  'If the sun is setting, the radio sounds better. Verde FM, always.',
];
const WARN = [
  'You should not be waving that around here.',
  'Put that away before someone calls it in.',
  'The cops are already looking. Walk away.',
  'I saw what you did. I am saying nothing. Leave.',
  'Careful. This street has eyes.',
  'You are going to get us all in trouble.',
];
const WANTED = [
  'The whole city is looking for you, Mara.',
  'Five stars? You must have done something big.',
  'Lose them behind the towers. The alleys are tight there.',
  'If you break their line of sight, they lose you. Ten seconds.',
  'I would not park here if I were you.',
];
const BROKE = [
  'Times are tight, huh? The market always needs hands.',
  'You look like someone who needs a paying job.',
  'Rook pays, but Rook always collects.',
  'A taco is ten. If you have ten, eat first, worry later.',
];
const RICH = [
  'You are doing well. The debt will not pay itself, though.',
  'Flash car, flash life. Just keep Rook happy.',
  'Money suits you. Spend some of it at the market.',
];
const DAY = [
  'The market is busy until noon. Then it is all shade and gossip.',
  'Sun is high. The plaza fountain is the coolest spot in town.',
  'Lunch rush at El Faro. You should try the tacos.',
];
const NIGHT = [
  'The neon is on. Porto Verde looks best after dark.',
  'Careful out there at night. The streets get quiet and strange.',
  'The bar crowd is out. The day crowd is home by now.',
  'Headlights on. The lamps here are more for show.',
];
const ROSA = [
  'Morning, Mara, these oranges are sweeter than they look.',
  'You want the good mangoes? They are under the counter. For friends.',
  'Rook came by yesterday asking about you. I told him nothing.',
  'The market has been here longer than the towers. Remember that.',
  'Take an orange. On the house. You look tired.',
];
const DARIO = [
  'Downtown never sleeps. It just changes its clothes.',
  'I have seen every car in this city. Yours has the best engine note.',
  'The towers went up fast. The old streets are still underneath.',
  'If you need to disappear, the service lanes behind the glass are best.',
];
const NICO = [
  'The beach is the only honest place in Porto Verde.',
  'Tide comes in at dusk. Best light in the city.',
  'I fish here every morning. The city wakes up behind me.',
  'Salt air fixes most things. Except debts.',
];
const TOMAS = [
  'Welcome to El Faro. Tacos are ten, coffee five, soda four.',
  'The taco is worth every cent. Ask anyone.',
  'Sit down, Mara. You look like you have been driving all day.',
  'Rook eats here sometimes. He always pays. Eventually.',
];
const LENA = [
  'Sunray Garage. If it has wheels, I can fix it.',
  'The project car on the lift is a dream. It just needs time and money.',
  'Bring me a broken car and I will make it sing.',
  'Rook sends drivers here when he wants them kept busy.',
];

export const DIALOGUE = { GREET, GOSSIP, WARN, WANTED, BROKE, RICH, DAY, NIGHT, ROSA, DARIO, NICO, TOMAS, LENA };

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function pickLine(ped) {
  if (ped.name === 'Rosa') return pick(ROSA);
  if (ped.name === 'Dario') return pick(DARIO);
  if (ped.name === 'Nico') return pick(NICO);
  if (ped.name === 'Tomas') return pick(TOMAS);
  if (ped.name === 'Lena') return pick(LENA);
  if (G.wanted > 0) return pick(WANTED);
  if (G.money < 50) return pick(BROKE);
  if (G.money > 2000) return pick(RICH);
  const r = Math.random();
  if (r < 0.35) return pick(GREET);
  if (r < 0.6) return pick(GOSSIP);
  return isDay() ? pick(DAY) : pick(NIGHT);
}

export function talkTo(ped) {
  if (!ped) return false;
  if (G.time - ped.talkAt < 20) return false;
  ped.talkAt = G.time;
  showDialog(ped.name, pickLine(ped));
  return true;
}

let barkT = 0;
export function updateDialogue(dt) {
  barkT -= dt;
  if (barkT > 0) return;
  barkT = 12;
  if (!G.started || G.dialog || G.wanted > 0 || G.playerCar) return;
  // A nearby ped occasionally speaks on their own.
  const near = G.peds.filter(p => {
    if (!G.player) return false;
    const dx = p.x - G.player.position.x, dz = p.z - G.player.position.z;
    return dx * dx + dz * dz < 15 * 15;
  });
  if (near.length === 0) return;
  const ped = pick(near);
  toast(`${ped.name}: ${pick(GREET)}`);
}
