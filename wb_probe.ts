import { purchaseOptions, SKILL_IDS, ASC_NODE_IDS } from '@wanderblade/core';
import { stageFromQuery } from './app/src/devstage';

console.log('SKILL_IDS', SKILL_IDS.length, 'ASC_NODE_IDS', ASC_NODE_IDS.length);
for (const q of ['?stage=late&seed=7', '?stage=mid&seed=7']) {
  const s = stageFromQuery(q)!;
  const opts = purchaseOptions(s);
  const skills = opts.filter((o) => o.kind === 'skill');
  console.log('\n===', q, '===');
  console.log('gold', s.gold, 'level', s.hero.level, 'realm', s.realm, 'zone', s.zone, 'time', s.timeSec, 'killIndex', s.killIndex, 'banked', s.ascendancy.banked);
  console.log('opts total', opts.length);
  console.log('affordable (o.affordable, all kinds):', opts.filter(o=>o.affordable).length);
  console.log('old-test metric (unlocked&&!atMax&&gold>=cost, all kinds):', opts.filter(o=>o.unlocked&&!o.atMax&&s.gold>=o.cost).length);
  console.log('SKILL rows:', skills.length, 'skill affordable:', skills.filter(o=>o.affordable).length);
  for (const o of opts) console.log('  ', o.kind, o.id, 'rank', o.rank, 'cost', o.cost.toFixed(2), 'unlocked', o.unlocked, 'atMax', o.atMax, 'affordable', o.affordable);
}
