import { AnswerResult, Question } from "./types";

// Shared wire format for TypeSafe's System One API, confirmed identical
// whether called directly (api.typesafe.ai) or normalized through
// OpenRouter's Decisions endpoint.

export type SystemOneQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: [string, string] };

export type SystemOneAnswer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: "score";
      score: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
      confidence: number;
    };

export function toSystemOneQuestion(question: Question): SystemOneQuestion {
  if (question.type === "choice") {
    return {
      type: "choice",
      instructions: question.instruction,
      criteria: question.options,
    };
  }

  return {
    type: "score",
    instructions: question.instruction,
    criteria: [String(question.min ?? 0), String(question.max ?? 1)],
  };
}

export function fromSystemOneAnswer(answer: SystemOneAnswer): AnswerResult {
  if (answer.type === "choice") {
    return { type: "choice", choice: answer.choice, confidence: answer.confidence };
  }
  return { type: "score", score: answer.score, confidence: answer.confidence };
}
