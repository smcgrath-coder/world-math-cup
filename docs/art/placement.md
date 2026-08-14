# Where the character art goes

The prompt pack says what to draw. This says where each one lands, and — more
usefully — the two screens that are **not** getting a picture and why.

Files go in `public/art/`, lowercase and hyphenated, exactly as the pack names
them. Nothing reads them yet.

## Placed

| File | Screen | Why there |
|---|---|---|
| `rion-portrait.png` | Card tab, above `PlayerCard` | The card is the one screen purely about him. It goes *above* the card, not inside it — `PlayerCard` also draws Brazil, and a component that renders his face for an opponent is a bug waiting to happen. |
| `rion-ready.png` | Training ground, while choosing a topic | Specced as the neutral repeatable pose. The training ground is the one screen with idle time and no scoreline. |
| `analyst-explaining.png` | Film room header, when there is tape | One analyst, in the header. The first plan put one on each group card; the groups are the thing to read and a face repeated down the page competes with them. |
| `analyst-thinking.png` | Film room header, when nothing got away | Same slot, other pose. Nothing to break down, so he is not breaking anything down. |

All four render through `components/Character.tsx`, which starts hidden and fades
in on `load` rather than starting visible and hiding on `error` — same end state
when the file is there, no flash of a broken icon when it is not.

## Deliberately not placed

**`coach.png` does not go in the Coach explainer.** That file's own header sets
the rule: *"One idea per screen, and nothing else on it. No illustrations
competing for attention."* Six screens of reading is already at the limit of what
this child will sit through, and a picture on each is a reason to look at the
picture instead. If the Coach needs a face, the honest home is the settings row
that offers to read him again — a small avatar on a menu item, not a character on
a page of text.

**`rion-celebration.png` does not go at the top of post-match.** Post-match
leads with the rating rise *even after a defeat*, on purpose, and the file argues
at length that the defeat becomes the sentence underneath rather than a red
scoreline. A celebration image above that is the one thing that would put the
scoreline back in charge of the tone. It belongs on an unambiguous win — the
goal beat, or a knockout he actually took — and nowhere near a loss.

## Still to place

`coach.png` and `rion-celebration.png` are built and in `public/art/`, and
neither has a home yet for the reasons above. The celebration wants an
unambiguous win — the goal beat inside the match, or a knockout — which is a
change to the match screen rather than a picture dropped onto an existing one,
so it is worth doing deliberately rather than now.

## Still to generate

The eight captains, and whichever of the six principals are not in
`public/art/` yet. `npm test` fails if the pack's captain list drifts from tier 1
of the roster, so the pack is the list to work from rather than this file.
