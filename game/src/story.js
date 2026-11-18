// Porto Verde — story: 8 beats for Mara Voss and her fixer Rook. All original.
import { G } from './state.js';

export const BEATS = {
  intro: [
    ['Rook', 'Mara. You owe me $40,000 for the botched job. Three jobs and we are even.'],
    ['Mara', 'Three jobs. Then I am done with you, Rook.'],
    ['Rook', 'Start with the tail. A courier van, Downtown route. Do not get made.'],
  ],
  afterM1: [
    ['Rook', 'The debt still stands at $40,000. Two jobs left.'],
    ['Mara', "I'm worn out from taking the fall for that botched job. I'll finish, but you don't own me."],
  ],
  afterM2: [
    ['Rook', 'The gold car is safe. Its owner is a collector — he will not miss it. Much.'],
    ['Mara', 'One job left. Then I drive for myself.'],
  ],
  beforeM3: [
    ['Rook', 'Last one, Mara. The police know your face now. Five stars, no mistakes.'],
    ['Mara', 'Then we are done. For good.'],
  ],
  epilogue: [
    ['Rook', 'The debt is paid, Mara. You are free.'],
    ['Mara', 'Free. The city is mine now — and I keep driving on my own terms.'],
  ],
  coins: [
    ['Rook', 'You found all twelve. That is the kind of eye I pay for.'],
  ],
  taco: [
    ['Tomas', 'Good taco, good day. Come back hungry, Mara.'],
  ],
  garage: [
    ['Lena', 'She runs like new. A hundred well spent, Mara.'],
  ],
};

export function playStory(key) {
  const beats = BEATS[key];
  if (!beats) return;
  for (const [who, line] of beats) G.dialogQueue.push({ who, line });
  showNextBeat();
}

export function showNextBeat() {
  if (G.dialog) return;
  const next = G.dialogQueue.shift();
  if (!next) return;
  G.ui.dialog && G.ui.dialog(next.who, next.line);
}
