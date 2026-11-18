// Ped dialogue: a 68-line bank, every ped named, E to talk, 20s cooldown.
const PV_Dialogue = (() => {
  const LINES = [
    'Morning, Mara. These oranges are sweeter than they look.',
    'You drive like the road owes you money.',
    'Lunch rush at El Faro. You should try the tacos.',
    'I heard Rook is looking for drivers again. Careful.',
    'The Marina is quiet tonight. Too quiet.',
    'My cousin saw the police set up a roadblock on the avenue.',
    'If you need a fast car, Sunray Garage is the place.',
    'This city never sleeps, and neither do the cops.',
    'Beautiful sunset, huh? Porto Verde at golden hour.',
    'I lost my wallet at the market. If you see it, it is yours to keep.',
    'The courier vans are always in a hurry. Wonder what they carry.',
    'You look like someone with somewhere to be.',
    'Careful on the east road, the potholes eat tires.',
    'I used to race the Sunset Sprint. My best was under a minute.',
    'Twelve coins hidden around the city, they say. I found two.',
    'The night shift at the bar pays better than the day.',
    'Do not park on the plaza. They tow anything.',
    'Rook never forgets a debt. Or a favour.',
    'The beach is the only calm place left in this city.',
    'I saw a gold car parked near the garage. Fancy.',
    'If the sirens get loud, just keep driving.',
    'The old town market has the best fruit in Porto Verde.',
    'My brother drives a taxi. He knows every shortcut.',
    'Watch out for the fender-benders on the avenue.',
    'The towers downtown glow all night. Pretty, but loud.',
    'I heard Mara Voss is the best getaway driver in the city.',
    'Coffee at El Faro is terrible. The tacos make up for it.',
    'Sunray Garage fixed my van in an hour. Lena is a genius.',
    'The police know every face in Downtown now.',
    'I would not be out after midnight if I were you.',
    'The plaza fountain is the meeting point for everyone.',
    'My shift ends at dawn. Then I sleep through the noise.',
    'You ever wonder who owns all those empty towers?',
    'The race arch on the avenue is where the fast ones show off.',
    'I found a coin by the park bench yesterday. Lucky me.',
    'Rook pays on time, if you do the job right.',
    'The sea air clears the head. Walk the beach sometime.',
    'Do not trust a courier van. They stop for no one.',
    'I saw three police cars chase one sedan. The sedan won.',
    'The market stalls close at dusk. The bar crowd takes over.',
    'My knees hurt from these hills. Porto Verde is not flat.',
    'If you are broke, the coins are real money. All twelve.',
    'The garage has a project car that never gets finished.',
    'I heard the dragnet is coming. Five stars, no mercy.',
    'Keep your pistol loaded. This city bites.',
    'The taxi drivers gossip more than the radio.',
    'I love this city. I also want to leave it.',
    'The sunset here is the best in the world. Even the cops stop to look.',
    'My dog ran off near the marina. If you see him, call him Biscuit.',
    'The billboards lie. The tacos do not.',
    'I work the market by day and dream of the sea by night.',
    'You drive a hard bargain, Mara. I respect that.',
    'The old town alleys are the safest shortcut in the city.',
    'I saw a sports car do a full lap of the city in four minutes.',
    'The police stop on the corner is new. They are looking for someone.',
    'If you collect all the coins, Rook notices. He notices everything.',
    'My mother says the city was quieter before the towers.',
    'The race is ninety seconds of pure adrenaline. Try it.',
    'I never walk alone at night anymore. Not since the dragnet.',
    'The fountain water is cold. The kids swim in it anyway.',
    'You have good shoes for running. You will need them.',
    'The garage door is always open. Lena never sleeps.',
    'I heard a driver paid off a forty-thousand debt in three jobs.',
    'The beach palms sway like they are dancing.',
    'Do not honk at the market. The vendors honk back.',
    'The city wakes up at dawn and the bars close at four.',
    'I know a shortcut through Uptown that saves ten minutes.',
    'The coins are hidden where nobody looks. Check the benches.',
    'Rook is fair, if you are fast. Be fast.',
  ];
  const WANTED_LINES = [
    'Whoa, Mara — the police are after you. Keep moving!',
    'Five stars? You must have done something big.',
    'Lay low. The cops are everywhere tonight.',
  ];
  const BROKE_LINES = [
    'Times are tight, huh? The coins are worth real money.',
    'I would lend you a few, but I am broke too.',
  ];
  const RICH_LINES = [
    'You are looking flush, Mara. The jobs must be paying.',
    'Forty thousand is a lot of money. You will get there.',
  ];
  let barkT = 0;
  function pickLine(ped) {
    if (G.wanted >= 3 && Math.random() < 0.6) return pick(WANTED_LINES);
    if (G.money < 50 && Math.random() < 0.5) return pick(BROKE_LINES);
    if (G.money > 1500 && Math.random() < 0.4) return pick(RICH_LINES);
    if (ped.kind === 'named') {
      if (ped.name === 'Rosa') return pick([
        'Morning, Mara. These oranges are sweeter than they look.',
        'The market is busiest at noon. Come back then.',
        'My oranges are the best in Old Town. That is a fact.',
      ]);
      if (ped.name === 'Dario') return pick([
        'Downtown never stops. Neither do I.',
        'The towers glow all night. I watch them from here.',
        'You need anything downtown, ask Dario.',
      ]);
      if (ped.name === 'Nico') return pick([
        'The beach is the only calm place left in this city.',
        'The sea air clears the head. Walk the beach sometime.',
        'I come here every evening. The sunset is the best in the world.',
      ]);
    }
    return pick(LINES);
  }
  function showDialog(who, line) {
    G.dialog = { who, line };
    PV_HUD.showDialog(who, line);
  }
  function closeDialog() {
    G.dialog = null;
    PV_HUD.hideDialog();
  }
  function talkTo(ped) {
    if (!ped || G.time - ped.talkAt < 20) return false;
    ped.talkAt = G.time;
    showDialog(ped.name, pickLine(ped));
    return true;
  }
  function updateDialogue(dt) {
    // ambient barks: a nearby ped speaks on their own, throttled, on foot, wanted 0
    barkT -= dt;
    if (barkT > 0 || G.dialog || !G.player || !G.player.onFoot || G.wanted > 0 || !G.started) return;
    const p = PV_Traffic.nearestPed(G.player.x, G.player.z, 9);
    if (p && Math.random() < dt * 0.25) {
      PV_HUD.toast(p.name + ': ' + pickLine(p));
      barkT = 12;
    }
  }
  return { talkTo, showDialog, closeDialog, updateDialogue, pickLine };
})();
