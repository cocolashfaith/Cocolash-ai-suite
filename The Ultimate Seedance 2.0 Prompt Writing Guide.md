# The Ultimate Seedance 2.0 Prompt Writing Guide

> *Synthesized from X/Twitter communities, Reddit threads, official ByteDance documentation, creator blogs, and tested community frameworks — April 2026*

***

## Executive Summary

Seedance 2.0, ByteDance's multimodal AI video model, is the industry's first system to support true four-modal input (text + image + video + audio) in a single generation. The difference between a mediocre output and a cinematic one is almost never the model — it's the prompt. This guide consolidates the best-validated frameworks, syntax rules, input strategies, and mode-specific templates discovered across every major community, so you can build a reliable, repeatable prompting system.[^1][^2][^3]

***

## Part 1: The Mindset Shift — Director, Not Describer

The single most important mental shift is this: **you are not describing a scene, you are directing one**. Research across Xiaohongshu, X (Twitter), Discord, and Reddit found that director-style prompts achieved a **3–4× higher first-take success rate** compared to narrative/descriptive writing. Every viral hit analyzed used director-style prompts; the majority of "fails" came from narrative-style writing.[^4][^5]

Think of your prompt as a **shot list you'd hand to a DP (Director of Photography)**:[^6]
- What is happening in the scene?
- How does the camera move?
- What sounds should be present?
- How do shots transition?

The X/Twitter Seedance 2.0 community (3,100+ members) frequently shares the workflow of training Claude on high-quality prompt examples, then having it generate cinematic scripts — an effective way to scale production.[^7]

***

## Part 2: Core Prompt Structures

### 2.1 The 6-Part Universal Formula

This is the most widely tested and endorsed structure across the community:[^8][^4][^1]

```
Subject → Action → Environment → Camera → Style → Constraints
```

| Component | What to Include | Example |
|-----------|-----------------|---------|
| **Subject** | Age, clothing, posture, distinctive features | "A 25-year-old woman in a red trench coat, left-handed, curly auburn hair" |
| **Action** | Single clear verb, present tense, intensity adverb | "sprints vigorously through the alley, arms pumping" |
| **Environment** | Location + lighting + time of day + atmosphere | "rain-slicked midnight Tokyo street, neon backlight" |
| **Camera** | Shot size + one movement + angle + lens type | "tracking shot from waist-level, handheld, wide-angle" |
| **Style** | 1–2 visual anchors + color treatment | "cinematic 35mm, warm shadows, Kodak palette" |
| **Constraints** | Stability and anti-artifact instructions | "smooth motion, stable framing, no face distortion" |

**Critical length rules:**
- Official Seedance documentation recommends **60–100 words**[^1]
- Community testing by Freepik recommends **100–260 words** for complex scenes[^4]
- Reddit's r/SeedanceAI_Lab notes: *"Over 100 words and the model starts cherry-picking random details"*[^9]
- A useful heuristic: **if your prompt doesn't fit in a tweet for a simple shot, it's too long**[^9]

***

### 2.2 The CRAFT Framework (for Multimodal Prompts)

For any prompt involving uploaded references (@-tagged assets), the CRAFT framework by Morphic is the most comprehensive professional structure:[^10]

**C — Context:** Establish scene + environment (include @Image refs for environment)
> *"In a dimly lit jazz club at night, referencing the interior atmosphere from @Image1"*

**R — Reference:** Specify which @-tagged files serve what purpose explicitly
> *"@Image2 for the main character's appearance and clothing, @Video1 for the walking motion and pace, @Audio1 for background jazz music"*

**A — Action:** Detail character and object movements in present tense
> *"The character walks slowly across the room, stops at the bar, picks up a glass, and takes a sip while looking toward the door"*

**F — Framing:** Define shot types, camera movements, angles, transitions
> *"Start with a wide establishing shot, dolly in to medium close-up as character reaches the bar, then cut to over-the-shoulder shot looking toward door"*

**T — Timing:** Add temporal markers and audio sync points
> *"0–4s: walk begins; 4–8s: reaches bar; 8–12s: drinks; 12–15s: camera follows eyeline. Audio: @Audio1 throughout, door-open SFX at 8s mark"*

***

### 2.3 The Shot-List Format (for Multi-Shot Sequences)

