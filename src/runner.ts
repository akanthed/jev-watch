import * as fs from "fs";
import * as path from "path";
import {
  AnswerClient,
  AnswerResult,
  DriftDetail,
  QuestionResult,
  TestCase,
  TestResult,
} from "./types";

export function loadTestCase(filePath: string): TestCase {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as TestCase;

  if (!parsed.testName || !parsed.state || !parsed.questions || !parsed.expected) {
    throw new Error(
      `${filePath}: test case missing one of testName/state/questions/expected`
    );
  }
  if (typeof parsed.tolerance !== "number") {
    throw new Error(`${filePath}: tolerance must be a number (e.g. 0.1)`);
  }

  return parsed;
}

export function loadTestCasesFromDir(dirPath: string): { file: string; test: TestCase }[] {
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((file) => ({
    file,
    test: loadTestCase(path.join(dirPath, file)),
  }));
}

// Guards against float rounding (e.g. 1 - 0.7 === 0.30000000000000004) pushing
// an exact-boundary value over its tolerance.
const EPSILON = 1e-9;

export function evaluateQuestion(
  questionId: string,
  expected: string | number,
  actual: AnswerResult | undefined,
  tolerance: number
): QuestionResult {
  const drifts: DriftDetail[] = [];

  if (!actual) {
    drifts.push({
      questionId,
      kind: "choice",
      expected,
      actual: undefined,
      tolerance,
    });
    return { questionId, passed: false, drifts, actual };
  }

  if (actual.type === "choice") {
    if (actual.choice !== expected) {
      drifts.push({
        questionId,
        kind: "choice",
        expected,
        actual: actual.choice,
        tolerance,
      });
    }
    if (typeof actual.confidence === "number" && 1 - actual.confidence > tolerance + EPSILON) {
      drifts.push({
        questionId,
        kind: "confidence",
        expected: 1 - tolerance,
        actual: actual.confidence,
        tolerance,
      });
    }
  } else if (actual.type === "score") {
    const expectedNum = Number(expected);
    if (typeof actual.score === "number" && Math.abs(actual.score - expectedNum) > tolerance + EPSILON) {
      drifts.push({
        questionId,
        kind: "score",
        expected: expectedNum,
        actual: actual.score,
        tolerance,
      });
    }
    if (typeof actual.confidence === "number" && 1 - actual.confidence > tolerance + EPSILON) {
      drifts.push({
        questionId,
        kind: "confidence",
        expected: 1 - tolerance,
        actual: actual.confidence,
        tolerance,
      });
    }
  }

  return { questionId, passed: drifts.length === 0, drifts, actual };
}

export async function runTestCase(client: AnswerClient, test: TestCase): Promise<TestResult> {
  try {
    const response = await client.ask({ state: test.state, questions: test.questions });

    const questionResults = Object.entries(test.expected).map(([questionId, expected]) =>
      evaluateQuestion(questionId, expected, response.answers[questionId], test.tolerance)
    );

    return {
      testName: test.testName,
      passed: questionResults.every((r) => r.passed),
      questionResults,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      testName: test.testName,
      passed: false,
      questionResults: [],
      error: message,
    };
  }
}

export async function runTestSuite(
  client: AnswerClient,
  tests: { file: string; test: TestCase }[]
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (const { test } of tests) {
    results.push(await runTestCase(client, test));
  }
  return results;
}
