/**
 * Prompt default templates for AI generation tasks (English).
 * Users can edit these in "Preferences -> AI Prompts".
 *
 * Convention:
 *   - All conditional sections are composed by the caller in advance (including header/empty lines)
 *     and injected via `{{xxxSection}}` variables. The template itself **does not** do if/else.
 *   - General fields are inserted directly via `{{var}}`, replaced with an empty string if omitted.
 */

// ─── #1. Chapter Outline (AI Draft Generation) ───────────────────────────
export const DEFAULT_CHAPTER_DRAFTS_TEMPLATE = `{{taskIntro}}

## World Setting
{{worldSetting}}

## Main Plot
{{mainPlot}}{{charactersSection}}{{existingChaptersSection}}{{continuationRulesSection}}

# Output Format

Please output {{count}} chapters, each strictly using the following format (do not omit tags):

##CH_START##
TITLE: <Chapter title (Do not write 'Chapter N', just the title)>
BEAT: <Choose one from: {{beatList}}>
POINTS: <Core plot points of this chapter, 2-4 sentences, including main events, character interactions, and chapter-end cliffhanger{{pointsExtraHint}}>
##CH_END##

Directly output {{count}} blocks of ##CH_START##...##CH_END##, without any foreword, numbering, or summary at the end.`;

// ─── #1.5 Hard Continuation Rules (injected into #1's {{continuationRulesSection}}) ──
export const DEFAULT_CHAPTER_CONTINUATION_RULES = `1. **Do not reboot the story**: New chapters must directly continue the plotline, character states, and unresolved foreshadowing of the LAST chapter in "Existing Chapters". Do not write opening content like "first meeting", "beginning of the story", or "the protagonist learns for the first time..." (these have already occurred in previous chapters).
2. **Do not reuse the "Inciting Incident" beat**: The story has already been introduced. Subsequent chapter beats should be selected from "Rising Action / Midpoint / Climax / Resolution / Setup/Transition" logically based on the story's progression.
3. **Must use existing character names**: Characters mentioned in the chapter points must be names listed in "Established Characters". **Absolutely do not invent new character names** (e.g., do not write "Gu Chen" for the cafe owner if such a character doesn't exist; use the corresponding character from the list).
4. **Plot must follow the end of the previous chapter**: The beginning of the new chapter should connect to the end of the previous chapter. You may briefly state "Continuing from..." at the start of POINTS.`;

// ─── #2. Chapter Content ──────────────────────────────────────────────────
export const DEFAULT_CHAPTER_CONTENT_TEMPLATE = `## Background Information

### World Setting
{{worldSetting}}{{mainPlotSection}}{{charactersSection}}{{wikiSection}}

## Chapter Requirements
- Chapter Title: {{chapterTitle}}
- Story Beat: {{beat}}
- Chapter Points: {{points}}
- Target Words: {{targetWords}}{{referenceSection}}{{olderSummarySection}}{{adjustInstructionSection}}

---
Please begin writing the main text for this chapter. Requirements:
1. Strictly follow the "Chapter Requirements" above{{adjustInstructionRule}}
2. Maintain a consistent writing style, smoothly connect with the preceding text, and do not just recount what happened before.
3. Continue the story directly from where the preceding text ended.
4. Output the novel's main text directly, without any explanations, titles, or annotations.`;

// ─── #3. Regenerate Chapter Points ──────────────────────────────────────────
export const DEFAULT_CHAPTER_POINTS_TEMPLATE = `You are a chapter planner for novels. Please rewrite the "Chapter Points" for the following chapter—a core plot summary of 2-4 sentences, serving as a guideline for subsequent AI generation of this chapter's text.

## World Setting
{{worldSetting}}

## Main Plot
{{mainPlot}}{{charactersSection}}

## Chapter Information
- Chapter Title: {{chapterTitle}}
- Story Beat: {{beat}}{{referenceSection}}{{currentPointsSection}}

# Writing Requirements

1. **2-4 sentences**, total length controlled between 80-200 words.
2. Must include: main events, character interactions (using existing character names), and chapter-end cliffhanger or emotional resolution.
3. Must fit the phase positioning of the "Story Beat" (e.g., "Rising Action" should depict increased tension and deepening conflicts).
4. If there is a reference chapter, this chapter must continue from its ending or echo its foreshadowing.
5. Do not write as a bulleted outline; use smooth prose.

# Output Format

Output only the points themselves, without any foreword, title, quotes, or concluding remarks.`;

