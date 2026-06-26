# BrainLift: Teaching Kids to *Keep* What They Learn About Code

> Structured context for AI conversations about AlphaBrilliant — a coding game that
> teaches data structures & algorithms to kids. Built from an interview, so the Spiky
> POVs are written in the owner's voice. Links marked *(verify)* should be confirmed
> before relying on them.

---

## Owners

- [Your name / handle]   <!-- fill in -->

---

## Purpose

The purpose of this BrainLift is to **redefine how kids learn to code** — rejecting the
shallow, cutesy "learn to code" genre and treating children as fully capable of real
data structures & algorithms when the *struggle* is scaffolded rather than removed.

Its North Star is a single hard truth: **kids don't fail to learn code because the
material is too hard; they fail because they never come back to it at the right time,
and because they learned the surface of a lesson instead of the pattern underneath it.**
So AlphaBrilliant is organized around two things almost everyone else skips — a
*return loop* that brings a child back to review the moment a concept starts to fade,
and *transfer* practice that shows the same pattern in many disguises until the child
sees structure, not surface.

### In Scope

- Spiky, defensible beliefs about teaching kids real CS — the kind a generic AI won't
  assert because they're contrarian and earned.
- The behavioral/relationship design of spaced repetition for children (the *return
  loop*), and how mastery learning + a no-answers AI companion serve it.
- Mapping a small set of trusted ideas (Bloom, Koster, Khan) onto concrete AlphaBrilliant
  mechanics, and a build plan for the missing review loop.

### Out of Scope

- Letting AI author my insights — AI is a Socratic sparring partner and drafting aid;
  the connections must pass through my brain.
- Block-drag "learn to code" toys, syntax-first tooling, and language/framework tutorials
  (this is about thinking patterns, not typing).
- Monetization, growth, and broad curriculum coverage beyond DSA.
- Rendering/engine/perf details, and any RAG pipeline — this document *is* the context.

---

## DOK 4: Spiky Points of View (SPOVs)

### Spiky POV 1 (the spine): For kids, spaced repetition is a *relationship* problem, not an algorithm problem.

**Elaboration.** Every edtech deck cites Ebbinghaus, and the scheduling math is trivial —
AlphaBrilliant already computes Leitner boxes and a `dueAt` for every concept. But almost
no product closes the *behavioral* loop, and for an 8-year-old a calendar reminder or a
guilt-streak is worthless. What actually brings a child back at the right interval is an
**emotional bond with a companion who needs them** — Bit. Synthesizing the spacing effect
(Knowledge Tree 1) with self-determination theory's relatedness need and Bloom's
"review-until-mastered" loop (Insight 3) gives the design rule: **the spaced-repetition
schedule should be delivered as a relationship, not a notification** — a daily "patrol"
where Bit, who's part of the child's story, asks for help right when a pattern is fading.
The contrarian claim: the hard, unsolved part of spaced repetition was never the
algorithm; it's earning the return visit — and with kids you earn it with attachment, not
reminders. *(This is also the thing AlphaBrilliant must build next: `dueConcepts()` is
computed but never surfaced.)*

### Spiky POV 2: Most "kids learn to code" products are cutesy theater that underestimates children — kids can handle real DSA if you scaffold the *struggle* instead of removing it.

**Elaboration.** The genre's instinct is to make everything softer, shorter, and more
confetti-filled, on the assumption that real algorithms are "too much" for kids. That
assumption is both wrong and harmful: lowering rigor strips out exactly the *desirable
difficulty* that produces durable learning, so the product feels delightful and teaches
almost nothing. Bloom's mastery learning (Insight 3, my load-bearing source) points the
other way — hold a genuinely high bar, but reteach and support until the child clears it.
**The respectful move is to keep the difficulty and scaffold the path to it**, not to
dumb the difficulty down. Kids will rise to two-pointers, hashing, and binary search if
the struggle is shaped and the wins are real. The spiky stance: the biggest disservice in
kids' coding ed isn't that it's too hard — it's that it's too *easy*, because adults
underestimated the kids.

### Spiky POV 3: Engagement and durable learning are in direct tension — the only honest fix is to make the effortful retrieval *be* the game, not a gate you skip to reach the fun.

**Elaboration.** The mechanics that make a game sticky (frictionless flow, variable
rewards) are largely the ones that *remove* the effortful recall that builds memory. So
"make learning fun" usually means "make forgetting fun." The resolution is not to abandon
fun but to **fuse it with the hard work**: the moment of retrieval/struggle must be the
rewarded mechanic itself. In AlphaBrilliant the boss is reached only through a retrieval
quiz and beaten by *executing the pattern under pressure* — fun is structurally downstream
of demonstrated mastery, never a substitute for it. If a learning game feels effortless
the whole way through, be suspicious: it's probably teaching very little.

### Spiky POV 4: A kids' AI tutor must *never* hand over the answer — its entire craft is shrinking the problem until the child can take the last step alone.

