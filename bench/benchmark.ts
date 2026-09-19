import { evaluateQuestion } from "../src/runner";
import { AnswerResult } from "../src/types";

// Deterministic LCG so the benchmark is reproducible across runs/machines.
function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

interface Case {
  groundTruthDrift: boolean;
  expected: string | number;
  actual: AnswerResult;
  tolerance: number;
}

function genChoiceCase(rng: () => number): Case {
  const options = ["billing", "technical", "sales"];
  const expected = options[Math.floor(rng() * options.length)];
  const tolerance = 0.1;

  const injectWrongChoice = rng() < 0.3;
  const injectLowConfidence = rng() < 0.3;

  const choice = injectWrongChoice
    ? options[(options.indexOf(expected) + 1) % options.length]
    : expected;
  const confidence = injectLowConfidence ? 0.5 + rng() * 0.3 : 0.9 + rng() * 0.1;

  const groundTruthDrift = injectWrongChoice || 1 - confidence > tolerance;

  return {
    groundTruthDrift,
    expected,
    actual: { type: "choice", choice, confidence },
    tolerance,
  };
}

function genScoreCase(rng: () => number): Case {
  const expected = Math.round(rng() * 100) / 100;
  const tolerance = 0.1;

  const injectDrift = rng() < 0.35;
  const delta = injectDrift ? tolerance + 0.05 + rng() * 0.3 : rng() * tolerance * 0.9;
  const sign = rng() < 0.5 ? 1 : -1;
  const score = Math.round((expected + sign * delta) * 100) / 100;

  const injectLowConfidence = rng() < 0.3;
  const confidence = injectLowConfidence ? 0.5 + rng() * 0.3 : 0.9 + rng() * 0.1;

  const groundTruthDrift = Math.abs(score - expected) > tolerance || 1 - confidence > tolerance;

  return {
    groundTruthDrift,
    expected,
    actual: { type: "score", score, confidence },
    tolerance,
  };
}

function runConfusionMatrixBenchmark(n: number) {
  const rng = makeRng(42);
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (let i = 0; i < n; i++) {
    const c = rng() < 0.5 ? genChoiceCase(rng) : genScoreCase(rng);
    const result = evaluateQuestion("q", c.expected, c.actual, c.tolerance);
    const flagged = !result.passed;

    if (flagged && c.groundTruthDrift) tp++;
    else if (!flagged && !c.groundTruthDrift) tn++;
    else if (flagged && !c.groundTruthDrift) fp++;
    else fn++;
  }

  const total = tp + tn + fp + fn;
  const accuracy = (tp + tn) / total;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);

  console.log(`Drift-detection accuracy over ${total} synthetic cases`);
  console.log(`  true positive  (drift caught):        ${tp}`);
  console.log(`  true negative  (stable, no false alarm): ${tn}`);
  console.log(`  false positive (false alarm):         ${fp}`);
  console.log(`  false negative (drift missed):        ${fn}`);
  console.log(`  accuracy:  ${(accuracy * 100).toFixed(2)}%`);
  console.log(`  precision: ${(precision * 100).toFixed(2)}%`);
  console.log(`  recall:    ${(recall * 100).toFixed(2)}%`);
  console.log("");

  return { accuracy, precision, recall };
}

function runThroughputBenchmark(n: number) {
  const rng = makeRng(7);
  const cases: Case[] = [];
  for (let i = 0; i < n; i++) {
    cases.push(rng() < 0.5 ? genChoiceCase(rng) : genScoreCase(rng));
  }

  const start = process.hrtime.bigint();
  for (const c of cases) {
    evaluateQuestion("q", c.expected, c.actual, c.tolerance);
  }
  const end = process.hrtime.bigint();

  const ms = Number(end - start) / 1e6;
  const perSec = n / (ms / 1000);

  console.log(`Throughput: ${n} evaluations in ${ms.toFixed(2)}ms (${perSec.toFixed(0)}/sec)`);
  console.log("");
}

const ACCURACY_GATE = 0.99;

const { accuracy } = runConfusionMatrixBenchmark(20_000);
runThroughputBenchmark(200_000);

if (accuracy < ACCURACY_GATE) {
  console.error(`FAIL: accuracy ${(accuracy * 100).toFixed(2)}% below gate ${ACCURACY_GATE * 100}%`);
  process.exit(1);
}

console.log(`PASS: drift-detection logic matches ground truth on synthetic cases.`);
