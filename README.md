# Bar Tools · bar.leonardchow.work

Four offline probability exercises with fast phone input, honest model limits,
and a local timer that makes the opportunity cost of playing visible.

**[Open → bar.leonardchow.work](https://bar.leonardchow.work)** · single static file · works offline · installable to home screen · everything computes on your device

*[中文说明](README.zh-CN.md)*

| Tool | What it answers |
|---|---|
| 🎲 **Liar's Dice** (吹牛/大话骰) | Given the player count, your dice, and the standing bid — challenge, or raise to what? |
| ♠♥ **Texas Hold'em** | Hole cards + board + opponent count → equity to the river, and how big the pot must be for a call to break even |
| **Blackjack** | Your hand + dealer upcard → hit/stand/double/split/surrender ranked by exact EV, plus a Hi-Lo counter |
| **24 Game** | Four cards → every solution, found with exact rational arithmetic |

<p align="center">
  <img src="docs/screenshots/home.png" width="200">
  <img src="docs/screenshots/dice.png" width="200">
  <img src="docs/screenshots/holdem.png" width="200">
  <img src="docs/screenshots/blackjack.png" width="200">
</p>

---

## Why this exists

The author does not gamble. This project teaches probability, house edge and
opportunity cost; it does not accept bets. A positive result on one hand does
not establish a profitable long-run strategy. Games with house edge have a
negative player expectation; in player-versus-player games, zero-sum is a
statement about the whole table, not every individual.

Singapore prohibits gambling unless licensed or exempted. Home social gambling
is subject to conditions; its exemption does not extend to public places.
See [MHA](https://www.mha.gov.sg/what-we-do/maintaining-law-and-order/regulating-casino-and-gambling-industry/).

| Tool | What the probability label means |
|---|---|
| Liar's Dice | A model-dependent round outcome; no universal 1/players claim |
| Hold'em | Expected pot share versus random unknown hands, splitting ties by the actual number of winners; not profit probability |
| Blackjack | Single-hand EV differs from whole-game EV; infinite-deck, DAS, no-surrender examples: S17 −0.570%, H17 −0.789%, S17 with 6:5 −1.923% |
| 24 Game | A mathematical exercise with no gambling win rate |

### Time and net return

Visible time persists locally across visits, both for the whole site and for
each tool. Hidden tabs and screen locking pause the timer. An overlapping tab
must not overwrite newer totals. Time spent outside this page cannot be measured.

The wage comparison uses **S$12.04 gross/hour**, the
[MOM Food Services PWM counter-attendant benchmark](https://www.mom.gov.sg/employment-practices/progressive-wage-model/food-services-sector)
for **1 July 2026–30 June 2027**, covering eligible citizen/PR employees at
covered employers. This is a fast-food work comparison, **not an official
McDonald's quote or guaranteed take-home income**.

`Net return = hypothetical game proceeds − time in this tool × hourly benchmark`

Blackjack calculates example expected proceeds from a hypothetical sum of
initial stakes and an explicitly selected rule set. Dice and Hold'em accept
hypothetical net proceeds after rake; a win rate alone cannot determine cash
return. All inputs default to zero/no money wagered. 24 Game subtracts time
cost from zero cash proceeds. Learning and entertainment value are not priced.

For example, S$1,000 of initial stakes at −0.570% over one hour gives
**−S$5.70 − S$12.04 = −S$17.74**. This is an expectation, not a promised outcome.

Home tiles use `localStorage['bar.lastUsed']` to put recently used tools first;
unseen tools retain the default order, and tiles do not move while on the home
screen. Calculation inputs, timing and usage history stay on the device.

Release details: [2026-09-12](CHANGELOG.md).

---

## Why you should believe the numbers

A tool used at a gambling table is worse than useless if it's subtly wrong.
So the substance of this project isn't the features — it's the evidence that
the math is right.

### Every engine is anchored to an externally checkable fact

| Engine | Anchor |
|---|---|
| Hold'em evaluator | All C(52,5) = 2,598,960 five-card hands enumerated. The nine category counts must **exactly** equal the combinatorial results: 40 straight flushes, 624 quads, 3,744 full houses, 5,108 flushes, 10,200 straights, 54,912 trips, 123,552 two pair, 1,098,240 one pair, 1,302,540 high card |
| Hold'em equity | Suit-averaged AA vs KK measures **81.90%** against the published 81.9%; AKs vs QQ measures 46.0% |
| Blackjack | No built-in strategy chart — EV is computed recursively from the rules. Under infinite-deck, DAS, no-surrender rules, basic strategy yields **−0.570%** (S17 + DAS), **−0.789%** (H17), **−1.923%** (6:5 blackjack), all matching the published house edges |
| 24 Game | **1,362** of the 1,820 four-card multisets from 1–13 are solvable, matching the commonly cited figure |
| Liar's Dice | "This bid holds" is an exact binomial tail, cross-checked case by case against 400k Monte Carlo trials to three decimal places |

### Gates have to be proven to fire

All-green means nothing if the tests can't fail. Every layer ships with fault
injection: a specific bug is written into the engine and the matching test is
required to break.

```
395  unit assertions          node test/verify-{dice,24,holdem,blackjack}.js
 78  fault injections         node test/fault-{inject,24,holdem,blackjack}.js   0 escapes
251  real-browser assertions  python3 test/browser.py       (number reconciliation, card faces, tap targets)
 28  anonymous live checks    python3 test/live-smoke.py    (including a real offline test)
     thumb reachability       python3 test/thumb-reach.py [w h]
```

`./build.sh` runs every gate, stages the candidate bundle into a **temporary
directory**, points `test/browser.py` at that candidate, and only overwrites
`site/` once the real browser suite passes too. A failure anywhere leaves the
previously-passing `site/` untouched, byte for byte. The bytes tested under
node are inlined into the HTML verbatim (literal substitution, no regex), so
there is no "verified A, shipped B".

Fault injection runs against disposable copies of `src/` and `test/`, never
against the working source. Interruption cannot leave a mutant in the release.

Three of the browser assertions are **front-end** fault injections: the card
renderer is mutated in memory only (swap hearts with diamonds, give the
suitless blackjack/24 cards a random suit, change the card height to 90px) and
each mutation is required to turn its own gate red. The disk artifact is never
modified.

### Eight rounds of adversarial external review

`reviews/` holds the complete record: two independent reviewers — one auditing
only the math, one only the interaction — went eight rounds and filed 20+
findings. **Every single one reproduced; none was a false positive.**

The most valuable findings weren't "the math is wrong." They were **"the test
passed for the wrong reason"**:

- A gate re-implemented the elimination formula instead of exercising the
  production path — mutating the real code left it green.
- A gate scanned for `NaN|undefined|Infinity` while the actual symptom was
  `±—` next to a fabricated simulation count. The symptom wasn't in the list.
- A gate froze a **factual error** into an assertion: it demanded that a
  position display "no legal raise left" when the rules still permitted eight.

That class of defect is nearly impossible to find alone, because whoever wrote
the test and whoever wrote the code share the same blind spots.

---

## Running it

```bash
node --version                                            # Node 18+
rsvg-convert --version                                    # brew install librsvg
pip install "playwright>=1.45" && playwright install chromium     # for browser tests

./build.sh                                                # runs all gates, emits site/
python3 -m http.server 8000 --directory site
```

### The test layers

```bash
node test/verify-dice.js          # liar's dice engine
node test/verify-holdem.js        # hold'em (includes the full C(52,5) census)
node test/verify-blackjack.js     # blackjack (includes a 400k-hand MC reconciliation)
node test/verify-24.js            # 24 game (includes the full 1,820-set census)

node test/fault-inject.js         # fault injection: proves the gates above fire
node test/fault-holdem.js
node test/fault-blackjack.js
node test/fault-24.js

python3 test/browser.py           # real browser: click-throughs, number reconciliation, geometry
python3 test/live-smoke.py [url]  # anonymous production check (includes offline)
python3 test/thumb-reach.py 375 667
python3 test/pwa-update.py site   # CSS-only SW update + offline reload
python3 test/responsive.py http://localhost:8000  # narrow / landscape / tablet flows
```

### Measurement, not pass/fail

```bash
node test/robustness.js       # strategy strength against three structurally different opponents
node test/ranker-split.js     # evidence table behind the per-player-count ranker split
node test/band-safety.js      # global safety sweep of the elimination band
node test/calibrate.js        # parameter calibration
```

---

## A few non-obvious design decisions

**The liar's dice ranker splits on player count.** `N ≥ 3` uses a rollout —
freeze the bid and play the round out against modelled opponents. `N = 2` uses
a two-ply lookahead model instead. This wasn't designed, it was measured: heads
up, the rollout lost to the two-ply model against all five opponent types, and
five different tunings failed to rescue it. The evidence table lives in
`test/ranker-split.js`.

**Elimination cuts by noise band, never by rank.** Coarse rounds have few
samples and lots of noise; the true optimum can easily land fifth. Keeping "the
top N" therefore discards it permanently — external review found two such
counterexamples. Bands now narrow as samples grow (4.5σ → 3.5σ → 3.0σ), and a
global sweep of 17,850 first-round eliminations never dropped the true optimum.

**"This bid holds" is exact; "you don't drink this round" is simulated.** The
two are labelled differently in the UI and the simulated one carries a 95%
confidence interval. Nothing ever displays 100% or 0% unless it is genuinely
certain — rounding 99.66% up to "100%" is the kind of lie that costs someone
money at a table.

**Blackjack and 24 cards carry no suit, and none is invented.** The blackjack
engine has already collapsed J/Q/K into "10", so it genuinely does not know
which card you hold; drawing a specific king of spades would imply knowledge
the tool does not have. Those cards get a suitless double index instead, with
"10 含 J/Q/K" written next to the tray. Hold'em cards, which do carry a real
rank and suit, get a double corner index plus an inline SVG pip — the suit
shapes are identified in the test suite by their own geometry (a heart has a
notch at the top centre, a diamond has a bottom point), not by reading back the
`data-c` the renderer was given.

**The 24 solver uses exact rationals** — but measurement showed this is
belt-and-braces rather than load-bearing for four cards from 1–13: no
expression value lands within 24 ± 0.001 without being exactly 24. That's
written into the source comment so nobody re-derives the wrong conclusion.

---

## Layout

```
src/engine-dice.js        liar's dice: binomial + rollout + successive elimination
src/engine-holdem.js      hold'em: 5- and 7-card evaluators + Monte Carlo equity
src/engine-blackjack.js   blackjack: EV computed recursively from the rules
src/engine-24.js          24 game: exact-rational exhaustive search
src/app-shell.html        shell + all styling
src/app.js                router + the four tool UIs
build.sh                  gates → inline engines → emit site/
test/                     the four test layers
reviews/                  the full record of eight external review rounds
```

## Deploying

```bash
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
NODE_OPTIONS="--require $PWD/force-ipv4.js" \
  npx wrangler pages deploy site --project-name bar-tools --branch main --commit-dirty=true
python3 test/live-smoke.py     # always run after deploying
```

`force-ipv4.js` is a monkey patch around an IPv6 black hole on the build
machine — wrangler/undici prefers IPv6 and fails with `fetch failed` without it.

## License

MIT
