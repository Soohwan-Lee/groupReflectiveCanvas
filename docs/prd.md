# 📘 Product Requirements Document (PRD)

## 🯩 Product Name
**Group Reflective Canvas (GRC)**

---

## 1. 🙋‍♂️ Problem Statement
In online sticky-note-based ideation sessions, participants often overlook invisible patterns of collaboration—imbalanced participation, clustering of ideas, or underexplored perspectives. These issues lead to suboptimal team dynamics and reduced creativity.

---

## 2. 🌱 Goal
Design a real-time, sticky-note-centered collaborative system that helps teams reflect on their group dynamics by analyzing voice activity and written ideas. GRC aims to surface invisible group behaviors and support metacognitive reflection by offering visual feedback and AI-assisted prompts.

---

## 3. 🧰 Target Users
- Remote creative teams (e.g. designers, PMs, researchers)
- Online workshop facilitators
- HCI researchers exploring group collaboration and reflection tools

---

## 4. 🧪 Scope of This MVP
This MVP emphasizes fundamental functionality that enables real-time collaboration, voice and note activity logging, and reflective insights.

### ✅ Must-have
- Sticky note canvas (via `tldraw`)
- Real-time collaboration via Yjs sync
- Voice activity logging (start/end time + speaker ID)
- Sticky note tracking (creation/movement timestamps)
- Clustering of sticky notes based on semantic similarity (via OpenAI GPT)
- Visual dashboard:
  - DiversityOrb: idea diversity indicator
  - Timeline View: voice and note activity logs
  - ParticipationDynamics: contribution balance (talk/write/diversity)
  - AI-based Reflection Prompts

### 🚧 Nice-to-have (optional for MVP)
- Conceptual voids visualization in idea landscape
- Reflective pause overlay
- Soundscape: voice activity energy display

---

## 5. 🧠 Key Concepts & Features

### 5.1 AI Reflective Prompts (.ai-prompts)
- Shown in the upper right dashboard panel
- Generated based on patterns in participation, voice, and idea clustering
- Expressed as short, contextual prompts (suggestion or question)
- Example:
  - "Ideas so far focus mostly on AI and UX. Shall we consider accessibility or offline contexts?"
  - "Several sticky notes were added after this discussion. Could one idea have sparked others?"

### 5.2 Diversity Orb (.diversity-orb)
- Fixed at the top-left of the canvas
- Purpose: shows how many semantically distinct perspectives are being discussed
- Indicators:
  - Detected topic clusters (e.g. 5 clusters)
  - Novel contribution ratio (e.g. 75% of notes are new themes)
  - Border color changes based on diversity level:
    - 🔴 Red = low diversity
    - 🟡 Yellow = moderate
    - 🟢 Green = high

### 5.3 Timeline Visualization (.timeline-container)
- Positioned at the bottom center of the canvas
- Dual tracks:
  - Voice Activity Track: blue wave blocks per speaker
  - Note Activity Track: dots for note creation (green) and movement (blue)
- Interaction:
  - Click speaker icon = highlight related notes + jump to time
  - Click sticky note = highlight matching voice segment
  - Temporary animated line between speaker and note = inferred inspiration

### 5.4 Idea Landscape (.idea-landscape)
- Middle section of the right panel
- Topic-based clustering of ideas in circular clusters
- Empty conceptual areas highlighted with red dotted outlines
- Hover shows guiding prompt: "What perspective is missing here?"
- Click to create new note with that topic pre-filled

### 5.5 Participation Dynamics (.participation-dynamics)
- Lower right panel
- Visualizes individual and group contribution balance:
  - Talk: total speaking duration
  - Write: number of sticky notes
  - Diversity: count of unique topics contributed
- Includes group-level balance indicator (traffic light color band)
- Soft guidance phrasing:
  - "Some voices might not be fully represented yet."
  - "Adding perspectives from Minsoo and Hyunwoo could enrich the idea space."

### 5.6 Sticky Notes (.sticky-note)
- Positioned freely within canvas
- Editable, colorful, rectangular notes
- Styling:
  - Drag cursor + box-shadow
  - `.has-voice` = animated ripple overlay
  - `.silent` = grayscale and opacity drop

### 5.7 Reflective Pause (.reflective-pause + .reflection-overlay)
- Button fixed bottom-right
- When clicked: darkens canvas, shows summary modal
- Content includes:
  - Quiet voices
  - Dominant clusters
  - Suggested next steps or missing ideas

### 5.8 Collaboration Soundscape (.soundscape)
- Animated visual audio bars at top-right
- Reflects live speech activity
- Uses Web Audio API or STT volume fallback

---

## 6. 🏗️ Tech Stack

| Area | Tool |
|------|------|
| Canvas | `@tldraw/tldraw` |
| Real-time sync | Yjs + WebSocket (or PartyKit) |
| Voice logging | Web Speech API or AudioContext stream |
| AI analysis | OpenAI GPT-4 API (topic clustering, prompt generation) |
| Hosting | Vercel or local Node.js server |
| Dev Environment | Vite + React + TypeScript |
| Editor | Cursor IDE (for natural-language driven development) |

---

## 7. 📜 User Flow

1. Participants enter shared canvas link (via URL)
2. Start live discussion and write sticky notes
3. System logs all speaking intervals and note activities
4. AI analyzes real-time data and updates:
   - DiversityOrb (topic variety)
   - Timeline View (synchronized logs)
   - Participation Panel
   - Reflection Prompts
5. Team notices patterns, discusses meta-issues, and adapts behavior
6. Optionally: pause via Reflective Overlay to review state

---

## 8. 🧱️ Component Breakdown

| Component | Description |
|-----------|-------------|
| `<TldrawEditor />` | Canvas wrapper integrating tldraw and synced store |
| `VoiceLogger.tsx` | Hooks into STT or Audio API to log voice segments |
| `StickyNote.ts` | Custom shape renderer with support for topic tags and metadata |
| `useGrcStore.ts` | Derived state from canvas, voice, and topic clusters |
| `DiversityOrb.tsx` | Computes topic diversity and animates orb colors |
| `Timeline.tsx` | Visual timeline with voice + note layers, click interactions |
| `ParticipationPanel.tsx` | Contribution bar graphs + soft suggestion messages |
| `ReflectionPrompts.tsx` | Dynamic cards summarizing group patterns as prompts |
| `IdeaLandscape.tsx` | Clustering map with "void" region detection |
| `PauseOverlay.tsx` | Modal that displays reflection summary when paused |
| `Soundscape.tsx` | Live voice energy bar display |

---

## 9. 🪼 Milestone Plan

| Week | Tasks |
|------|-------|
| Week 1 | Setup tldraw canvas + Yjs sync + sticky note custom shape |
| Week 2 | Implement voice logging + basic UI layer for speaker segments |
| Week 3 | Build dashboard: DiversityOrb, Timeline View, Participation bars |
| Week 4 | Add OpenAI GPT API connection for clustering + prompt generation |
| Week 5 | Design Reflection Overlay, polish, and deploy to Vercel |

---

## 10. ✨ Stretch Goals (Post-MVP)
- GPT Embedding-based clustering instead of text-only
- Replay scrubber for timeline navigation
- Persistent project rooms via Supabase
- Personalized AI reflection facilitator (e.g. persona-based prompts)
- Audio segmentation via WebRTC voice separation

