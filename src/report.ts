import { TestResult } from "./types";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function fmtValue(v: string | number | undefined): string {
  if (v === undefined) return "(missing)";
  return typeof v === "number" ? v.toFixed(3) : v;
}

export function printResults(results: TestResult[]): void {
  let passCount = 0;

  for (const result of results) {
    if (result.error) {
      console.log(`${RED}FAIL${RESET} ${result.testName} — request error: ${result.error}`);
      continue;
    }

    if (result.passed) {
      passCount++;
      console.log(`${GREEN}PASS${RESET} ${result.testName}`);
      continue;
    }

    console.log(`${RED}FAIL${RESET} ${result.testName}`);
    for (const qr of result.questionResults) {
      if (qr.passed) continue;
      for (const drift of qr.drifts) {
        console.log(
          `  ${YELLOW}drift${RESET} [${qr.questionId}] ${drift.kind}: ` +
            `expected ${fmtValue(drift.expected)}, got ${fmtValue(drift.actual)} ` +
            `(tolerance ${drift.tolerance})`
        );
      }
    }
  }

  console.log("");
  console.log(`${passCount}/${results.length} tests passed`);
}
