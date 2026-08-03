# Nano Banana prompt pack

Everything needed to generate the 14 character images for World Math Cup.
Generate with Gemini / Nano Banana, chosen for character consistency across
images — the hard part here is that Rion must be recognisably the same person
in every shot.

## Before you start: the likeness decision

Two routes to making the hero look like Rion.

**A. Written description only.** Fill in the character sheet below and let the
model work from text. Nothing about him leaves your machine. Likeness will be
"a kid who could be him" rather than him.

**B. Reference photo.** Nano Banana handles image-to-image character reference
well, and a photo gets a much closer likeness. This means uploading a photo of
your 10-year-old to Google, where it is subject to their retention and training
policies. That is your call to make, not mine — I'm flagging it because it is
easy not to think about in the moment.

If you pick B, still fill in the character sheet. The text keeps him consistent
across the *later* images even when the reference drifts.

## The style string

Paste this verbatim into every prompt. Do not paraphrase it between images —
drift in the style string is the main cause of a cast that doesn't look like it
belongs to the same game.

> Style: painterly semi-realistic anime illustration in the manner of modern
> Japanese tactical RPG character art. Clean confident linework, soft cel
> shading with painted highlights, warm cinematic rim lighting from the upper
> left. Grounded, slightly realistic proportions — not chibi, not exaggerated.
> Detailed fabric and stitching on kit. Rich saturated colour, high contrast,
> crisp edges suitable for compositing. Full-colour digital painting.

## The locked character sheet — FILL THIS IN

Append this verbatim to every prompt that includes Rion. Be specific and pick
attributes that don't change shot to shot. Avoid anything mood-dependent
(expression, pose) — those go in the per-asset prompt instead.

> Character: RION — a 10-year-old boy. [HAIR: length, texture, colour, e.g.
> "short wavy dark brown hair with a slight cowlick at the crown"].
> [EYES: colour and shape, e.g. "warm brown eyes, slightly rounded"].
> [SKIN: tone]. [BUILD: e.g. "slim, average height for his age"].
> [DISTINGUISHING: freckles, glasses, gap teeth, a scar, whatever is stable].
> He wears the national kit of Rionia: [KIT COLOURS from the flag he designs],
> jersey number 10, with the Rionia crest on the left chest.

Two rules that matter more than they look:

1. **Never change a word of it between images.** Even reordering clauses can
   shift the output.
2. **Kit colours must match the flag Rion builds in-app.** So build the country
   *first*, then fill this in. If the art is generated before he designs the
   flag, either the art or his flag ends up wrong, and it should never be his.

## Workflow order

Consistency comes from bootstrapping off a locked first image, so do this in
order:

1. Generate **rion-portrait** until you're happy. This is the anchor.
2. Feed that image back as a reference for **rion-celebration** and
   **rion-ready**. Same character sheet, same style string, new pose.
3. Generate the eight **captains**. Each is independent, but the style string
   must be identical or they won't read as one tournament.
4. Generate **coach** and the two **analyst** poses.

## Technical specs

| Setting | Value |
|---|---|
| Resolution | 1024×1024 minimum, higher is fine |
| Portraits | 3:4 |
| Celebration / action | 4:5 |
| Coach / Analyst | 1:1 |
| Background | **Flat single-colour background, no scenery** — say so in every prompt. It keys out cleanly for compositing. |
| Format | PNG |

Save into `public/art/` with exactly these names, lowercase, hyphenated:

```
rion-portrait.png      rion-celebration.png   rion-ready.png
captain-brazil.png     captain-germany.png    captain-italy.png
captain-argentina.png  captain-france.png     captain-uruguay.png
captain-spain.png      captain-england.png
coach.png              analyst-explaining.png analyst-thinking.png
```

## Asset prompts

Each prompt below is `[STYLE STRING] + [CHARACTER SHEET, if Rion] + the text
here + "Flat single-colour background, no scenery."`

### rion-portrait
> Chest-up portrait, facing three-quarters toward the viewer, chin slightly
> raised, calm and determined expression with a hint of a smile. Confident but
> not cocky. The expression of someone about to walk out of the tunnel.

### rion-celebration
> Full-body action pose mid-celebration — arms flung wide, head back, pure
> unguarded joy, one foot leaving the ground. Motion in the hair and jersey.

### rion-ready
> Full-body standing pose, weight on the back foot, hands loose at his sides,
> eyes forward and focused. Ready to receive the ball. Neutral and repeatable —
> this is the default pose shown between questions.

### Opponent captains

**Important: these are fictional characters, not real footballers.** Do not
name, describe, or reference any actual player. Every captain is an invented
person who happens to wear a national kit. This avoids both the likeness
problem and the uncanny "is that supposed to be someone?" effect.

Base prompt for each, substituting the bracketed parts:

> Chest-up portrait of a fictional [COUNTRY] national team captain, an adult
> footballer in their late twenties. [DESCRIPTION]. Wearing the [KIT] national
> kit with the captain's armband. Expression: [EXPRESSION]. Facing
> three-quarters toward the viewer.

| Country | Kit | Suggested expression |
|---|---|---|
| Brazil (5★) | yellow shirt, green trim, blue shorts | Serene, utterly unbothered — the best team in the world knows it |
| Germany (4★) | white shirt with black detailing | Cool, analytical, appraising |
| Italy (4★) | deep azure blue shirt | Watchful, arms-folded stillness |
| Argentina (3★) | sky blue and white vertical stripes | Fierce, chin down, intense |
| France (2★) | dark blue shirt, white and red trim | Relaxed, faintly amused |
| Uruguay (2★) | sky blue shirt | Weathered, stubborn, immovable |
| Spain (2★) | red shirt, gold trim | Bright, quick-eyed, newly crowned |
| England (1★) | white shirt, navy trim | Earnest, hopeful, slightly nervous |

Vary hair, build, and skin tone across the eight so they don't read as the same
person in different kits. Give each a distinct silhouette.

### coach
> Chest-up portrait of a warm, experienced football coach in their fifties,
> wearing a training jacket with a whistle around the neck. Weathered kind face,
> laugh lines, direct eye contact. The expression of someone about to tell you
> something useful and short. Approachable, never stern.

### analyst-explaining
> Chest-up portrait of a friendly football analyst in their thirties in a
> smart-casual shirt, mid-gesture with one hand raised as if drawing a line in
> the air, mouth slightly open mid-sentence. Engaged and patient. The look of
> someone who genuinely enjoys explaining why something works.

### analyst-thinking
> Same character as analyst-explaining, chest-up, one hand at the chin, eyes
> slightly narrowed in thought, considering. Attentive rather than puzzled.

## Acceptance

Before wiring them in, check:

- Rion is recognisably the same child across all three of his images
- No captain resembles an identifiable real person
- All 14 share one visual language — same lighting direction, same line weight
- Backgrounds are flat and key out cleanly
- Kit colours match the flag built in-app
