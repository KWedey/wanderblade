# QA tools

Five browser probes that answer a question about the running game with numbers
instead of an opinion, plus two offline image tools. Each takes `--help`; this file only says which one to reach for.

| Command | The question it answers |
| --- | --- |
| `npm run qa:capture -- --label <name>` | What does the game look like right now, at desktop size, mid-swing? |
| `npm run qa:mobile` | Does the layout hold on a phone, is the type on the world's pixel grid, and does anything load-bearing sit under the notch? |
| `npm run qa:wiring` | Does the live page register the listeners a held strike depends on? Unit tests cover the rule; only this covers the wiring. |
| `npm run qa:mobile -- --selftest` | Plants a decoy button under each inset and exits non-zero if the notch check misses them. Run it whenever that check reports clean. |
| `npm run qa:loop` | Can a person get Road -> Portal -> Boss through the DOM, and does the projected fight land in the 15–90 minute band? |
| `npm run qa:pixels -- <png> <x> <y> <w> <h>` | What colour is that region, so a claim about the art can be settled? |
| `npm run qa:speckle -- <png> --right <x>` | Which colour is speckling the world, and how much of it? |

They need a dev server. Start one with `npm run dev`, then pass `--port` (or set
`WB_QA_PORT`) — every tool prints the port it used, because reading a
measurement off another branch's server has cost this project a round.

Browser work goes through `playwright`, a root devDependency. The npm package is
small; the browser itself is not downloaded by `npm install`, so run
`npx playwright install chromium` once. The resolver takes the first install
whose own Chromium is on disk — the repo's, then `dev-browser`'s (`npm i -g
dev-browser && dev-browser install`) — and otherwise names the missing binary.
The two are different Playwright versions, so one's browser cannot serve the other.

Every probe launches through `withBrowser`. Playwright itself closes the browser
on return, throw, exit and Ctrl-C; what stranded `chrome-headless-shell` — the
usual reason this machine sat at load 40 — was the script being SIGKILLed by a
tool timeout, which runs no hook. A watchdog now kills the browser's process
group when the script disappears.

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
