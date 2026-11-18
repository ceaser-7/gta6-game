// Porto Verde — dialogue: a 68-line bank, all original. E to talk, 20 s per-ped cooldown.
import { G, choice } from './state.js';

export const BANK = {
  greet: [
    'Morning, Mara. The oranges are sweeter than they look.',
    'You look like you have somewhere to be. Drive safe.',
    'Hey, Mara. The market is busy today, good for business.',
    'Nice evening for a walk. The city smells like rain.',
    'You are up early. Or very late. Either way, hello.',
    'Mara! Long time. Still driving for that fixer?',
    'Careful on the avenues tonight, the cops are jumpy.',
    'The sunset over the marina is worth the walk, trust me.',
    'I heard the ferry brought in fresh fish this morning.',
    'You have that look. Another job, or another debt?',
  ],
  gossip: [
    'They say the old casino on the strip is changing hands again.',
    'Word is the harbour master lost three crates last week. Nobody asks.',
    'The new tower Downtown has a penthouse nobody lives in. Suspicious.',
    'My cousin swears he saw a gold sports car parked by the marina.',
    'The taco bar on the corner is the only place open past midnight.',
    'Somebody keeps leaving green coins all over the city. Collectors pay for them.',
    'The race crowd gathers on the north road at sunset. Fast cars, faster money.',
    'Rook has been asking after drivers. You know what that means.',
    'The police put up a roadblock near the plaza yesterday. Third one this month.',
    'Old Man Ferry says the tide is wrong this week. He always says that.',
  ],
  warn: [
    'You are wanted, Mara. Keep your head down and your speed up.',
    'The cops are out in force. Do not stop for anyone.',
    'I saw a patrol car two streets over. You did not hear it from me.',
    'If they catch you, they will not be gentle. Run.',
    'Lose them in the alleys. The avenues are watched.',
  ],
  broke: [
    'Short on cash? The garage pays for a steady hand.',
    'A taco is ten dollars. Even a broke driver eats.',
    'Times are tight. The coins around town are worth picking up.',
    'No money, no worries? That is not how it works, Mara.',
  ],
  flush: [
    'You are looking flush, Mara. New paint job next?',
    'Money suits you. Spend some of it on a decent meal.',
    'Rich driver, poor manners. Just kidding. Mostly.',
    'With that kind of cash, the city opens doors for you.',
  ],
  crime: [
    'I saw nothing. I was not even here.',
    'You did not just do that in front of me.',
    'Easy, Mara. The whole street is watching.',
    'That was loud. The police will be here soon.',
  ],
  time: [
    'Golden hour. The whole city turns to honey at this time.',
    'Night shift soon. The bars fill up and the streets empty out.',
    'Dawn over the water. Best free show in Porto Verde.',
    'Midday heat. Even the pigeons are looking for shade.',
  ],
  weather: [
    'No rain today. The sky is clear all the way to the sea.',
    'The wind off the water is cold tonight. Button up.',
    'Humid one. The air tastes like salt and diesel.',
    'Clear skies. A good night for a long drive.',
  ],
  named: {
    rosa: [
      'The oranges are sweeter than they look, Mara. Take two.',
      'Rook came by this morning asking for you. I told him nothing.',
      'My stall has been here thirty years. The city changes, the oranges stay.',
      'You want gossip? The harbour master is selling crates off the books.',
    ],
    dario: [
      'Downtown never sleeps, Mara. Neither do I.',
      'I know every shortcut in this district. For a price, I share.',
      'You drive like the city owes you something. Maybe it does.',
      'The tower lights blink in a pattern. Nobody knows why. I like that.',
    ],
    nico: [
      'The sea is calm today. Good for thinking, bad for fishing.',
      'I have watched this beach for forty years. It never gets old.',
      'You look like you carry the whole city on your shoulders, Mara.',
      'The tide brings in strange things. Coins, crates, stories.',
    ],
    tomas: [
      'Tacos, coffee, soda. The menu is on the wall, the prices are honest.',
      'A taco fixes more than hunger, Mara. Ten dollars.',
      'You want the good salsa? That costs a smile, not money.',
      'Business is slow tonight. Sit a while.',
    ],
    lena: [
      'The project car is on the lift. One hundred dollars and she purrs again.',
      'I can fix anything with four wheels and a bad attitude.',
      'Your car sounds rough. Bring it by before it quits on you.',
      'Tools down, hands clean. That is how a garage should look.',
    ],
    rook: [
      'You found all twelve. That is the kind of eye I pay for.',
      'The debt still stands at $40,000. Two jobs left.',
      'Good work, Mara. Do not make me regret trusting you.',
      'One more job and we are even. One more.',
    ],
  },
};

export function pickLine(ped) {
  const p = G.player;
  if (ped.namedKey && BANK.named[ped.namedKey]) return choice(BANK.named[ped.namedKey]);
  if (G.wanted > 0 && Math.random() < 0.4) return choice(BANK.warn);
  if (p.money < 50 && Math.random() < 0.3) return choice(BANK.broke);
  if (p.money > 2000 && Math.random() < 0.3) return choice(BANK.flush);
  const pool = Math.random();
  if (pool < 0.35) return choice(BANK.greet);
  if (pool < 0.6) return choice(BANK.gossip);
  if (pool < 0.75) return choice(BANK.time);
  if (pool < 0.9) return choice(BANK.weather);
  return choice(BANK.greet);
}

export function talkTo(ped) {
  if (G.time - ped.talkAt < 20) return false;
  ped.talkAt = G.time;
  G.stats.talks++;
  const line = pickLine(ped);
  G.ui.dialog && G.ui.dialog(ped.name, line);
  return true;
}

// Ambient bark: a nearby ped speaks on their own, throttled.
let lastBark = -99;
export function updateDialogue(dt) {
  if (G.dialog || G.wanted > 0 || !G.player.onFoot) return;
  if (G.time - lastBark < 12) return;
  const p = G.player;
  for (const ped of G.peds) {
    const dx = ped.x - p.x, dz = ped.z - p.z;
    if (dx * dx + dz * dz < 100) {
      lastBark = G.time;
      G.ui.toast && G.ui.toast(`${ped.name}: "${pickLine(ped)}"`);
      break;
    }
  }
}
