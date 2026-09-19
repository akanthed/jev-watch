import { AnswerResult, Question } from "./types";

// Shared wire format for TypeSafe's System One API, confirmed identical
// whether called directly (api.typesafe.ai) or normalized through
// OpenRouter's Decisions endpoint.

export type SystemOneQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } };

export type SystemOneAnswer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "noul"; noul: number }
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

  // jev-watch's "score" questions are continuous 0-1 values (min/max) whose
  // endpoints are already explained in `instruction`. Jev's calibrated
  // yes/no probability (noul) is the closest native fit.
  return {
    type: "noul",
    instructions: question.instruction,
    criteria: {
      true: "The value described in the instructions is at or near the maximum of the stated range",
      false: "The value described in the instructions is at or near the minimum of the stated range",
    },
  };
}

export function fromSystemOneAnswer(answer: SystemOneAnswer): AnswerResult {
  if (answer.type === "choice") {
    return { type: "choice", choice: answer.choice, confidence: answer.confidence };
  }
  if (answer.type === "noul") {
    return { type: "score", score: answer.noul };
  }
  return { type: "score", score: answer.score, confidence: answer.confidence };
}
