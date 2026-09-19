import axios from "axios";
import { AnswerClient, AnswerResult, JevApiResponse, Question, TestCase } from "./types";

const DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const DEFAULT_MODEL = "~typesafe/jev-latest";

export interface OpenRouterClientConfig {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

type DecisionsQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } };

type DecisionsAnswer =
  | { type: "choice"; choice: string; probabilities?: Record<string, number> }
  | { type: "noul"; noul: number }
  | { type: "score"; score: number };

function toDecisionsQuestion(question: Question): DecisionsQuestion {
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

function fromDecisionsAnswer(answer: DecisionsAnswer): AnswerResult {
  if (answer.type === "choice") {
    return {
      type: "choice",
      choice: answer.choice,
      confidence: answer.probabilities?.[answer.choice],
    };
  }
  if (answer.type === "noul") {
    return { type: "score", score: answer.noul };
  }
  return { type: "score", score: answer.score };
}

export class OpenRouterClient implements AnswerClient {
  constructor(private readonly config: OpenRouterClientConfig) {}

  async ask(test: Pick<TestCase, "state" | "questions">): Promise<JevApiResponse> {
    const { apiKey, model = DEFAULT_MODEL, timeoutMs = 30_000 } = this.config;

    const questions: Record<string, DecisionsQuestion> = {};
    for (const [id, question] of Object.entries(test.questions)) {
      questions[id] = toDecisionsQuestion(question);
    }

    const response = await axios.post<{ answers: Record<string, DecisionsAnswer> }>(
      DECISIONS_ENDPOINT,
      { model, state: test.state, questions },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      }
    );

    const answers: Record<string, AnswerResult> = {};
    for (const [id, answer] of Object.entries(response.data.answers)) {
      answers[id] = fromDecisionsAnswer(answer);
    }

    return { answers };
  }
}
