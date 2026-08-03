# Music and sound brief

Yes — music is worth doing, and it's a good chunk to run in parallel since it
doesn't block the engine.

## The one constraint that matters most

**Nothing may sound like punishment.**

The design doc's learner section explains why: Rion's history with math is
unfinished timed work leading to lost recess and meltdowns. A descending
"wah-wah" trombone, a game-show buzzer, or a harsh error tone would re-create
that association in about a second, and it would undo work the rest of the game
is doing carefully.

A wrong answer should sound like **a crowd's sharp intake of breath** — the
"ooooh" of a near miss. Anticipation, not judgement. The emotional message is
*that was close, go again*, never *you failed*.

Same rule for the tackle-back timer: tense is fine, alarming is not. Think a
rising heartbeat, not a countdown alarm.

## Where music plays, and where it doesn't

This follows the cognitive-load mitigation in the design. While a question is
live, the screen dims and stops moving — audio does the same.

| Moment | Audio |
|---|---|
| Menus, country creator | Full music |
| Between questions, during play | Stadium ambience, low |
| **While a question is on screen** | Ambience ducks to near-silence. No melody. |
| Result moments, transitions | Music and stings |

Melodic music demands attention; a crowd bed doesn't. So the crowd stays and
the tunes step back whenever he's actually thinking.

## Track list

Instrumental only — no lyrics, no vocal hooks. Lyrics compete with verbal
working memory, which is exactly the resource the math needs.

### Loops (seamless, 60–120s each)

1. **Main theme / country creator** — warm, anthemic, hopeful. The feeling of a
   tournament about to start. This is the one he'll hear most; make it the best.
2. **Training Ground** — calm, low-key, focused. Almost lo-fi. Should be
   pleasant for twenty minutes without ever pulling attention.
3. **Match ambience** — crowd bed, no melody. Murmur, occasional swell. Should
   sit under everything without demanding anything.
4. **Tournament / knockout** — the same melodic material as the main theme, but
   tenser and bigger. Reusing the motif makes progression feel like the same
   story escalating.
5. **Penalty shootout** — sparse, high tension, heartbeat pulse. Very quiet, very
   taut. (Phase 2, but nice to have early.)

### Stings (1–3 seconds)

6. **Goal** — bright, triumphant, brief. Should make him want another.
7. **Near miss / wrong answer** — crowd intake of breath. See the constraint above.
8. **Tackle-back won** — a quick surge of relief and momentum. This one should
   feel *great*; clawing the ball back is the behaviour we most want to reinforce.
9. **Conceded** — subdued crowd reaction, disappointed but not harsh. The
   opposition's crowd celebrating in the distance works well.
10. **Brave attempt** — plays when he chooses the bicycle kick or a shot from
    outside the 18, **at the moment he chooses it, before the outcome is known**.
    A short rising flourish. This one is doing real psychological work: it
    rewards the decision to try the hard thing independently of whether it comes
    off.
11. **Card reveal** — anticipation into fanfare, for the end of the try-out and
    for stat increases.
12. **Level-up / "this used to beat you"** — warm, earned, a little emotional.
    Plays when a standard crosses a level that previously defeated him.

### Optional if you're enjoying yourself

13. **Victory theme** (30–60s) — winning a World Cup. Should feel enormous.
14. **Eight national anthem stings** (~5s each) — a brief nod to each opponent's
    musical character before kickoff. Original melodies suggesting the country,
    not actual national anthems.

## Technical

| Setting | Value |
|---|---|
| Format | `.ogg` preferred, `.mp3` fallback |
| Loops | Seamless — no gap or click at the loop point. Test by looping ten times. |
| Levels | Normalise to about −16 LUFS; stings a touch hotter |
| Budget | Under ~6 MB total so first load stays fast on the iPad |
| Naming | `public/audio/theme-main.ogg`, `sting-goal.ogg`, etc. |

Two implementation notes I'll handle in code:

- Browsers block autoplay until a user gesture, so the first tap unlocks audio.
- There will be a mute toggle and separate music/SFX sliders in settings, and
  they'll persist. If the music ever becomes a distraction it has to be one tap
  away from gone.

## Acceptance

- Nothing in the set sounds punitive, especially #7 and #9
- Loops are genuinely seamless
- The Training Ground loop survives twenty minutes without irritating anyone
- Total payload under 6 MB