For multi-shot sequences (Seedance 2.0's signature feature), use numbered, timed shot descriptions:[^11][^6]

```
[Global Style Header — applies to entire clip]
[Total duration / shot count / aspect ratio]

Shot 1 [0-3s]: [Subject + Action] [Camera: shot type + movement]
Shot 2 [3-6s]: [Subject + Action] [Camera: shot type + movement]
Shot 3 [6-9s]: [Subject + Action] [Camera: shot type + movement]
...
```

Higgsfield's community guide (one of the most trusted) specifies: **"Always specify your shot structure upfront. Tell Seedance how many shots you want, the total duration, and the aspect ratio at the top of the prompt. Everything else follows from there."**[^11]

**Multi-shot example structure (from community testing)**:[^12]
```
A 20-year-old in an oversized sweater, curled up in the corner of a couch reading a book, 
while rain slides slowly down the windowpane.
0–5s: Wide shot of the living room, rain sound in background.
5–10s: Camera gently pushes into a medium shot; she turns a page and smiles softly.
10–15s: Close-up of raindrops sliding down the glass, steam rises from a mug of hot cocoa.
Environment: relaxed, safe, slow rhythm.
Realism: water flow, steam dispersion, slight page movement.
```

***

## Part 3: The @ Reference System (Multimodal Input)

This is Seedance 2.0's most powerful and most misused feature. The model accepts up to **12 files total**: 9 images, 3 video clips, 3 audio tracks. Without explicit @-tagging, the model **guesses each file's role**, often misassigning character references as backgrounds.[^13][^14]

### 3.1 @ Syntax Rules

**Basic structure:**
```
@[Type + Number] as/for [specific purpose]
```

| Use Case | Correct @-Tag Syntax |
|----------|----------------------|
| Lock opening frame | `@Image1 as the first frame` |
| Character identity | `@Image2 is the main character's face and appearance` |
| Camera replication | `Follow @Video1's camera movements and transitions` |
| Motion choreography | `Reference @Video1 for the fighting choreography` |
| Background music | `Use @Audio1 for background music` |
| Art style reference | `@Image3 is the art style reference` |
| Extend a video | `Extend @Video1 by 5 seconds` |
| Replace character | `Replace the woman in @Video1 with @Image1` |
| Beat sync | `Cuts should happen exactly on @Audio1's musical beats` |

[^15][^10]

**Clear vs. Unclear referencing:**
- ❌ *"Use @Image1 and @Video1 to make a video"* — model guesses roles
- ✅ *"@Image1 as character reference for face consistency, @Video1 for dolly shot camera movement, @Audio1 for background pacing"*[^10]

### 3.2 Strategic Input Prioritization (12-File Budget)

When approaching the 12-file limit:[^10]

| Priority | Slots | Use For |
|----------|-------|---------|
| Tier 1 | 2–3 images | Core visual style + character references |
| Tier 2 | 1–3 images | Character faces, product details, scene environments |
| Tier 3 | 1 video | Camera movement or motion choreography |
| Tier 4 | 1 audio | Rhythm, mood, beat synchronization |
| Tier 5 | Remaining | Supporting detail shots, supplementary assets |

***

## Part 4: Prompt Types by Generation Mode

### 4.1 Text-to-Video (T2V)

The purest form — no references. Structure priority:[^6]
1. Subject and action
2. Camera movement
3. Sound/audio cues (if specific sounds matter)
4. Shot transitions (if multi-shot)

**Key rules from community testing:**
- Always lead with who or what is in the shot, not the setting[^16]
- Use one clear **verb** in present tense — not "a person who might be running" but "a woman sprints"[^17]
- Include at least one style keyword: `cinematic`, `documentary`, `commercial`, `anime`, `photorealistic`[^4]
- Degree adverbs make a noticeable difference: *quickly*, *gently*, *dramatically*, *frantically*[^4]

**T2V template:**
```
[Subject: who/what + descriptive details] [Action: single present-tense verb + intensity] 
across [environment + lighting + time of day].
[Camera: shot type] [camera movement], [angle], [lens if relevant].
[Style keyword] + [color/grade descriptor].
[Constraint: 1–2 stability terms].
```

***

### 4.2 Image-to-Video (I2V)

For I2V, the image IS the first frame, so your prompt redirects to **what happens next**. Focus on:[^18]
- Subtle movement and facial expression
- Camera motion applied to the existing image
- Environment animation (wind in hair, steam rising)
- Identity preservation language: *"maintain character appearance throughout"*[^18]

**I2V-specific best practices:**
- Use `@Image1 as the first frame` for explicit anchoring[^15]
- Reference image quality matters enormously — use high-resolution, well-lit, frontal shots[^19]
- Do not re-describe things that are already in the image; describe what **changes** or **moves**[^20]

***

### 4.3 Multi-Reference (All-Round Reference Mode)

This is the most advanced and highest-quality input pathway. Combine:[^21][^22]
- Character photo(s) for identity
- Video clip for camera/motion style
- Audio file for rhythm and pacing
- Text for narrative and scene transitions

**Product commercial example using all four modalities**:[^22]
```
Commercial camera display for @Image2 bag.
Side view refers to @Image1.
Surface texture refers to @Image3.
Show all details of the stitching.
Grand and epic background music matching @Audio1.
2K cinematic quality.
```

**Character replacement example**:[^15]
```
Replace the woman in @Video1 with @Image1. 
Reference @Video1's camera work and transitions.
Character maintains @Image1's exact facial features throughout.
```

**Community-sourced tip from r/generativeAI**: *"You can literally use @ tags in your text prompts to pull in specific reference assets — like telling it to match the specific dolly shot of @video1 while synchronizing the scene's movements to the beat of @audio1."*[^23]

***

### 4.4 Video-to-Video (V2V) / Video Extension

For extending or modifying existing clips:[^15][^10]

**Extension syntax:**
```
Extend @Video1 by [X] seconds. [Describe continuation action].
Camera remains in [shot type], maintaining composition and lighting from the original.
```

**Story subversion syntax (change the narrative direction):**
```
Subvert the plot of @Video1. [Describe the new direction].
Maintain all camera angles and movements from @Video1.
New dialogue: "[Character1]: [line]" / "[Character2]: [line]"
```

**Fusion/bridging two clips:**
```
Create a [X]-second transition between @Video1 and @Video2.
[Character] [transition action] that connects the end of @Video1 to the beginning of @Video2.
Match character appearance, movement style, and lighting from both references.
```

***

### 4.5 Audio-Driven Generation

Seedance 2.0 includes built-in audio generation and can sync visual content to uploaded audio beats:[^24][^25]

**Beat synchronization:**
```
Images @Image1 through @Image4 cut to the keyframe positions and overall rhythm of @Audio1.
Characters in frame are more dynamic.
Cuts should happen exactly on the musical beats.
[Additional mood/style direction]
```

**Music video style:**
```
A [subject] dancing to @Audio1.
Every strong beat triggers a cut or speed-ramped camera move.
[Environment description].
Dance movements and character appearance remain consistent throughout.
```

**Auto audio prompt (let the model generate matching sound):**
Simply describe the scene with action and environment — Seedance's native audio engine generates context-aware sound effects and ambient music automatically.[^24]

***

## Part 5: Camera Language Reference

Camera direction is the **single most underutilized lever in Seedance 2.0 prompts**. Community research found that specifying camera movement consistently transforms generic clips into cinematic sequences.[^21]

### 5.1 Tier 1 — Core Movements (Handle 80% of Needs)

| Term | What It Does | Best Pairing |
|------|-------------|--------------|
| **Dolly In/Out** | Camera physically moves forward/backward | Subject approach, intimacy, tension |
| **Pan** | Horizontal rotation left/right | Wide reveals, follow horizontal action |
| **Zoom In/Out** | Focal length change | Detail focus, or reveal wider context |
| **Tracking/Follow** | Camera follows moving subject | Chase scenes, walking sequences |
| **Static** | No movement | Dialogue, contemplative moments |

[^26][^27]

### 5.2 Tier 2 — Intermediate Movements

| Term | What It Does |
|------|-------------|
| **Tilt** | Vertical rotation up/down (reveal height, drama) |
| **Truck** | Camera moves laterally left/right (parallel to subject) |
| **Orbit/Arc Shot** | Circles around subject (360° reveal or partial) |
| **Crane** | Boom arm up/down with arc (grand reveals) |
| **Push In / Pull Out** | Slow advance or retreat (tension build / context reveal) |
| **Pedestal** | Straight vertical lift (height repositioning) |

[^26]

### 5.3 Tier 3 — Style and Mood Modifiers

**Speed modifiers:** `smooth`, `slow`, `fast/rapid`, `subtle`, `gradual`
**Style modifiers:** `handheld`, `aerial`, `POV`, `Dutch angle`, `gimbal`, `Steadicam`
**Mood modifiers:** `cinematic`, `aggressive`, `dreamy`, `intimate`, `epic`, `dynamic`
**Special effects:** `hyperlapse`, `dolly zoom (Hitchcock zoom)`, `whip pan`, `rack focus`, `time-lapse`

[^26]

**Combination rule:** You can combine up to **2–3 movements** using `+` or `while`:
> *"Crane up + slow pan right"* or *"Orbit around the subject while gradually zooming in"*

Beyond three combined movements, the model struggles to execute all coherently.[^26]

***

## Part 6: Lighting, Style, and Visual Keywords

Lighting description is **heavily underused** and has an outsized impact on output quality.[^28][^21]

### 6.1 Lighting Phrases That Work

| Lighting Type | Prompt Phrase |
|--------------|---------------|
| Golden hour | `warm golden hour sunlight, backlit` |
| Overcast/soft | `soft diffused cloud light, no harsh shadows` |
| Blue hour | `blue twilight, cool tones` |
| Studio | `clean studio lighting, soft box light from the left` |
| Dramatic/noir | `hard chiaroscuro lighting, deep shadows` |
| Neon/urban | `neon reflections on wet pavement` |
| Candlelight | `warm candlelight flickering, low key` |
| Natural window | `soft natural window light from the right, indoor setting` |

Adding `color temperature: warm` or `color temperature: cool` provides strong visual direction.[^28]

**Community tip from Reddit (50+ prompt test)**: Instead of "cinematic lighting," use *physical* descriptions: *"a single spotlight positioned above, a sharp pool of tungsten."* Seedance responds better to physical descriptions than to vague adjectives.[^29]

### 6.2 Film and Style References

| Category | Keywords |
|----------|---------|
| Film look | `35mm film grain`, `Kodak color palette`, `ARRI ALEXA aesthetic` |
| Cinematic | `anamorphic`, `shallow depth of field`, `f/1.4 bokeh`, `2.35:1` |
| Commercial | `product photography style`, `soft high-key lighting`, `clean studio` |
| Documentary | `handheld documentary`, `fly-on-the-wall`, `observational` |
| Animation | `Pixar-style 3D`, `anime-style`, `stylized 3D` |
| Retro/vintage | `VHS grain`, `Super 8 film`, `warm 70s tones` |

[^30][^28][^11]

### 6.3 Special Surface and Physics Tips (from Community Testing)

- `"dark navy velvet"` instead of `"black velvet"` — pure black gives model nothing to work with[^29]
- `"rain-licked"` or `"wet surfaces"` prompt Seedance to render reflections, doubling visual complexity[^29]
- For slow motion: use `"240fps"` or `"half-speed"` rather than `"slow motion"` — Seedance needs a concrete reference point[^29]
- Material naming matters: `"brushed aluminum lid"` vs. `"metal lid"` significantly changes output[^31]

***

## Part 7: Character Consistency Across Shots

Identity drift — where a character's appearance changes between shots — is one of the most common failures.[^32]

### 7.1 The Four Drift Patterns to Watch For

1. **Feature erosion**: Small accessories (nose rings, tattoos, scars) disappear first[^32]
2. **Pose flip**: Hands, dominant side, or gaze flips left-to-right between shots[^32]
3. **Stylization shift**: Photo-realistic shot 1 becomes slightly cartoonish by shot 3[^32]
4. **Identity blend**: Two reference images cause the model to average features into a hybrid[^32]

### 7.2 The "Anchor-First" Prompt Technique

Lock your character description as a **template block** and copy-paste it unchanged across every generation:[^19][^32]

```
Character: [Name], [gender/age], [skin tone], [hair: color + style], 
[distinctive marks], [handedness], [expression baseline].
Keep these features unchanged throughout.
```

**Example anchor from community testing:**
> *"Character: Mara, female-presenting barista, olive skin, short dark hair with green beanie, small left nostril ring, left-handed, wry smile. Keep these features unchanged."*[^32]

### 7.3 The "Face-Lock" Camera Technique

Using camera tracking prompts forces the AI to keep the face as the primary focal point, providing more "pixel real estate" for face rendering:[^20]
> *"Orbital tracking around @Character1"* or *"tight follow shot on @Character1"*

### 7.4 The "Persistent ID" Workflow

Used by advanced creators for narrative sequences:[^20]
1. **Generate a 4-second "DNA Check" clip** — simple, neutral shot of character
2. **Lock the Seed Number** from the metadata
3. Reuse that seed across all shots to maintain the underlying geometric structure of the face
4. Use character slots 1–3 for face references, slots 4–5 for costume references

***

## Part 8: Negative Prompts and Constraint Blocks

Seedance 2.0 primarily works with **positive constraints** (what TO do), though many platforms expose a negative prompt field.[^33][^34]

### 8.1 Positive Constraints vs. Negative Prompts

One Reddit thread notes: *"The key is that it doesn't process 'negative prompts' — you must specify your desires using positive instructions, such as 'ensure character consistency' rather than 'don't alter the face.'"*[^34]

**Positive constraint examples:**
- `"maintain face consistency"` not `"don't change the face"`
- `"steady motion, stable framing"` not `"no camera shake"`
- `"keep outfit unchanged across shots"` not `"don't change clothes"`

### 8.2 When to Use Negative Prompts

Negative prompts are effective at reducing recurring visual artifacts — **not** for content filtering. Use 2–3 targeted terms tied to what is actually going wrong, rather than long lists:[^33]

```
negative: no jitter, no warping, no flickering, no identity drift
negative: no text morphing, no garbled logos, no color shift
negative: no motion blur on face, no floating limbs, no background collapse
```

**Category-based negative library**:[^35]
| Problem | Negative Term |
|---------|---------------|
| Body artifacts | `no extra fingers, no deformed hands, no melting edges` |
| Camera chaos | `no snap zooms, no whip pans, no Dutch angles, no jump cuts` |
| Identity drift | `no extra characters, no mirrors reflecting other people` |
| Surface noise | `no text overlays, no watermarks, no floating UI` |
| Branding | `no logos, no labels, no recognizable brands` |
| Color drift | `no neon lighting, no heavy teal/orange, no cartoon saturation` |

**Rule of thumb:** Use 3–5 that matter for the specific scene. Too many negatives can dull the image. If artifacts persist after two tries, **adjust subject wording or simplify camera note** rather than stacking more negatives.[^35]

***

## Part 9: Prompt Formats by Content Type

### 9.1 Transformation / Morph Sequences

Best-performing format on Seedance currently. Key principles:[^11]
- Write each shot individually and number them
- Build a clear **escalation arc**: calm → threat → transformation → aftermath
- For realistic transformations: add `"no 3D, no cartoon, no VFX"` to force ultra-realism
- Use image references for transformation states (before/after character images)[^11]

**VFX notation trick:** Describe VFX inline using brackets — `[VFX: branching electric circuits pulsing with white-blue current]`[^11]

***

### 9.2 POV / First-Person Shots

Lock the perspective by being explicit about what the camera is NOT doing:[^11]
> *"No cuts, no zoom, natural head movement"* — this single instruction keeps perspective locked.

Without this, Seedance defaults to cutting between angles and the illusion breaks.[^11]

**Orb/POV baseline:**
```
Single continuous shot, first-person POV perspective, the camera IS her eyes,
hyper-chaotic handheld motion, completely unstabilized, wide-angle lens (strong distortion),
her hands always visible in frame, no music only raw SFX, [duration] seconds.
```

***

### 9.3 Action and Fight Scenes

Fight scenes need three things: clear location, power mismatch, and defined escalation arc. Describe **exact choreography beat by beat** — Seedance executes what you write:[^11]

**Fight prompt formula:**
```
[Shot type + lens]. [Character 1 appearance] [vs.] [Character 2 appearance] in [location].
[Beat 1: attack/action]. [Beat 2: counter/reaction]. [Beat 3: escalation].
[Slow-motion trigger: "RAMPS TO SLOW MOTION as..."].
[Camera: specific movement]. Style: [film references].
```

**Static camera tip from Reddit:** *"When both camera and subject are in motion, Seedance gets confused. For capturing product details effectively, it's best to keep the camera steady while allowing the subject or lighting to create the dynamic feel."*[^29]

***

### 9.4 E-Commerce and Product Videos

Product videos have unique prompting needs — precision and brand consistency over cinematic drama:[^22][^31]

**Clean product shot formula:**
```
Subject: [Product name + material + color + angle description]
Environment: [Backdrop color in hex if possible + shadow type]
Lighting: [Single key + rim light + no color cast]
Motion: [Slow push-in % + "no camera shake"]
Negatives: [Reflections, fingerprints, extra props, text on surfaces]
Output: [Maintain brand color (Pantone code), depth of field]
```

**360° rotation product prompt:**
```
A minimalist [product description] on a pure white infinite studio background, 
rotating smoothly 360 degrees clockwise.
[Material detail] remaining sharp and readable throughout.
Fixed macro camera, smooth turntable motion, commercial product photography style, 
soft high-key lighting, no noise.
Logo and text remain perfectly consistent.
```


***

### 9.5 Cinematic Multi-Shot Storytelling

For short films and narrative content:[^12][^30]

**Four-scene story template:**
```
[Global style: cinematic camera, warm tones, film grain, no flicker]

A [character] [action in Scene 1 location/situation].  (Scene 1)
[Character transition] [action in Scene 2 location].  (Scene 2)
[Character discovers/encounters] [Scene 3 action].    (Scene 3)
[Character final emotional beat].                      (Scene 4)

Keep [character type] appearance consistent.
Emotional transition: [from emotion] to [to emotion].
```

***

### 9.6 Social Media and Viral Content

For TikTok/Reels-style clips, front-load the visual hook in the first 3 seconds:[^22]

**Outfit-swap / trend format:**
```
[Subject from @Image1] stands centered against [background from @Image2].
[Subject] makes a quick hand gesture at the 3-second mark.
On the gesture, quick jump cut to same person wearing [outfit from @Image3], same position.
At 6 seconds, another hand gesture and jump cut to [outfit from @Image4].
Use the upbeat music from @Audio1. Cuts should happen exactly on the musical beats.
```


***

## Part 10: The Iteration System

### 10.1 The Four-Step Loop

The official Seedance guide recommends a single-variable iteration methodology:[^3][^1]

1. **Baseline Generation**: Generate 2–3 options with a standard prompt
2. **Single Variable Adjustment**: Change only ONE element per iteration (camera, motion, style, environment, or constraint)
3. **Quality Scoring**: Score on continuity, instruction adherence, and post-production usability
4. **Final Selection**: Choose the highest-scoring version

**The cardinal rule from communities**: *"If you revise the entire prompt after every run, you never learn which change actually helped."*[^3]

### 10.2 The Build-Order for Debugging

When a prompt underperforms, adjust variables in this order:[^3]

1. Action description
2. Camera specification
3. Style keywords
4. Environment details
5. Constraint block

### 10.3 Credit-Efficient Workflow

- Start with 4-second clips to test prompt direction before committing to 15-second generations[^13]
- Use Seedance 1.5 (if available) for draft iterations — lower cost, faster results[^28]
- Reuse successful prompt elements: if a lighting setup works, keep it unchanged in next generation[^28]
- Start narrow (tight close-up), add detail — produces more consistent output than complex wide shots[^28]

***

## Part 11: The LLM-Assisted Prompting Workflow

A widely adopted workflow in the X/Twitter and Reddit communities involves using an LLM (Claude or ChatGPT) as a "prompt engineer" for Seedance:[^36][^7]

**The Claude + Seedance workflow (from X community)**:[^37][^7]
1. Build or install a `/prompt-gen` skill in Claude that knows Seedance's exact syntax rules
2. Feed it raw creative ideas in plain English: *"cinematic shot of a neon-lit alleyway, Blade Runner feel"*
3. Claude outputs a fully structured, Seedance-optimized prompt
4. Copy-paste into Seedance

This is particularly effective because the Higgsfield platform has an official Claude Skill integration that encodes all of Seedance 2.0's prompt metadata.[^36]

**The meta-prompt conditioning method (from Reddit r/generativeAI)**:[^38]
1. Prepend a "Seedance Rules" block to your LLM system prompt
2. Force the LLM to follow strict Subject → Action → Camera → Style → Constraints structure
3. Generate multiple variations, then select

***

## Part 12: Common Mistakes and Fixes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| Asking for too many things at once | Model cherry-picks details randomly | One visual priority, one camera rule, one motion idea per prompt[^3] |
| Vague style words ("cinematic lighting") | Model interprets too loosely | Use physical descriptions: "single tungsten spotlight from above"[^29] |
| Moving camera + moving subject | Model gets confused between two sources of motion | Keep camera static when subject is the focus[^29] |
| Uploading references without @-tags | Model guesses roles, misassigns assets | Always specify: `@Image1 for [exact purpose]`[^13] |
| Revising entire prompt between runs | Destroys learning; can't isolate variable | Change one element at a time[^3] |
| Word count too high | Model ignores key details | Target 60–100 words for simple shots[^1] |
| Describing still properties vs. motion | Produces static-feeling output | Be explicit about motion: "speeds past from left to right, kicking up dust"[^4] |
| Identical style description for different emotions | Tone mismatch | Anchor lighting + color grade to emotional arc per shot[^5] |
| Two characters + complex camera | High inconsistency | Limit to 2 max characters, one camera move per shot[^13] |
| Fast hand gestures described | High artifact rate | Avoid fast hand gestures; use slower, deliberate movement descriptions[^13] |

***

## Quick Reference: Prompt Templates by Mode

### Text-to-Video (Simple)
```
[Subject description]. [Action verb + intensity] [in/through environment].
[Camera: shot size + movement]. [Style keyword], [lighting]. [1–2 constraints].
```

### Image-to-Video
```
@Image1 as the first frame. [What starts moving]. [Camera movement that reveals context].
[Physics detail: fabric moves, steam rises, etc.]. Maintain subject appearance.
[1 style keyword]. Smooth motion.
```

### Multi-Reference (CRAFT)
```
Context: [Scene + @ImageX for environment]
Reference: @ImageY for character, @VideoZ for camera, @AudioW for mood
Action: [Subject moves/does X] in [timed stages if needed]
Framing: [Shot type → movement → angle → transition]
Timing: 0-Xs: [action]; X-Ys: [action]; Audio: [@AudioW + sync instructions]
```

### Multi-Shot Narrative
```
[Global style header: aesthetic + film look + lighting baseline]
Total: [X]s / [N] shots / [aspect ratio]

Shot 1 [0-Xs]: [action + camera]
Shot 2 [X-Ys]: [action + camera]
Shot 3 [Y-Zs]: [action + camera]
Keep [character/element] consistent throughout.
Emotional arc: [start] → [end].
```

### Product Commercial
```
[Product + material + color], [anchor position].
[Rotation or reveal motion]. [Camera: fixed macro / slow dolly].
[Lighting: key source + rim]. Commercial product photography.
[Surface + color consistency instructions].
negative: no extra props, no reflections, no text drift.
```

---

## References

1. [Seedance 2.0 Official Prompt Guide In-depth Interpretation: 6-Step ...](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html) - We'll cover the 6-step prompt formula, 8 types of camera movement, style keywords, negative prompts,...

2. [Seedance 2.0 - ByteDance Seed](https://seed.bytedance.com/en/seedance2_0) - Seedance 2.0 adopts a unified multimodal audio-video joint generation architecture that supports tex...

3. [Common Seedance 2.0 Prompt Mistakes and How to Fix Them](https://cdance.ai/ko/blog/common-seedance-2-0-prompt-mistakes) - Add a short constraint block at the end of the prompt: Avoid flickering background, face distortion,...

4. [How to write prompts for Seedance 2.0 | Freepik Blog](https://www.freepik.com/blog/how-to-write-prompts-for-seedance-2-0/) - First, keep your prompts between 100 and 260 words. Shorter prompts tend to produce vague results. L...

5. [How 'Director Thinking' Unlocks Cinematic AI Video with Seedance 2.0](https://pixo.video/blog/seedance-2-0-director-prompts) - Seedance 2.0 has taken the AI video world by storm. ByteDance's March 2026 model accepts text, image...

6. [How to Use Seedance 2.0 Like a Pro In 2026 | fal.ai](https://fal.ai/learn/tools/how-to-use-seedance-2-0) - From the example prompts ByteDance has published, a reliable prompt structure looks like this: Subje...

7. [Seedance 2.0 Community on X - 3.1K Members](https://x.com/i/communities/2020406338996593012/) - Seedance 2.0 Discussion · 1. Be kind and respectful. · 2. Keep posts on topic. · 3. Explore and shar...

8. [Seedance 2.0: The Complete Guide](https://help.scenario.com/articles/7140699840-seedance-2-0-the-complete-guide) - Your text prompt defines the scene, but your reference inputs (images, videos, and audio) anchor ide...

9. [Seedance AI - News - Early Access - Creator Lab - Reddit](https://www.reddit.com/r/SeedanceAI_Lab/) - Over 100 words and the model starts cherry-picking random details while ignoring the ones you care a...

10. [Seedance 2.0 Complete Guide: Features, Comparison & How-to ...](https://morphic.com/resources/how-to/seedance-guide) - Complete Seedance 2.0 guide for professionals. Compare features vs Kling, Veo & Sora. Master multimo...

11. [Seedance 2.0 — Complete Prompting Guide (Full Prompt Library)](https://higgsfield.ai/blog/seedance-prompting-guide) - In this tutorial, we'll walk through exactly how to get the most out of Seedance 2.0 — covering ever...

12. [20+ Best Seedance 2.0 Prompts for 2026 - SeaArt AI](https://www.seaart.ai/blog/seedance-2-0-prompt) - In this Seedance 2.0 prompting guide, we'll break down how to write effective Seedance 2.0 prompts, ...

13. [Seedance 2.0 Prompt Engineering : r/PromptEngineering - Reddit](https://www.reddit.com/r/PromptEngineering/comments/1rjqm5v/seedance_20_prompt_engineering/) - You can upload up to 12 files per generation: 9 images, 3 video clips, 3 audio tracks. But here's th...

14. [18 Powerful Seedance 2.0 Prompts That Take Videos To ... - Dreamina](https://dreamina.capcut.com/resource/seedance-2-0-prompt) - Discover 18 high-impact Seedance 2.0 prompts to create stunning AI videos, boost creativity, enhance...

15. [Seedance 2.0 Complete Guide: Multimodal Video Creation](https://wavespeed.ai/blog/posts/seedance-2-0-complete-guide-multimodal-video-creation/) - 2. Multimodal Reference System. This is the defining feature of Seedance 2.0. You can reference virt...

16. [Best Seedance 2.0 Prompts: 10 Ideas for High-Quality AI Videos](https://notegpt.io/blog/seedance-2-0-prompts) - In this guide, I will walk you through 10 practical Seedance 2.0 prompts. But here is the difference...

17. [Exclusive Seedance 2.0 Prompt Guide With 70 Ready-To-Use AI ...](https://www.imagine.art/blogs/seedance-2-0-prompt-guide) - So, I have organized this Seedance 2.0 prompt guide in 14 categories: narrative, action, sports, ASM...

18. [Seedance 2.0 Video Prompts: Best Copy-Paste Prompt Guide for AI ...](https://www.media.io/ai/image-to-video/seedance-2-0-prompts) - Looking for working Seedance 2.0 prompts? This page focuses on what users actually need: usable vide...

19. [Seedance 2.0 character consistency across shots: what I've actually ...](https://www.reddit.com/r/aivideos/comments/1smtzb9/seedance_20_character_consistency_across_shots/) - The reference needs to be high resolution, well-lit, and frontal if you want face consistency. Promp...

20. [Master Seedance 2.0 Character Consistency - Vmake AI](https://vmake.ai/blog/seedance-2-0-character-consistency) - Stop your AI characters from morphing. Learn the "Persistent ID" workflow in Seedance 2.0 and use Vm...

21. [15 Best Seedance 2.0 Prompts: The Ultimate Guide to Create Viral ...](https://www.atlascloud.ai/blog/guides/best-seedance-2-0-prompts-guide) - Master Seedance 2.0 with 15 proven prompts for viral AI video generation. Covers cinematic, product,...

22. [Seedance 2.0: The New Secret Weapon for Professional Product Ads](https://www.weshop.ai/blog/seedance-2-0-the-new-secret-weapon-for-professional-product-ads/) - Master Seedance 2.0 for product ads. Learn to use the @tag system and All-Round Reference to create ...

23. [I created a full MV using AI (Seedance 2.0) : r/generativeAI - Reddit](https://www.reddit.com/r/generativeAI/comments/1srfb2e/i_created_a_full_mv_using_ai_seedance_20/) - You can literally use @ tags in your text prompts to pull in specific reference assets—like telling ...

24. [Seedance 2.0](https://seedance2.ai) - Seedance 2.0 is a revolutionary multi-modal AI video generation model that supports image, video, au...

25. [YouMind-OpenLab/awesome-seedance-2-prompts: 2000+ ... - GitHub](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) - Audio-Driven — Generate videos driven by audio input; Up to 1080p resolution, 4–15 seconds duration;...

26. [the complete guide to cinematic AI video | Seedance 2.0](https://seedance2.so/blog/ai-video-camera-movement-prompt-guide) - Tier 1: basic camera movements (the foundation) · Pan — Horizontal camera rotation (left or right) w...

27. [Seedance 2.0 Guide: Multimodal AI Video Creation System](https://vuela.ai/blog/seedance-2-guide) - Avoid vague words like "move." Use precise terminology: Smooth 3-second dolly forward. Add keywords ...

28. [Seedance 2.0 Prompt Guide: 50+ Examples for Stunning AI Videos ...](https://www.seedance.tv/blog/seedance-2-0-prompt-guide) - The ultimate Seedance 2.0 prompt guide. Master AI video with expert tips for cinematic shots, charac...

29. [I tested 50+ Seedance 2.0 prompts – here's exactly what makes the ...](https://www.reddit.com/r/generativeAI/comments/1sm1e4w/i_tested_50_seedance_20_prompts_heres_exactly/) - I tested 50+ Seedance 2.0 prompts – here's exactly what makes the difference between trash and cinem...

30. [Seedance 2.0 Prompt Guide: From Zero to Cinematic AI Videos (5 ...](https://www.glbgpt.com/hub/seedance-2-0-prompt-guide/) - 5 Copy-Paste Seedance 2.0 Prompt Examples · Prompt 1: Anime Girl Healing Entrance · Prompt 2: Produc...

31. [How to Use Seedance 2.0 for E-Commerce Product Videos ... - CrePal](https://crepal.ai/blog/aivideo/blog-seedance-2-0-ecommerce-product-video/) - Prompt vibes: “Center product, neutral gradient, subtle push-in, logo bottom-left, short CTA top-rig...

32. [Seedance 2.0 Character Consistency: How to Stop Identity Drift ...](https://crepal.ai/blog/aivideo/blog-seedance-2-0-character-consistency/) - Keep characters consistent in Seedance 2.0: reference hygiene, prompt anchors, and practical fixes w...

33. [Why your Seedance 2.0 prompts keep getting flagged (and what to ...](https://morphic.com/resources/how-to/seedance-2-prompts-flagged-how-to-fix) - Negative prompts are not useful for getting past the content filter, but they are worth using when y...

34. [Complete Manual Prompt Guide For Seedance 2.0 (FREE) - Reddit](https://www.reddit.com/r/generativeAI/comments/1siuu8c/complete_manual_prompt_guide_for_seedance_20_free/) - The trick is that it doesn't recognize "negative prompts"—you have to tell it exactly what you want ...

35. [Seedance 2.0 Prompt Template: Copy-Paste Framework for Motion ...](https://wavespeed.ai/blog/posts/blog-seedance-2-0-prompt-template/) - If artifacts persist after two tries, I switch strategy: adjust the subject wording or simplify the ...

36. [Seedance 2.0 Officially Public! Full Prompting Tutorial (Claude + ...](https://www.youtube.com/watch?v=-k6BAe27dDU) - If you want to make exactly what I made in this video, try Seedance 2.0 here: https://higgsfield.ai/...

37. [How I built a Claude AI workflow that generates images and video ...](https://heatherbcooper.substack.com/p/how-i-built-a-claude-ai-workflow) - Where older Seedance models were straightforward text-to-video and image-to-video, 2.0 lets you comb...

38. [How to write Perfect prompt to get the Best results in SEEDANCE 2.0 ...](https://www.reddit.com/r/generativeAI/comments/1swerng/how_to_write_perfect_prompt_to_get_the_best/) - 1. Give the LLM a "Seedance Rules" Meta-Prompt. Before you even ask for your video idea, you have to...

