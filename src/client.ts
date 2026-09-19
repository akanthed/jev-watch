import axios from "axios";
import { AnswerClient, JevApiResponse, TestCase } from "./types";
import { SystemOneAnswer, SystemOneQuestion, fromSystemOneAnswer, toSystemOneQuestion } from "./systemOne";

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-latest";

export interface JevClientConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export class JevClient implements AnswerClient {
  constructor(private readonly config: JevClientConfig) {}

  async ask(test: Pick<TestCase, "state" | "questions">): Promise<JevApiResponse> {
    const {
      apiKey,
      baseUrl = DEFAULT_BASE_URL,
      model = DEFAULT_MODEL,
      timeoutMs = 30_000,
    } = this.config;

    const questions: Record<string, SystemOneQuestion> = {};
    for (const [id, question] of Object.entries(test.questions)) {
      questions[id] = toSystemOneQuestion(question);
    }

    const response = await axios.post<{ answers: Record<string, SystemOneAnswer> }>(
      `${baseUrl.replace(/\/+$/, "")}/v1/systemone`,
      { state: test.state, model, questions },
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
