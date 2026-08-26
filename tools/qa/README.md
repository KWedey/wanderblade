# QA tools

Three scripts that answer a question about the running game with numbers instead
of an opinion. Each takes `--help`; this file only says which one to reach for.

| Command | The question it answers |
| --- | --- |
| `npm run qa:capture -- --label <name>` | What does the game look like right now, at desktop size, mid-swing? |
| `npm run qa:mobile` | Does the layout hold on a phone, is the type on the world's pixel grid, and does anything load-bearing sit under the notch? |
| `npm run qa:pixels -- <png> <x> <y> <w> <h>` | What colour is that region, so a claim about the art can be settled? |

They need a dev server. Start one with `npm run dev`, then pass `--port` (or set
`WB_QA_PORT`) — every tool prints the port it used, because reading a
measurement off another branch's server has cost this project a round.

Browser work goes through `dev-browser`'s Playwright (`npm i -g dev-browser &&
dev-browser install`). Playwright is not a repo dependency: the browser download
is far heavier than three scripts justify.

Output lands in `.gauntlet/`, which is gitignored. The images are throwaway; the
tools are not, which is why they live here.
