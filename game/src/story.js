// Story beats: Mara Voss owes fixer Rook $40,000. Three jobs to pay it off.
const PV_Story = (() => {
  const BEATS = {
    intro: [
      ['Rook', 'Mara. Forty thousand, and the clock is ticking. Three jobs, and we are even.'],
      ['Mara', 'Three jobs. Then I am done with you, Rook. For good.'],
    ],
    afterM1: [
      ['Rook', 'The debt still stands at $40,000. Two jobs left.'],
      ['Mara', "I'm worn out from taking the fall for that botched job. I'll finish, but you don't own me."],
    ],
    afterM2: [
      ['Rook', 'The gold car is safe. Its owner is a collector — he pays well and asks nothing.'],
      ['Mara', 'One job left. Then the debt is gone, and so am I.'],
    ],
    beforeM3: [
      ['Rook', 'Last one, Mara. The police know your face now. Five stars the moment you move.'],
      ['Mara', 'Then I will not stop moving. Not until the safehouse.'],
    ],
    epilogue: [
      ['Rook', 'Forty thousand. Paid in full. You are a free woman, Mara.'],
      ['Mara', 'Free. I keep driving, but on my own terms now. Porto Verde is mine.'],
    ],
    coins: [
      ['Rook', 'You found all twelve. That is the kind of eye I pay for.'],
      ['Mara', 'Twelve coins, one city. I know every corner of Porto Verde now.'],
    ],
    projectCar: [
      ['Lena', 'The project car runs like a dream now. You should take it for a spin sometime.'],
      ['Mara', 'One day, Lena. One day I drive for fun, not for a debt.'],
    ],
  };
  function play(key) {
    const beats = BEATS[key];
    if (!beats) return;
    for (const [who, line] of beats) G.dialogQueue.push({ who, line });
    PV_HUD.nextDialog();
  }
  return { play, BEATS };
})();
