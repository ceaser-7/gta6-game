// Porto Verde — story beats: Mara Voss and her debt to Rook. Eight beats,
// played as queued dialogs at mission boundaries and side-content moments.
import { queueDialog } from './hud.js';

const BEATS = {
  intro: [
    { name: 'Rook', text: 'Mara. You owe me forty thousand. Three jobs and we are square.' },
    { name: 'Mara', text: 'Three jobs. Then I drive for myself. That is the deal.' },
    { name: 'Rook', text: 'The first job is a tail. A courier van. Do not lose it, do not spook it.' },
  ],
  afterM1a: [
    { name: 'Rook', text: 'The debt still stands at $40,000. Two jobs left.' },
  ],
  afterM1b: [
    { name: 'Mara', text: 'I\u2019m worn out from taking the fall for that botched job. I\u2019ll finish, but you don\u2019t own me.' },
  ],
  afterM2: [
    { name: 'Rook', text: 'The car you took belongs to a collector. He will not miss it. One job left.' },
    { name: 'Mara', text: 'One job. Then I am done with your collectors and your couriers.' },
  ],
  beforeM3: [
    { name: 'Rook', text: 'Last job. The police know your face now. Five stars the moment you start. Be quick.' },
    { name: 'Mara', text: 'Five stars. Fine. I drive fast.' },
  ],
  epilogue: [
    { name: 'Rook', text: 'Forty thousand. Paid in full. You drive for yourself now, Mara.' },
    { name: 'Mara', text: 'Then I keep driving. On my own terms. That was always the plan.' },
  ],
  coins: [
    { name: 'Rook', text: 'You found all twelve. That is the kind of eye I pay for.' },
  ],
  projectCar: [
    { name: 'Lena', text: 'The project car runs again. You did good work, Mara.' },
    { name: 'Mara', text: 'One day I will drive something like that for myself.' },
  ],
};

export function playStory(key) {
  const beat = BEATS[key];
  if (!beat) return;
  for (const line of beat) queueDialog(line.name, line.text);
}
