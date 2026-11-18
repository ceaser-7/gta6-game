// Porto Verde — dialogue: a 68-line bank, every line written fresh here.
// Named NPCs (Rosa, Dario, Nico) have their own lines; everyone reacts to
// Mara's wanted level, her money and the time of day.
import { G, rand, pick } from './state.js';
import { showDialog, showToast } from './hud.js';

const GREET = [
  "Morning, Mara. The city woke up grumpy today.",
  "Hey, driver. You look like you have somewhere to be.",
  "Careful out there, the roads are slick after the rain.",
  "You are Mara, right? Everyone at the market knows your name.",
  "Good day for a drive. Bad day for a chase, if you ask me.",
  "I saw your car parked by the plaza. Nice machine.",
  "You hungry? El Faro does a taco worth the walk.",
  "Slow down when you pass the school, will you?",
  "The marina looks beautiful at sunset. You should see it sometime.",
  "You always in a hurry, or is today special?",
  "Heard the ferries are late again. Nothing new.",
  "Stay out of Downtown after dark. Trust me on that one.",
];
const GOSSIP = [
  "They say Rook has a new job lined up. Big money, big risk.",
  "Did you hear about the courier van? It drives the same route every day.",
  "Someone hid coins all over the city. Twelve of them, I heard.",
  "The garage on Sunray fixed my neighbour's car in an afternoon.",
  "A race starts at the arch near Downtown when the sun goes down.",
  "The police put up roadblocks again last night. Three stars, at least.",
  "Old Man Ferris lost his taxi to a joyrider. He is still furious.",
  "They are filming something by the marina. Or so they claim.",
  "The market stalls close early on Sundays. Do not be late.",
  "I heard the mayor drives a sports car now. Must be nice.",
  "Someone keeps leaving flowers at the plaza fountain.",
  "The taco bar hired a new cook. The line is out the door.",
];
const WARNED = [
  "Mara, the police are looking for you. Keep your head down.",
  "You have stars on you. Do not drag trouble to my street.",
  "I saw the chase. You drive like the city owes you money.",
  "Hide the car and walk. They check every sedan at the roadblocks.",
  "You are wanted, Mara. I am not getting involved.",
  "Break their line of sight and wait. They lose interest fast.",
  "My cousin got busted last week. Do not be next.",
  "The sirens are getting closer. You should move.",
  "You are brave or foolish. Probably both.",
  "If they catch you, you never saw me. Understood?",
];
const DAYLINES = [
  "The market is busiest at noon. Best fruit, worst crowds.",
  "Day shift is long, but the tips are decent.",
  "I love this city in daylight. Everything feels possible.",
  "The sun is high. Perfect for a drive along the coast.",
  "Lunch rush at El Faro. You should try the tacos.",
  "The beach is quiet this morning. Good for thinking.",
  "I work the stalls till dusk, then I go home to my cats.",
  "Daylight makes the towers look almost friendly.",
];
const NIGHTLINES = [
  "Night shift again. The city never really sleeps.",
  "The lamps come on and the whole street changes.",
  "I like the quiet hours. Fewer people, fewer problems.",
  "The bar crowd shows up after nine. They are loud but harmless.",
  "Watch the dark corners near the docks. Just a tip.",
  "Night driving is the best driving. Empty roads, cool air.",
  "I heard the race starts when the sun goes down.",
  "The neon signs make the rain look like confetti.",
];
const MONEY = [
  "You look flush, Mara. Spend some of it before Rook takes it.",
  "Money comes and goes. Debts stay, unfortunately.",
  "Forty thousand is a lot to owe. You will clear it, I know it.",
  "Broke again? The coins hidden around town are worth finding.",
  "A taco is ten. A clear conscience is priceless. Or so they say.",
  "Save your cash. The garage charges a fortune for a paint job.",
  "You earned that money. Do not let anyone take it from you.",
  "Rook pays well when the job is done right. Remember that.",
];
const ROSA = [
  "Morning, Mara, these oranges are sweeter than they look.",
  "You want the good avocados? They are under the counter. For you, always.",
  "I have sold fruit on this corner for thirty years. I have seen it all.",
  "Your mother used to buy mangoes here. She had good taste.",
  "The market gossip is free. The fruit costs money.",
  "Come back at dusk, Mara. I save the best figs for friends.",
];
const DARIO = [
  "Downtown never sleeps, Mara. Neither do I, apparently.",
  "I know every shortcut in this district. Ask me sometime.",
  "The towers look impressive, but the rent up there is a joke.",
  "You need a fast car? Talk to the garage, not to me.",
  "I saw the courier van turn onto Marina Avenue. Same time as always.",
  "If Rook sends you Downtown, keep your eyes open and your doors locked.",
];
const NICO = [
  "The beach is mine, Mara. Best spot in Porto Verde, no contest.",
  "I surf at dawn and fish at dusk. The city can keep its noise.",
  "The tide brings in strange things. Yesterday, a whole bicycle.",
  "You ever drive the coast road at sunset? It is the one free thing here.",
  "The gulls steal my lunch every single day. I respect the hustle.",
  "If you need to disappear for an hour, the beach is the place.",
];

export const BANK = { GREET, GOSSIP, WARNED, DAYLINES, NIGHTLINES, MONEY, ROSA, DARIO, NICO };
export const BANK_SIZE = GREET.length + GOSSIP.length + WARNED.length + DAYLINES.length + NIGHTLINES.length + MONEY.length + ROSA.length + DARIO.length + NICO.length;

export function pickLine(ped) {
  const name = ped.userData.name;
  if (name === 'Rosa' && rand() < 0.7) return pick(ROSA);
  if (name === 'Dario' && rand() < 0.7) return pick(DARIO);
  if (name === 'Nico' && rand() < 0.7) return pick(NICO);
  const r = rand();
  if (G.wanted > 0 && r < 0.45) return pick(WARNED);
  if (G.money < 50 && r < 0.6) return pick(MONEY);
  if (G.money > 2000 && r < 0.55) return pick(MONEY);
  if (G.dayT < 120) return r < 0.5 ? pick(GREET) : pick(DAYLINES);
  if (r < 0.4) return pick(NIGHTLINES);
  return r < 0.7 ? pick(GREET) : pick(GOSSIP);
}

// Talk to a ped: dialog box, 20s per-ped cooldown (talkAt starts at -99 so the first talk works).
export function talkTo(ped) {
  const u = ped.userData;
  if (G.time - u.talkAt < 20) return false;
  u.talkAt = G.time;
  G.stats.talks++;
  showDialog(u.name, pickLine(ped));
  return true;
}

let barkTimer = 8;
export function updateDialogue(dt) {
  if (G.dialog) return;
  if (G.wanted > 0 || G.player.car) return;
  barkTimer -= dt;
  if (barkTimer > 0) return;
  barkTimer = 12 + rand(0, 8);
  // a nearby ped speaks on their own
  let near = null;
  for (const ped of G.peds) {
    const d = Math.hypot(ped.position.x - G.player.pos.x, ped.position.z - G.player.pos.z);
    if (d < 14) { near = ped; break; }
  }
  if (near) showToast(`${near.userData.name}: "${pickLine(near)}"`);
}
