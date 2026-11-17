// Story depth: Mara and Rook, in their own words. After each job Rook
// talks about the debt and Mara answers back — she is a person, not a
// mission marker. Beats are from GPT-6.1 Sol (v5 call S5f, 2026-11-17),
// used verbatim; the queueing is built here.
const STORY = {
  afterM1: [
    { who: 'Rook — fixer', text: "The debt still stands at $40,000. Two jobs left." },
    { who: 'Mara Voss', text: "I'm worn out from taking the fall for that botched job. I'll finish, but you don't own me." }
  ],
  afterM2: [
    { who: 'Rook — fixer', text: "The GT's owner is a collector. He won't stay quiet when he finds it gone." },
    { who: 'Mara Voss', text: "Let him shout. I'm almost free." }
  ],
  beforeM3: [
    { who: 'Rook — fixer', text: "The police know your face. This last job is the dangerous one." },
    { who: 'Mara Voss', text: "I'm ready. Just give me the route." }
  ],
  epilogue: [
    { who: 'Rook — fixer', text: "The debt is paid. Porto Verde is yours now." },
    { who: 'Mara Voss', text: "I'll keep driving. This time, it's on my terms." }
  ]
};

// Queue a story beat (dialogs play in order; the game's dialog queue
// handles the sequencing). No-op for an unknown key.
export function playStory(G, key) {
  const beats = STORY[key];
  if (!beats) return;
  for (const b of beats) G.hud.showDialog(b.who, b.text, () => {});
}
