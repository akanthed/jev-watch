import axios from "axios";
import { AnswerClient, JevApiResponse, Question, TestCase } from "./types";

export interface JevClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export class JevClient implements AnswerClient {
  constructor(private readonly config: JevClientConfig) {}

  async ask(test: Pick<TestCase, "state" | "questions">): Promise<JevApiResponse> {
    const { baseUrl, apiKey, timeoutMs = 30_000 } = this.config;

    const response = await axios.post<JevApiResponse>(
      `${baseUrl.replace(/\/+$/, "")}/v1/answer`,
      {
        state: test.state,
        questions: test.questions as Record<string, Question>,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      }
    );

    return response.data;
  }
}
