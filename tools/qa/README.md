# QA tools

Three scripts that answer a question about the running game with numbers instead
of an opinion. Each takes `--help`; this file only says which one to reach for.

| Command | The question it answers |
| --- | --- |
| `npm run qa:capture -- --label <name>` | What does the game look like right now, at desktop size, mid-swing? |
| `npm run qa:mobile` | Does the layout hold on a phone, is the type on the world's pixel grid, and does anything load-bearing sit under the notch? |
| `npm run qa:wiring` | Does the live page register the listeners a held strike depends on? Unit tests cover the rule; only this covers the wiring. |
| `npm run qa:mobile -- --selftest` | Plants a decoy button under each inset and exits non-zero if the notch check misses them. Run it whenever that check reports clean. |
| `npm run qa:pixels -- <png> <x> <y> <w> <h>` | What colour is that region, so a claim about the art can be settled? |

They need a dev server. Start one with `npm run dev`, then pass `--port` (or set
`WB_QA_PORT`) — every tool prints the port it used, because reading a
measurement off another branch's server has cost this project a round.

Browser work goes through `dev-browser`'s Playwright (`npm i -g dev-browser &&
dev-browser install`). Playwright is not a repo dependency: the browser download
is far heavier than three scripts justify.

Output lands in `.gauntlet/`, which is gitignored. The images are throwaway; the
tools are not, which is why they live here.

## Every capture names the checkout that rendered it

`qa:capture` writes a `.json` beside each `.png` recording the port, the checkout it was
run from, and the checkout the dev server is actually serving. Several dev servers run
here at once on different worktrees, and reading QA off the wrong port has twice invented
bugs that did not exist.

It warns on two mismatches:

- the serving checkout is a different commit from the one you ran from
- the serving checkout is dirty, so the frame is not the commit it claims. Two worktrees
  sharing one branch share its ref, so a stale checkout reports the newest commit while
  serving the old files. HEAD alone cannot see this.
