# Wanderblade — SRD Content Policy and Provenance

## Selected source and license

Wanderblade uses **System Reference Document 5.2.1** as the sole Dungeons & Dragons content source. SRD 5.2.1 is published by Wizards of the Coast LLC under the **Creative Commons Attribution 4.0 International License (CC-BY-4.0)**.

- Official landing page: <https://www.dndbeyond.com/srd>
- Selected artifact: *System Reference Document 5.2.1*, published May 1, 2025
- License: <https://creativecommons.org/licenses/by/4.0/legalcode>

This policy is intentionally narrower than everything permitted by the license: Wanderblade uses recognizable SRD-listed monster names and archetypes, then supplies original art, animation, encounter design, stats, drops, realm lore, and portal lore.

## Required attribution

The following statement must appear in credits and any distributed third-party notices that include SRD-derived content:

> This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Do not add other Wizards, D&D, or affiliate attribution or compatibility claims without a separate review of the official guidance.

## Content rules

1. Verify every adopted name or adapted element in the selected SRD 5.2.1 artifact.
2. Record the exact SRD entry and page in the provenance roster below.
3. State precisely what is adapted. A familiar name does not authorize unrelated setting lore, art, or text from another source.
4. Write original Wanderblade descriptions and mechanics unless verbatim SRD text is deliberately required and recorded.
5. Use original or separately licensed art and audio; SRD 5.2.1 does not grant rights to unrelated D&D artwork.
6. Exclude material that appears only in other D&D books, settings, adventures, websites, or products.
7. Treat omitted or protected names as unavailable even if players associate them with D&D.
8. Review credits and this roster before every public release containing SRD-derived content.

## Approved seed roster

This initial roster records the three monster families explicitly selected during the August 2026 direction review. It authorizes only the listed adapted elements; production variants still require original Wanderblade treatment.

| Wanderblade use | SRD 5.2.1 source | Adapted elements | Original Wanderblade elements required |
|---|---|---|---|
| Goblin family | Goblin Warrior, p. 290; Goblin Minion and Goblin Boss, p. 290 | Names and recognizable goblin archetype | Art, animation, stats, abilities, drops, groups, lore |
| Gnoll family | Gnoll Warrior, p. 289 | Name and recognizable gnoll archetype | Art, animation, stats, abilities, drops, groups, lore |
| Dragon portal guardians | Dragon stat blocks, pp. 263–341; exact color/age entry must be recorded when selected | Dragon names and recognizable dragon archetype | Art, animation, boss mechanics, HP/DPS tuning, rewards, portal and realm lore |

## Provenance roster — shipped creature names using an SRD/folklore base word

The shipped roster (`app/src/species.ts`) carries 18 names beyond the three families above whose base word also names, or resembles, an SRD 5.2.1 monster. This section records provenance for each, per rule 2. `docs/DECISIONS.md` #49 records the review that produced this table; `.omc/blockers/srd-monster-name-provenance.md` records the licensing analysis behind it (SRD 5.2.1 is CC-BY-4.0 — using its names with attribution is permitted, so this is a provenance-recording exercise, not a rename).

Every SRD entry and page below was verified against the official artifact — `https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf` — by text search, not by memory or a third-party index.

Several names are compounds where only the base word is the SRD or folklore term; the modifier is original Wanderblade and is never claimed as adapted.

**Group 1 — base word has a matching SRD 5.2.1 stat block.**

| Wanderblade use | SRD 5.2.1 source | Adapted elements | Original Wanderblade elements required |
|---|---|---|---|
| Wyvern | Wyvern, p. 343 | Name and recognizable wyvern archetype | Art, animation, stats, abilities, drops, lore |
| Iron Kobold | Kobold Warrior, p. 302 — SRD's only kobold stat block; there is no generic "Kobold" entry | Base word ("Kobold") and recognizable kobold archetype | "Iron" modifier, art, animation, stats, abilities, drops, lore |
| Anvil Ogre | Ogre, p. 312 | Base word and recognizable ogre archetype | "Anvil" modifier, art, animation, stats, abilities, drops, lore |
| Tomb Wight | Wight, p. 341 | Base word and recognizable wight archetype | "Tomb" modifier, art, animation, stats, abilities, drops, lore |
| Will-o'-Wisp | Will-o'-Wisp, p. 341 | Name and recognizable will-o'-wisp archetype | Art, animation, stats, abilities, drops, lore |
| Cinder Imp | Imp, p. 300 | Base word and recognizable imp archetype | "Cinder" modifier, art, animation, stats, abilities, drops, lore |
| Moss Troll | Troll, p. 333 | Base word and recognizable troll archetype | "Moss" modifier, art, animation, stats, abilities, drops, lore |
| Green Sprite | Sprite, p. 329 | Base word and recognizable sprite archetype | "Green" modifier, art, animation, stats, abilities, drops, lore |
| Star Wraith | Wraith, p. 342 | Base word and recognizable wraith archetype | "Star" modifier, art, animation, stats, abilities, drops, lore |
| Ember Wraith | Wraith, p. 342 | Base word and recognizable wraith archetype | "Ember" modifier, art, animation, stats, abilities, drops, lore |