**Elaboration.** Bloom's 2-sigma result makes 1:1 tutoring the goal and AI makes it
scalable, but the obvious "helpful assistant" reflex — give the answer — manufactures the
illusion of learning and kills the generation effect. The skill of a good kids' tutor is
**progressive hinting that keeps shrinking the problem** until the remaining step is
small enough for the child to own, preserving both the struggle and the dignity of the
win. The measure of Bit is therefore *how small a step it leaves for the kid*, not how
quickly it resolves their confusion. AlphaBrilliant encodes this literally: Bit nudges and
won't say whether you're right. The prediction: most AI tutors will fail kids precisely
because answer-giving wins on short-term satisfaction while destroying learning.

### Spiky POV 5: Transfer comes from meeting a pattern in many *disguises*, not from repetition — so the unit of practice is "same structure, new costume."

**Elaboration.** My own origin point: I'd finish a lesson feeling like I understood, then
freeze the instant I had to apply it to a new problem. That's the transfer gap, and it
happens because we learn the *surface* of a worked example, not the *structure*.
Repetition of the identical problem deepens the surface trap; what builds transfer is
seeing the same pattern wearing many costumes until the child stops matching surface
features and starts matching structure (interleaving + variation; Koster's "fun is the
brain grokking a pattern"). This reframes assessment and review: **a boss is the pattern
in a new disguise under pressure** (authentic application), and **a spaced-review patrol
is the pattern revisited in yet another costume** (authentic transfer). The spiky claim:
"practice more problems" is bad advice; "practice the same pattern disguised differently"
is the real lever.

---

## Experts

### Expert 1 — Benjamin Bloom  *(load-bearing for AlphaBrilliant)*
- **Who:** Educational psychologist (1913–1999); Mastery Learning; the "2 Sigma Problem."
- **Focus:** 1:1 tutoring + mastery learning ≈ +2 SD over conventional instruction; don't
  advance until a high bar is met — reteach and retest.
- **Why Follow:** This is the backbone of SPOV 1, 2, and 4 — it justifies holding a real
  bar for kids (not dumbing down), the review-until-mastered return loop, and the AI
  companion as the scalable 1:1 tutor Bloom could only dream of.
- **Where:** Bloom, "The 2 Sigma Problem and Methods for Group Instruction as Effective as
  One-to-One Tutoring" (1984, *Educational Researcher*) — search the title for the PDF.

### Expert 2 — Raph Koster
- **Who:** Veteran game designer; author of *A Theory of Fun for Game Design* (2004).
- **Focus:** "Fun" is the brain's reward for mastering a pattern; games are pattern-
  mastery engines, and stop being fun once the pattern is fully learned.
- **Why Follow:** Grounds SPOV 5 and the whole premise — DSA is literally a set of
  patterns, so a child grokking a pattern *is* the fun. The medium and the material are
  the same shape.
- **Where:** *A Theory of Fun for Game Design*; raphkoster.com *(verify)*.

### Expert 3 — Sal Khan
- **Who:** Founder of Khan Academy; built Khanmigo; author of *Brave New Words* (2024).
- **Focus:** Mastery learning at scale and an AI tutor explicitly designed to *guide, not
  tell*.
- **Why Follow:** The real-world model for SPOV 4 (Bit never gives the answer) and a live
  test of Bloom's 2-sigma promise with AI.
- **Where:** khanacademy.org; *Brave New Words*.

### To read next (not yet "mine," kept as sources to process)
- **Robert & Elizabeth Bjork** — desirable difficulties (why scaffolding the struggle,
  not removing it, is the respectful choice for kids). bjorklab.psych.ucla.edu *(verify)*.
- **Roediger & Karpicke** — the testing effect (the quiz is the learning). *(verify)*
- **Rohrer & Taylor** — interleaving (the science under SPOV 5's "disguises"). *(verify)*
- **Deci & Ryan / Csikszentmihalyi** — relatedness & flow (why the *companion* return loop
  works, and how to tune kid-appropriate challenge). *(verify)*

---

## DOK 3: Insights

- **Insight 1 — The transfer gap is the real failure mode.** Finishing a lesson and then
  freezing on a fresh problem means you learned the surface of a worked example, not the
  structure. The fix isn't more reps of the same problem — it's the same pattern in many
  disguises. (Origin of SPOV 5; my own experience.)

- **Insight 2 — For children, the forgetting curve is beaten by a bond, not a buzzer.** A
  companion who "misses you" and needs your help produces the spaced return visit that a
  reminder or streak guilt never will. Relatedness is the delivery mechanism for the
  spacing effect. (SPOV 1.)

- **Insight 3 — Mastery gating and a no-answers tutor compound.** If you can't advance
  until you've genuinely got it (Bloom) *and* the tutor refuses to shortcut it (Khan),
  the only available path forward is real understanding. Two constraints that each seem
  harsh combine into the gentlest possible guarantee that the child actually learned.
  (SPOV 2 + 4.)

- **Insight 4 — Underestimating kids is the costliest mistake in the genre.** Lowering
  rigor to chase cuteness removes the desirable difficulty that learning requires, so the
  "kid-friendly" version is the *least* effective one. Respect = keep the difficulty,
  scaffold the path. (SPOV 2.)

- **Insight 5 — The boss and the patrol are the same idea at two timescales.** A boss is
  the pattern in a new disguise under pressure (application); a spaced-review patrol is the
  pattern in yet another disguise days later (transfer + retention). Authentic assessment
  and authentic review are both "structure, new costume." (SPOV 5 + 1.)

---

## DOK 2: Knowledge Tree

### Category 1: The Return-Loop Problem (the spine)
#### Subcategory 1.1: The Spacing Effect & its behavioral gap
- **Source 1:** Ebbinghaus forgetting curve (1885); Cepeda et al., distributed-practice
  meta-analysis (2006, *Psychological Bulletin*).
  - **DOK 1 — Facts:**
    - Memory decays roughly exponentially without reinforcement.
    - Reviews spread over expanding intervals beat massed practice for retention.
    - Leitner systems schedule reviews by per-item difficulty (boxes).
  - **DOK 2 — Summary:**
    - The science of *when* to review is settled and easy to implement.
    - The unsolved part is behavioral: getting the learner — especially a child — to
      actually return. AlphaBrilliant computes the schedule (`gauntletProgress.ts`,
      boxes 1–5, demote-on-miss, `dueAt`) but does **not** yet surface due concepts. That
      missing loop is the product (SPOV 1 + build).
  - **Link to source:** *(verify)*

### Category 2: Mastery Learning (load-bearing)
#### Subcategory 2.1: Bloom's Mastery Learning & the 2-Sigma Problem
- **Source 1:** Bloom (1984), "The 2 Sigma Problem."
  - **DOK 1 — Facts:**
    - 1:1 tutoring + mastery learning produced ~2 SD gains over conventional teaching.
    - Mastery learning: high bar, no advance until met, reteach + retest.
  - **DOK 2 — Summary:**
    - The benchmark for an AI companion tutor and the rationale for mastery-gated worlds
      and a retake-until-passed Mastery Trial — and the reason NOT to lower the bar for
      kids (SPOV 2).
  - **Link to source:** *(verify)*

### Category 3: Transfer & Pattern Recognition
#### Subcategory 3.1: Interleaving & variation (the "disguises")
- **Source 1:** Rohrer & Taylor, interleaved vs. blocked practice (2007).
  - **DOK 1 — Facts:**
    - Interleaving lowers practice performance but raises test performance vs. blocking.
    - It trains the skill of *choosing which approach applies* — the crux of transfer.
  - **DOK 2 — Summary:**
    - Repeating one problem builds surface familiarity; varied/interleaved "costumes" of a
      pattern build structural recognition (Insight 1, SPOV 5). Justifies the all-topics
      final gauntlet and disguised-pattern bosses/patrols.
  - **Link to source:** *(verify)*
#### Subcategory 3.2: Fun as pattern-mastery
- **Source 1:** Koster, *A Theory of Fun* (2004).
  - **DOK 1 — Facts:**
    - Fun = the brain's reward for absorbing a pattern; mastery ends the fun.
  - **DOK 2 — Summary:**
    - DSA is pattern-shaped, so the game medium fits the material; depth must keep pace
      with the learner (SPOV 5).
  - **Link to source:** *(verify)*

### Category 4: AI Tutoring that Guides, Not Tells
#### Subcategory 4.1: Socratic, answer-withholding tutoring
- **Source 1:** Khan, *Brave New Words* (2024); Khanmigo.
  - **DOK 1 — Facts:**
    - Khanmigo is deliberately designed to guide rather than give answers.
    - It pairs AI tutoring with mastery-based progression.
  - **DOK 2 — Summary:**
    - The model for Bit: shrink the problem with progressive hints, never reveal the
      answer; measure success by the size of the step left to the child (SPOV 4).
  - **Link to source:** khanacademy.org *(verify)*

---

## From BrainLift to build (where this points next)

The spine SPOV demands a feature that doesn't exist yet: a **Bit-led "Daily Patrol"** that
reads `dueConcepts()` and brings the child back to review patterns *in fresh disguises*
exactly when they're fading — framed as helping a companion who needs them, not a streak
or reminder. That single loop operationalizes SPOV 1 (relationship-delivered spacing),
SPOV 5 (disguised-pattern transfer), and Bloom's review-until-mastered. It is the highest-
leverage next thing to build.

### How to use / extend this BrainLift
1. Replace every *(verify)* with a real link once you've read the source yourself, and
   fill in the Owner line.
2. Pressure-test each Spiky POV — these are written in your voice from the interview, but
   make sure you'd defend them out loud.
3. Paste the relevant sections into an AI chat as context whenever you make an
   AlphaBrilliant design call, so the model reasons from your curated stance.
