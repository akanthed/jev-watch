export type QuestionType = "choice" | "score";

export interface ChoiceQuestion {
  type: "choice";
  instruction: string;
  options: Record<string, string>;
}

export interface ScoreQuestion {
  type: "score";
  instruction: string;
  min?: number;
  max?: number;
}

export type Question = ChoiceQuestion | ScoreQuestion;

export interface TestCase {
  testName: string;
  state: string;
  questions: Record<string, Question>;
  expected: Record<string, string | number>;
  tolerance: number;
}

export interface AnswerResult {
  type: QuestionType;
  choice?: string;
  score?: number;
  confidence?: number;
}

export interface JevApiResponse {
  answers: Record<string, AnswerResult>;
}

export type DriftKind = "choice" | "score" | "confidence";

export interface DriftDetail {
  questionId: string;
  kind: DriftKind;
  expected: string | number;
  actual: string | number | undefined;
  tolerance: number;
}

export interface QuestionResult {
  questionId: string;
  passed: boolean;
  drifts: DriftDetail[];
  actual: AnswerResult | undefined;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  questionResults: QuestionResult[];
  error?: string;
}