// ─── #3.5 Character Generation ────────────────────────────────────────────────
export const DEFAULT_CHARACTER_DRAFTS_TEMPLATE = `You are a character designer for novels. Please design character cards based on the world setting and main plot.

## World Setting
{{worldSetting}}

## Main Plot
{{mainPlot}}{{existingNamesSection}}

# Mandatory Rules (Must be followed)

1. **Any person explicitly mentioned by "name" in the main plot must have a character card created** — do not omit any named character (whether protagonist, villain, or key supporting cast). Even names mentioned only once or twice must be created.
2. Characters extracted from the main plot "must be placed at the very front of the output", with the most critical characters appearing first. **The first character output must be the protagonist.**
3. If fewer than {{count}} characters are extracted from the main plot, fill the rest with other supporting characters; if {{count}} or more are extracted, you must still output ALL extracted characters (the final count may exceed {{count}}).
4. **The protagonist's (first character) "growth arc" must echo the various phases of the main plot (beginning -> middle -> climax -> resolution)**, clearly stating how the protagonist changes from one state to another, and how it corresponds to key nodes in the main plot.
5. The growth arcs for other characters can be more brief, but must still reflect their function in the main plot.

# Output Format

Each character strictly uses the following format (do not omit any fields):

##CHAR_START##
NAME: <Character Name>
GENDER: <Gender>
AGE: <Age, number or description>
RACE: <Race/Species>
PERSONALITY: <Personality traits, 1-2 sentences>
BACKGROUND: <Background story, 2-3 sentences>
APPEARANCE: <Appearance description, 1-2 sentences>
ABILITIES: <Abilities or skills, 1-2 sentences>
RELATIONS: <Relationships with other characters or factions, 1-2 sentences>
ARC: <Growth arc. The protagonist must have a detailed description of inner changes from beginning -> middle -> climax -> resolution, corresponding to key main plot nodes; other characters can be brief>
VISUAL_NEGATIVE_PROMPT: <Incorrect visual appearance to avoid during comic/illustration generation, must follow the Character Negative Prompt Rules below>
##CHAR_END##

# Character Negative Prompt Rules
{{visualNegativePromptGuidance}}

Directly output multiple ##CHAR_START##...##CHAR_END## blocks, without any foreword, numbering, or concluding remarks. Output at least {{count}} blocks, but do not omit characters mentioned in the main plot (even if this exceeds {{count}} blocks).`;

// ─── #4. Inline Rewrite (Right Click -> Adjust Content) ───────────────────────────
export const DEFAULT_INLINE_ADJUST_TEMPLATE = `You are a novel author needing to rewrite a selected passage of text.

## Chapter Background
- Title: {{chapterTitle}}
- Beat: {{beat}}
- Points: {{points}}

## Preceding Text (Keep the transition smooth, do not rewrite this)
{{beforeContext}}

## Paragraph to Rewrite (Must be completely replaced)
"""
{{selectedText}}
"""

## Succeeding Text (Keep the transition smooth, do not rewrite this)
{{afterContext}}

## ⚠️ User Adjustment Instructions (Highest priority, must be obeyed)
{{adjustInstruction}}

## Output Requirements
1. Output only the rewritten content, without any explanations, quotes, titles, or prefixes.
2. The word count should be similar to the original paragraph (±30%).
3. Style, point of view, and tense must be consistent with the surrounding text.
4. The result must connect smoothly with the last sentence of the preceding text and the first sentence of the succeeding text.
5. Strictly follow the "User Adjustment Instructions".`;

