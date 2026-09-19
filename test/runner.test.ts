import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateQuestion, runTestCase } from "../src/runner";
import { AnswerResult, JevApiResponse, TestCase } from "../src/types";
import { JevClient } from "../src/client";

test("choice: matching choice, high confidence -> pass", () => {
  const actual: AnswerResult = { type: "choice", choice: "technical", confidence: 0.95 };
  const result = evaluateQuestion("department", "technical", actual, 0.1);
  assert.equal(result.passed, true);
  assert.deepEqual(result.drifts, []);
});

test("choice: wrong choice -> flagged as choice drift", () => {
  const actual: AnswerResult = { type: "choice", choice: "billing", confidence: 0.95 };
  const result = evaluateQuestion("department", "technical", actual, 0.1);
  assert.equal(result.passed, false);
  assert.equal(result.drifts.length, 1);
  assert.equal(result.drifts[0].kind, "choice");
  assert.equal(result.drifts[0].expected, "technical");
  assert.equal(result.drifts[0].actual, "billing");
});

test("choice: correct choice but low confidence -> flagged as confidence drift", () => {
  const actual: AnswerResult = { type: "choice", choice: "technical", confidence: 0.5 };
  const result = evaluateQuestion("department", "technical", actual, 0.1);
  assert.equal(result.passed, false);
  assert.equal(result.drifts.length, 1);
  assert.equal(result.drifts[0].kind, "confidence");
});

test("choice: confidence exactly at tolerance boundary -> pass", () => {
  // tolerance 0.1 requires confidence >= 0.9; 0.9 itself must pass (not "beyond" tolerance)
  const actual: AnswerResult = { type: "choice", choice: "technical", confidence: 0.9 };
  const result = evaluateQuestion("department", "technical", actual, 0.1);
  assert.equal(result.passed, true);
});

test("choice: missing answer for question -> flagged as drift", () => {
  const result = evaluateQuestion("department", "technical", undefined, 0.1);
  assert.equal(result.passed, false);
  assert.equal(result.drifts[0].kind, "choice");
  assert.equal(result.drifts[0].actual, undefined);
});

test("score: within tolerance -> pass", () => {
  const actual: AnswerResult = { type: "score", score: 0.62, confidence: 0.9 };
  const result = evaluateQuestion("urgency", 0.6, actual, 0.1);
  assert.equal(result.passed, true);
});

test("score: outside tolerance -> flagged as score drift", () => {
  const actual: AnswerResult = { type: "score", score: 1.0, confidence: 0.9 };
  const result = evaluateQuestion("urgency", 0.6, actual, 0.15);
  assert.equal(result.passed, false);
  assert.equal(result.drifts[0].kind, "score");
  assert.equal(result.drifts[0].expected, 0.6);
  assert.equal(result.drifts[0].actual, 1.0);
});

test("score: exactly at tolerance boundary -> pass", () => {
  const actual: AnswerResult = { type: "score", score: 0.7, confidence: 0.9 };
  const result = evaluateQuestion("urgency", 0.6, actual, 0.1);
  assert.equal(result.passed, true);
});

test("score: both score and confidence drift -> both flagged", () => {
  const actual: AnswerResult = { type: "score", score: 1.0, confidence: 0.4 };
  const result = evaluateQuestion("urgency", 0.6, actual, 0.1);
  assert.equal(result.passed, false);
  const kinds = result.drifts.map((d) => d.kind).sort();
  assert.deepEqual(kinds, ["confidence", "score"]);
});

test("runTestCase: passes when every question passes", async () => {
  const test_: TestCase = {
    testName: "sample",
    state: "irrelevant",
    questions: {
      department: {
        type: "choice",
        instruction: "which team?",
        options: { billing: "x", technical: "y" },
      },
    },
    expected: { department: "technical" },
    tolerance: 0.1,
  };

  const fakeClient = {
    ask: async (): Promise<JevApiResponse> => ({
      answers: { department: { type: "choice", choice: "technical", confidence: 0.99 } },
    }),
  } as unknown as JevClient;

  const result = await runTestCase(fakeClient, test_);
  assert.equal(result.passed, true);
  assert.equal(result.testName, "sample");
});

test("runTestCase: fails and records drift when API disagrees", async () => {
  const test_: TestCase = {
    testName: "sample",
    state: "irrelevant",
    questions: {
      department: {
        type: "choice",
        instruction: "which team?",
        options: { billing: "x", technical: "y" },
      },
    },
    expected: { department: "technical" },
    tolerance: 0.1,
  };

  const fakeClient = {
    ask: async (): Promise<JevApiResponse> => ({
      answers: { department: { type: "choice", choice: "billing", confidence: 0.99 } },
    }),
  } as unknown as JevClient;

  const result = await runTestCase(fakeClient, test_);
  assert.equal(result.passed, false);
  assert.equal(result.questionResults[0].drifts[0].kind, "choice");
});

test("runTestCase: API error is captured, not thrown", async () => {
  const test_: TestCase = {
    testName: "sample",
    state: "irrelevant",
    questions: {
      department: { type: "choice", instruction: "which team?", options: { billing: "x" } },
    },
    expected: { department: "billing" },
    tolerance: 0.1,
  };

  const fakeClient = {
    ask: async (): Promise<JevApiResponse> => {
      throw new Error("network down");
    },
  } as unknown as JevClient;

  const result = await runTestCase(fakeClient, test_);
  assert.equal(result.passed, false);
  assert.equal(result.error, "network down");
});