Several of these base words (ogre, troll, imp, sprite, wraith, wight, will-o'-wisp) are also generic folklore predating D&D. Where an exact SRD stat block exists, it is recorded above as the source rather than relying on the folklore claim alone.

**Group 2 — generic folklore, no SRD entry adopted or needed.** The base word predates D&D and is owned by nobody; no citation is claimed.

| Wanderblade use | SRD 5.2.1 status | Adapted elements | Original Wanderblade elements required |
|---|---|---|---|
| Mire Hag | Not adopted. SRD has only *specific* hag types — Green Hag p. 295, Night Hag p. 311, Sea Hag p. 322 — and none of those qualifiers is used here. "Hag" alone is generic witch/hag folklore predating D&D | Base word only, as folklore | "Mire" modifier, art, animation, stats, abilities, drops, lore |
| Rock Wyrm | Not adopted. SRD has no generic "Wyrm" stat block — only "Wyrmling" attached to dragon-color entries (e.g. Black Dragon Wyrmling, p. 263). "Wyrm" is an Old English/Norse word for dragon or serpent, predating D&D | Base word only, as folklore | "Rock" modifier, art, animation, stats, abilities, drops, lore |
| Frost Drake | Not adopted. "Drake" does not appear anywhere in SRD 5.2.1 (verified by full-text search). It is an archaic English word for dragon, predating D&D | Base word only, as folklore | "Frost" modifier, art, animation, stats, abilities, drops, lore |
| Marsh Drake | Same as Frost Drake | Base word only, as folklore | "Marsh" modifier, art, animation, stats, abilities, drops, lore |
| Forge Golem | Not adopted. SRD has only material-specific golems — Clay p. 274, Flesh p. 285, Iron p. 302, Stone p. 330 — and none of those qualifiers is used here. "Golem" is Jewish/Prague folklore (16th c.), predating D&D | Base word only, as folklore | "Forge" modifier, art, animation, stats, abilities, drops, lore |
| Rubble Golem | Same as Forge Golem | Base word only, as folklore | "Rubble" modifier, art, animation, stats, abilities, drops, lore |
| Ash Revenant | Not adopted. "Revenant" does not appear anywhere in SRD 5.2.1 (verified by full-text search, and absent from the 5.1 SRD indexes too). It is an established English/French folklore and gothic-literature term for a returning undead spirit, predating D&D | Base word only, as folklore | "Ash" modifier, art, animation, stats, abilities, drops, lore |
| Astral Behemoth | Not adopted. "Behemoth" does not appear anywhere in SRD 5.2.1 (verified by full-text search). It is a biblical term (Book of Job) for a giant beast, predating D&D by millennia | Base word only, as folklore | "Astral" modifier, art, animation, stats, abilities, drops, lore |

**Group 3 — neither SRD entry nor established pre-D&D folklore.** None of the 18 names fall here. Every base word above either has a matching SRD 5.2.1 stat block (Group 1) or is a generic word predating D&D by decades to millennia (Group 2).

**Note on count.** The task that produced this table named "17 names"; the actual list it enumerated, and the actual set of matching names in `app/src/species.ts`, is 18 (Star Wraith and Ember Wraith are two separate names sharing one base word). All 18 are recorded above.

## Provenance review checklist

- [ ] The exact name appears in SRD 5.2.1.
- [ ] Page and entry name are recorded above.
- [ ] Adapted elements are no broader than the licensed source.
- [ ] Descriptions, mechanics, art, and audio are original or separately licensed.
- [ ] No non-SRD setting, character, deity, story, trade dress, logo, or artwork is used.
- [ ] Required attribution is present in the distributed credits/notices.
- [ ] Adaptations and modifications to sourced material are identified under CC-BY-4.0.