// ─── #4.5 Comic Storyboard ────────────────────────────────────────────────
export const DEFAULT_COMIC_STORYBOARD_TEMPLATE = `You are a novel-to-comic storyboard artist. Please break down the specified chapter into a continuous sequence of comic panel storyboards.

## Book
{{projectSection}}

## Chapter
{{chapterSection}}

## Character Cards
{{characterCardsSection}}

## Relevant Wiki
{{wikiSection}}{{regenerationSection}}

## Chapter Content
{{chapterContent}}

## Output Rules
- Output ONLY JSON, no markdown explanations.
- panels must be ordered chronologically according to the story.
- Each panel must have a visualPrompt that can be directly sent to an image model.
- visualPrompt must include art style, consistent character appearances, setting, action, composition, and lighting.
- One-off background extras can be written directly in visualPrompt, e.g., "A dozen residents standing around".
- Recurring groups appearing across multiple panels should be placed in extraGroups; do not cram extra mobs into characters.
- extraGroups must always be a valid JSON array; output an empty array [] if there are no recurring groups.
- panels[].narration is the video voiceover script, not a short summary. All ordered panels[].narration strung together sequentially must form a complete spoken chapter script.
- Adjust the number of narration sentences based on target panel count and content density: fewer panels mean a single panel can carry more narration; more panels mean spreading it into shorter sentences.
- Pure visual descriptions can be left to visualPrompt, but major events, causality, emotional shifts, key clues, important dialogue meanings, and chapter-end hooks MUST remain in the narration.
- panels[].durationSec defaults to 0, meaning video synthesis uses actual TTS audio length; only output a positive number if the screen needs manual extension.
- narration and dialogue must be written in the target book's Writing Language.
- visualPrompt, negativePrompt, action, setting, location, emotion, shotType, and cameraAngle must ALWAYS be written in English for the best image generation quality.
- Do not invent major events that are not supported by the main text.

JSON schema:
{
  "chapterTitle": "string",
  "storyboardStyle": "string",
  "visualContinuityBible": {},
  "panels": [
    {
      "panelNumber": 1,
      "beat": "string",
      "characters": ["string"],
      "setting": "string",
      "action": "string",
      "emotion": "string",
      "shotType": "string",
      "cameraAngle": "string",
      "visualPrompt": "string",
      "negativePrompt": "string",
      "extraGroups": [
        { "name": "string", "appearance": "string" }
      ],
      "narration": "string",
      "dialogues": [
        { "speaker": "string", "text": "string" }
      ],
      "durationSec": 0
    }
  ]
}`;

// ─── #5. Wiki Generation ────────────────────────────────────────────────
export const DEFAULT_WIKI_INGEST_PLAN_TEMPLATE = `You are the maintainer for this novel's Wiki. Please propose a Wiki update plan based on the newly added chapter content (**Output strict JSON only, no markdown fences, no comments**).

## Background Context
{{worldSetting}}{{mainPlotSection}}

## New Chapter Content
{{chapterContent}}

## Current Wiki Pages
{{existingWikiList}}

## Task
1. Analyze the new chapter content to find new entities, world-building concepts, rules, or major developments for existing entities.
2. Determine which Wiki pages need to be created (create) and which existing pages need to be updated (update).
3. Provide a brief reason for each action.
4. Keep the list concise and important; ignore trivial, one-off details.

JSON schema:
{
  "plan": [
    {
      "action": "create",
      "type": "character | setting | item | concept | faction | event",
      "slug": "string (unique English ID)",
      "title": "string (display name)",
      "reason": "string"
    },
    {
      "action": "update",
      "slug": "string (existing ID)",
      "reason": "string"
    }
  ]
}`;

export const DEFAULT_WIKI_INGEST_CREATE_TEMPLATE = `Write a complete Wiki markdown page based on the following information.

## Target Page
Type: {{type}}
Slug: {{slug}}
Title: {{title}}

## Source Chapter Information
{{chapterContent}}

## Context (Do not create a page for these, just use them for reference)
{{worldSetting}}{{mainPlotSection}}

## Output Requirements
1. Output ONLY markdown content, no extra talk.
2. Use \`# {{title}}\` as the top-level heading.
3. Structure with reasonable subheadings (e.g., \`## Introduction\`, \`## Abilities/Rules\`, \`## History/Events\`, \`## Relationships\`).
4. Only include information present in the source text; do not invent.
5. If it is a character, be sure to include Appearance, Personality, and Abilities.`;

export const DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE = `Update the existing Wiki page to a complete version "after merging the new information", based on the new chapter information.

## Target Page
Slug: {{slug}}

## New Chapter Information
{{chapterContent}}

## Existing Wiki Page Content
{{existingContent}}

## Output Requirements
1. Output the FULL updated markdown content; do NOT output just a diff or partial snippet.
2. Output ONLY markdown, no extra talk.
3. Integrate the new information naturally into the existing structure, modifying or adding subheadings if necessary.
4. Correct any outdated information based on the new chapter (e.g., change in status, death, power level up).
5. Do not lose important old information unless contradicted by the new chapter.`;

