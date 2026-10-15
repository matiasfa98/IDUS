import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { config } from "../config.js";

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// ── Response schema Gemini must follow ──────────────
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    challenge: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        topic: { type: SchemaType.STRING },
        difficulty: { type: SchemaType.STRING },
        summary: { type: SchemaType.STRING },
      },
      required: ["title", "topic", "difficulty", "summary"],
    },
    phases: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          monthLabel: { type: SchemaType.STRING },
          days: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                dayNumber: { type: SchemaType.INTEGER },
                title: { type: SchemaType.STRING },
                type: {
                  type: SchemaType.STRING,
                  enum: ["PROJECT", "MILESTONE", "FINAL"],
                },
                description: { type: SchemaType.STRING },
                objective: { type: SchemaType.STRING },
                requirements: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
                estimatedMinutes: { type: SchemaType.INTEGER },
              },
              required: [
                "dayNumber",
                "title",
                "type",
                "description",
                "objective",
                "requirements",
                "estimatedMinutes",
              ],
            },
          },
        },
        required: ["title", "description", "days"],
      },
    },
  },
  required: ["challenge", "phases"],
};

// ── Prompt builder ──────────────────────────────────
function buildPrompt(input) {
  const {
    topic,
    description,
    difficulty,
    goal,
    availableDays,
    dailyMinutes,
    startDate,
    endDate,
    creatorInstructions,
  } = input;

  return `You are a senior curriculum architect designing a PROJECT-BASED skill challenge.

═══════════════════════════════════════════
CHALLENGE SPECIFICATION
═══════════════════════════════════════════
Topic: ${topic}
Description: ${description || "(none provided)"}
Universal difficulty: ${difficulty}
Goal: ${goal || "Become capable at this skill by building real things."}
Duration: ${startDate} to ${endDate}
Available challenge days: ${availableDays}
Daily time budget: ${dailyMinutes} minutes
${creatorInstructions ? `\nCreator instructions: ${creatorInstructions}` : ""}

═══════════════════════════════════════════
NON-NEGOTIABLE RULES
═══════════════════════════════════════════
1. Every day is a BUILD, EXPERIMENT, or MILESTONE. Never "read about X" or "watch a video about Y".
2. Projects must build on previous ones. Day 5 should use skills from Day 2.
3. Complexity must increase progressively across the challenge.
4. Group days into 4–8 logical PHASES with clear themes.
5. The LAST day (dayNumber = ${availableDays}) MUST have type "FINAL" and be a capstone combining all skills.
6. Difficulty must match ${difficulty}. Beginner = genuinely challenging but accessible. Expert = sophisticated, deep.
7. Respect daily time: estimatedMinutes should be ≤ ${dailyMinutes * 1.2} and average ${dailyMinutes}.
8. Produce EXACTLY ${availableDays} day entries total across all phases.
9. Day numbers must be sequential: 1, 2, 3, ... ${availableDays}. No gaps.
10. Each phase should have a "monthLabel" like "Month 1 — Foundations" ONLY when the duration exceeds 60 days.
11. requirements: 3–7 concrete, checkable items. Not vague ("improve skills") but specific ("handle null input without crashing").
12. Avoid repetition. No two days should be essentially the same project.

═══════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════
Return ONLY valid JSON matching the provided schema. No prose, no markdown, no explanation.`;
}

// ── Main generator ──────────────────────────────────
export async function generateChallengeProgression(input) {
  const model = genAI.getGenerativeModel({
    model: config.gemini.model,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.7,
    },
  });

  const prompt = buildPrompt(input);

  console.log(`[gemini] generating ${input.availableDays} days for "${input.topic}"...`);
  const start = Date.now();

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  console.log(`[gemini] response received in ${Date.now() - start}ms`);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }

  return parsed;
}