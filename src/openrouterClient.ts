import axios from "axios";
import { AnswerClient, JevApiResponse, TestCase } from "./types";
import { SystemOneAnswer, SystemOneQuestion, fromSystemOneAnswer, toSystemOneQuestion } from "./systemOne";

const DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const DEFAULT_MODEL = "~typesafe/jev-latest";

export interface OpenRouterClientConfig {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

export class OpenRouterClient implements AnswerClient {
  constructor(private readonly config: OpenRouterClientConfig) {}

  async ask(test: Pick<TestCase, "state" | "questions">): Promise<JevApiResponse> {
    const { apiKey, model = DEFAULT_MODEL, timeoutMs = 30_000 } = this.config;

    const questions: Record<string, SystemOneQuestion> = {};
    for (const [id, question] of Object.entries(test.questions)) {
      questions[id] = toSystemOneQuestion(question);
    }

    const response = await axios.post<{ answers: Record<string, SystemOneAnswer> }>(
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

    const answers: JevApiResponse["answers"] = {};
    for (const [id, answer] of Object.entries(response.data.answers)) {
      answers[id] = fromSystemOneAnswer(answer);
    }

    return { answers };
  }
}