export const DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE = `You are the Wiki assistant for this novel. Please answer the user's question based on the following Wiki pages; cite the page type/slug when referencing. If the Wiki does not contain relevant information, honestly say "No such information in the Wiki".

## Context Wiki Pages
{{wikiContent}}

## User Question
{{query}}

## Answer Guidelines
- Be direct and concise.
- Cite the source page in parentheses, e.g., (character/john).
- Do not make up information outside the Wiki.`;

// ─── #6. Lint Checks ────────────────────────────────────────────────────
export const DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE = `You are a character inventory assistant for the novel. Below is a list of "potentially unrecorded character" candidates pre-scanned by the program, along with chapter excerpts.

## Current Recorded Characters (Do NOT add these)
{{knownCharacters}}

## Excerpts
{{excerpts}}

## Pre-scanned Candidates
{{candidates}}

## Task
Filter out "false positives" from the candidates. A false positive is:
1. Actually a recorded character but using a nickname/alias.
2. Not a person (e.g., a place, a move name, an item).
3. A completely insignificant mob/extra without a name or lasting impact (e.g., "a passerby", "the waiter").

Keep ONLY the characters that are "truly named people" or "important entities that should have a Wiki page but currently don't".

**Output strict JSON array of strings**, no markdown fences, no explanations.
Example: ["Named Character A", "Important Villain B"]`;

export const DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE = `You are a novel lore consistency checker. Below are condensed digests of Wiki pages from the same category. Please find factual contradictions between them (e.g., character age / weapons / abilities, conceptual rules / limits, timeline, etc.).

## Category
{{type}}

## Wiki Digests
{{digests}}

## Task
1. Cross-reference the facts.
2. If there are contradictions, output them.
3. If everything is consistent, output an empty array.

**Output strict JSON**, no markdown fences, no explanations.
Schema:
{
  "issues": [
    {
      "description": "string (Detailed explanation of the contradiction)",
      "involvedSlugs": ["string", "string"]
    }
  ]
}`;

export const DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE = `You are a novel lore consistency checker. Check whether the character settings on the Wiki and the narrative descriptions in the novel chapter contradict "narrative facts".

## Wiki Content (Authoritative Reference)
{{wikiContext}}

## Chapter Content (Target to Check)
{{chapterContent}}

## Task
1. Look for factual conflicts in the chapter (e.g., the Wiki says A is blind, but the chapter says A "looked at" something; the Wiki says B's sword is broken, but B uses it here).
2. DO NOT critique writing style, tone, or subjective pacing. Only check hard facts and rules.
3. If there are conflicts, output them. If consistent, output an empty array.

**Output strict JSON**, no markdown fences, no explanations.
Schema:
{
  "issues": [
    {
      "description": "string (What the chapter got wrong compared to the Wiki)",
      "severity": "high | medium",
      "suggestedFix": "string (How the chapter text should be corrected)"
    }
  ]
}`;

export const DEFAULT_LINT_FIX_SUGGEST_TEMPLATE = `You are a wiki maintenance assistant. Below is a consistency issue, please modify the original wiki page markdown to resolve it.

## Issue to Fix
{{issueDescription}}

## Current Wiki Page Content
{{wikiContent}}

## Output Requirements
1. Output the FULL updated markdown content; do NOT output just a diff or partial snippet.
2. Output ONLY markdown, no extra talk.
3. Fix the specific contradiction/error mentioned in the issue.`;

