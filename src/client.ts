import { OpenRouter } from "@openrouter/sdk";
import { AnswerResult, JevApiResponse, Question, TestCase } from "./types";

export interface JevClientConfig {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

const DEFAULT_MODEL = "~typesafe/jev-latest";

function buildDecisionQuestions(
  questions: Record<string, Question>
): Parameters<OpenRouter["alpha"]["decisions"]["create"]>[0]["decisionsRequest"]["questions"] {
  const result: Record<string, any> = {};
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === "choice") {
      result[id] = {
        type: "choice",
        instructions: q.instruction,
        criteria: q.options,
      };
    } else {
      result[id] = {
        type: "score",
        instructions: q.instruction,
        criteria: [String(q.min ?? 0), String(q.max ?? 1)],
      };
    }
  }
  return result;
}

export class JevClient {
  private readonly openrouter: OpenRouter;

  constructor(private readonly config: JevClientConfig) {
    this.openrouter = new OpenRouter({ apiKey: config.apiKey });
  }

  async ask(test: Pick<TestCase, "state" | "questions">): Promise<JevApiResponse> {
    const { model = DEFAULT_MODEL } = this.config;

    const decision = await this.openrouter.alpha.decisions.create({
      decisionsRequest: {
        model,
        state: test.state,
        questions: buildDecisionQuestions(test.questions),
      },
    });

    const answers: Record<string, AnswerResult> = {};
    for (const [id, answer] of Object.entries(decision.answers)) {
      const a = answer as any;
      if (a.type === "choice") {
        answers[id] = {
          type: "choice",
          choice: a.choice,
          confidence: a.probabilities?.[a.choice],
        };
      } else if (a.type === "score" || a.type === "noul") {
        answers[id] = {
          type: "score",
          score: a.type === "noul" ? a.noul : a.score,
        };
      } else {
        throw new Error(`Question "${id}": unknown answer type "${a.type}"`);
      }
    }

    return { answers };
  }
}
