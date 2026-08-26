// Bootstrap: mount the view, construct the controller, wire user intents, and
// start the loop. This is the only module that touches the DOM entry point.

import './styles.css';
import { Game } from './game';
import { createView, type ViewHandlers } from './view';

const root = document.getElementById('app');
if (!root) throw new Error('main: #app mount point missing');

// The handlers close over `game`, which is assigned before any of them can fire
// (they only run on user interaction, after start()).
let game: Game;

const handlers: ViewHandlers = {
  onStrike: (outcome) => game.strike(outcome),
  onBuyLevel: () => game.buyLevel(),
  onBuySkill: (id) => game.buySkill(id),
  onEnterPortal: () => game.enterPortal(),
  onAbandonBoss: () => game.abandonBoss(),
  onCollectRecap: () => game.collectRecap(),
  onReset: () => game.reset(),
  onToggleMute: () => {
    game.setMuted(!game.isMuted());
    return game.isMuted();
  },
  onTimeWarp: (seconds) => game.timeWarp(seconds),
};

const view = createView(root, handlers);
game = new Game(view);
game.start();
