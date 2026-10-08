// The Neuro-Fluent Connected Speech Rulebook — the AI's source of truth.
// Edit this text to change how breakdowns are made. (Use ' instead of backticks inside it.)

export const RULEBOOK = `
# Neuro-Fluent — Connected Speech Rulebook

Purpose: every transformation that turns "textbook English" into "how Americans actually say it fast."
American English only. Audience = Russian-speaking adult learners (mostly IT).

## 0. THE ONE BIG IDEA
English rhythm = stressed content words stay loud & clear; function words get crushed into the gaps between them.
- Content words (KEEP CLEAR): nouns, main verbs, adjectives, adverbs, question words, negatives.
- Function words (CRUSH): to, of, and, the, a, for, you, your, him, her, them, can, was, are, do, have, has, had, been, at, in, that…
Russian-learner note: Russians tend to pronounce every word fully and equally. The trick is the opposite — blur the small words, land hard on the big ones.

## 1. RESPELLING KEY (no IPA, readable eye-spelling)
| Sound thing | Write it as | Example |
| Schwa (lazy "uh") | uh or a reduced vowel | of → uh, to → tuh |
| Flap T/D (fast "d") | d | water → wader, get a → geda |
| Dropped T/D | delete it | not gonna → na gonna, next day → nex day |
| Dropped H (in pronouns) | delete the h | tell him → tellim, give her → giv'er |
| "th" that melts into next sound | fold it in | with someone → wissamwan |
| Linked words (one breath) | glue with no space | one more → wammore |
| Stress | CAPS the loud syllable in RHYTHM | wam-MORE |
Cyrillic crutch (optional): wammore → уамор, gonna → гана, whatcha → уача, wissamwan → уисамуан.
Cyrillic can't show th, the American R, or the "æ" in cat — flag those. Cyrillic is a reading crutch, never the real target.

## 2. MASTER REDUCTION DICTIONARY (highest confidence)
"to" family: going to → gonna; want to → wanna; got to → gotta; used to → useta; supposed to → sposta; ought to → oughta; have to → hafta; has to → hasta; had to → hadta; need to → needa; trying to → tryna; I'm going to → I'mma.
"of" family: kind of → kinda; sort of → sorta; a lot of → a lotta; lots of → lotsa; because of → cuzza; out of → outta; cup of → cuppa; in front of → in fronna; a couple of → a coupla.
"you" family (T/D/S + you → CH/J/SH): did you → didja; would you → wouldja; could you → couldja; what do you → whaddya; what are you → whatcha; how did you → howdja; got you → gotcha; get you → getcha; bet you → betcha; don't you → doncha; won't you → woncha; miss you → mishya.
Glue words (unstressed): and → 'n / an; the → thuh (before consonant) / thee (before vowel); to → tuh / da (flap after a vowel: what to → wadda); of → uh / uv; for → fer; or → er; because → cuz; your → yer; you → ya; can → kin / kn; them → 'em; him → 'im; her → 'er; just → jus.
Contraction-style crushes: don't know → dunno; let me → lemme; give me → gimme; come on → c'mon; I don't → I dohn; there is → there'z.

## 3. THE 5 SOUND RULES (for blobs the dictionary doesn't list)
RULE A — Reduction (weak forms): any function word loses its full vowel → schwa. for → fer, at → 't, was → wuz.
RULE B — Assimilation: n → m before m/b/p (one more → wammore; in bed → im bed); n → ng before k/g (in case → ing case); th melts into s/z (with someone → wissamwan); T/D/S/Z + Y → CH/J/SH/ZH (did you → didja, won't you → woncha).
RULE C — Elision: T/D vanish inside consonant clusters (not gonna → na gonna; next day → nex day; must be → mus be; old man → ol man); H vanishes in unstressed pronouns (tell him → tellim; give her → giv'er; is he → izee).
RULE D — Linking: consonant → vowel links across words (an apple → a-napple; pick it up → pi-ki-dup); linking R (far away → fa-raway); intrusive sounds (go on → go-won; I am → I-yam; idea of → idea-r-of).
RULE E — Flapping: T or D between two vowel sounds → soft d (water → wader; better → bedder; get a → geda; about it → aboudit; a lot of → a-lo-duh).

## 4. STRESS & RHYTHM
Mark the loud syllable in CAPS in the rhythm line. One strong beat per content word, function words squeezed between beats.

## 5. WORKED EXAMPLES
1) "I'm leaving cuz I'm not gonna spend one more day with someone who's out to sabotage my every move."
FAST: I'm leaving kzamnagana spend wammore day wissamwan who's out to sabotage my every move.
RHYTHM: I'm LEAV-ing kz-am-na-GAN-na SPEND wam-MORE DAY wiss-am-WAN HOOZ out-tuh SAB-uh-tahj my EV-ry MOOV.
Blobs: cuz I'm not gonna → kzamnagana (Reduction + Elision); one more → wammore (Assimilation n→m); with someone → wissamwan (th melts into s).
2) "What are you going to do about it?" → whatcha gonna do aboudit? RHYTHM: WHAT-cha GON-na DO uh-BOU-dit?
3) "Did you get a lot of work done today?" → didja geda lotta work done t'day? RHYTHM: DID-ja GED-uh LOT-tuh WORK DUN t'DAY?
4) "I don't know what to tell him." → I dunno wadda tellim. RHYTHM: I d'NO WAH-duh TEL-im.

## 6. WHEN NOT TO REDUCE
- Stressed for contrast or emphasis → keep it full ("I DID start" — emphatic did stays loud).
- Start-of-sentence function words reduce less.
- Content words never crush beyond a natural flap.
- Over-reduction is worse than under-reduction. If unsure, keep it clearer and flag it.
- Mainstream American. Note if a form is casual/slangy.

## 7. RUSSIAN-LEARNER CHEATS
- th (this/with) is hard for RU speakers → in fast speech it often disappears (wiss, wi') — lean into it.
- RU already reduces unstressed vowels (аканье) → schwa is a friend, transfer it.
- The killer habit to break: saying every word at equal volume. Small words = quiet & fast.
- American R and æ (cat) can't be written in Cyrillic — always target by ear.
`.trim();
