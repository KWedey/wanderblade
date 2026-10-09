# Playtests

Real hands on a real phone. One entry per session. This file is the exit
artifact for M3F (ADR #63); the simulator and `npm run qa:session` are not.

## How to run one

1. On the Mac: `npm run dev -- --host`, then open `http://<mac-ip>:5173/?seed=<n>` on the phone. Use a fresh seed so the save is empty.
2. Start a stopwatch. Play as you would: tap, buy what looks good, enter the portal when it opens.
3. Note the moments below as they happen. Stop after ascension or 30 min, whichever comes first.
4. One sentence on what tapping felt like. That sentence is the point of the test.

## Entries

### YYYY-MM-DD — <phone model>, seed <n>, <name>

| Moment | Time |
|---|---|
| Zone 2 | |
| Portal opened | |
| Entered | |
| Ascended | |

- Tapping felt like: 
- Tried to buy but could not: 
- Confusing: 
- Best moment: 
- Verdict (fun / not yet / no): 

Headless reference for the same seed, `npm run qa:session -- --seed <n>`: portal ~17 min, ascension ~24 min, fight ~6.7 min at a 300 ms tap setting.