// ─── #7. Multi-Agent Run Templates ──────────────────────────────────────
export const DEFAULT_MULTI_AGENT_PLANNER_TEMPLATE = `You are a Senior Novel Outline Architect (Planner). Please plan a detailed generation outline for this chapter based on the story information and chapter goals.

## Book Information
Title: {{bookTitle}}
Genre: {{genre}}
Style: {{style}}
World Setting:
{{worldSetting}}

## Main Plot
{{mainPlot}}

## Related Context
{{contextWiki}}
{{contextCharacters}}
{{contextPreviousChapters}}

## Chapter Goals
Chapter Title: {{chapterTitle}}
Beat: {{beat}}
Points (Goals):
{{points}}

## Task
1. Break down the "Points" into a detailed chronological outline for this chapter.
2. Design 3 to 6 key scenes/beats.
3. For each scene, specify: the setting, the characters involved, the core action/dialogue, and the purpose in advancing the plot or character arc.
4. Identify any specific narrative requirements (e.g., tone, pacing, foreshadowing to drop).
5. Output strict JSON matching the schema below. Do not use markdown fences.

JSON Schema:
{
  "scenes": [
    {
      "location": "string",
      "characters": ["string"],
      "action": "string",
      "purpose": "string"
    }
  ],
  "narrativeRequirements": ["string"],
  "estimatedPacing": "fast | medium | slow"
}`;

export const DEFAULT_MULTI_AGENT_REPAIR_TEMPLATE = `The JSON format you just output was invalid or did not meet the requirements.
Please fix the JSON and output ONLY valid JSON matching the exact schema.

Error Details:
{{error}}

Previous Invalid Output:
{{invalidOutput}}`;

export const DEFAULT_MULTI_AGENT_WRITER_TEMPLATE = `You are a Senior Novel Writer (Writer). Please draft high-quality novel main text based on the approved detailed outline and background information.

## Background Context
{{contextWiki}}
{{contextCharacters}}
{{contextPreviousChapters}}

## Chapter Plan
Chapter Title: {{chapterTitle}}
Beat: {{beat}}

### Approved Scene Outline
{{outline}}

## Task
1. Write the full prose for the chapter following the scene outline chronologically.
2. Adhere strictly to the requested genre ({{genre}}) and style ({{style}}).
3. Ensure natural dialogue, vivid descriptions, and appropriate pacing.
4. Meet the target word count if provided.
5. Do not include titles, markdown headings, or meta-commentary. Just the story prose.`;

export const DEFAULT_MULTI_AGENT_CRITIC_TEMPLATE = `You are a strict Novel Editor-in-Chief and Literary Critic (Critic). Please conduct a multi-dimensional review and scoring of the Writer/Editor's draft version {{draftVersion}}.

## Guidelines & Goals
Chapter Title: {{chapterTitle}}
Beat: {{beat}}
Original Points:
{{points}}
Approved Scene Outline:
{{outline}}

## Draft to Review (Version {{draftVersion}})
{{draftContent}}

## Task
1. Evaluate if the draft fulfilled all scenes in the outline and the original points.
2. Check for character voice consistency and world-building accuracy.
3. Check pacing, prose quality, and emotional impact.
4. Score the draft out of 100.
5. If the score is below the passing threshold (e.g., 80), provide specific, actionable feedback for the Editor to revise. If it passes, provide a brief approval.
6. Output strict JSON. No markdown fences.

JSON Schema:
{
  "score": number,
  "passed": boolean,
  "feedback": [
    {
      "aspect": "plot | character | prose | pacing | lore",
      "issue": "string",
      "suggestion": "string"
    }
  ],
  "generalComments": "string"
}`;

export const DEFAULT_MULTI_AGENT_CRITIC_REPAIR_TEMPLATE = `The Critic review JSON format you just output was invalid or the draft version was incorrect.
Please fix the JSON and output ONLY valid JSON matching the exact schema.

Error Details:
{{error}}

Previous Invalid Output:
{{invalidOutput}}`;

export const DEFAULT_MULTI_AGENT_EDITOR_TEMPLATE = `You are a Senior Novel Managing Editor (Editor). Please revise the chapter draft version {{draftVersion}} based on the Critic's feedback of the same version, producing a more perfect version {{nextDraftVersion}} of the novel main text.

## Background Context
{{contextWiki}}
{{contextCharacters}}
{{contextPreviousChapters}}

## Chapter Goals
Chapter Title: {{chapterTitle}}
Beat: {{beat}}

## Previous Draft (Version {{draftVersion}})
{{draftContent}}

## Critic Feedback
{{criticFeedback}}

## Task
1. Read the Critic's feedback carefully.
2. Revise the previous draft to address all issues raised (plot, character, prose, pacing, lore).
3. Ensure the overall flow remains smooth and the style is consistent.
4. Output ONLY the revised story prose (Version {{nextDraftVersion}}). Do not include any explanations, titles, or markdown headings.`;
