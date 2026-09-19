import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { JevClient } from "../src/client";
import { loadTestCasesFromDir, runTestSuite } from "../src/runner";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Hits the real OpenRouter API against examples/, repeated, to show jev-watch
// actually catches drift against a live model rather than only a mock.
// Costs real API calls -- kept small by default. Override with BENCH_RUNS.

async function main() {
  const apiKey = process.env.OPEN_ROUTE_KEY;
  if (!apiKey) {
    console.log("OPEN_ROUTE_KEY not set -- skipping live benchmark.");
    return;
  }

  const runs = Number(process.env.BENCH_RUNS ?? 3);
  const examplesDir = path.resolve(process.cwd(), "examples");
  const tests = loadTestCasesFromDir(examplesDir);
  const client = new JevClient({ apiKey, model: process.env.OPEN_ROUTE_MODEL });

  console.log(`Running ${tests.length} example test cases x ${runs} run(s) against live OpenRouter...`);
  console.log("");

  const perTestPasses: Record<string, number> = {};
  for (const { test } of tests) perTestPasses[test.testName] = 0;

  for (let run = 1; run <= runs; run++) {
    const results = await runTestSuite(client, tests);
    for (const r of results) {
      if (r.passed) perTestPasses[r.testName]++;
      const status = r.passed ? "PASS" : "FAIL";
      console.log(`  run ${run}: ${status} ${r.testName}`);
    }
  }

  console.log("");
  console.log("Consistency across runs (pass rate per test case):");
  let flaky = 0;
  for (const [name, passes] of Object.entries(perTestPasses)) {
    const rate = (passes / runs) * 100;
    if (passes !== 0 && passes !== runs) flaky++;
    console.log(`  ${name}: ${passes}/${runs} (${rate.toFixed(0)}%)`);
  }

  console.log("");
  if (flaky > 0) {
    console.log(
      `${flaky} test case(s) had inconsistent verdicts across identical runs -- ` +
        `this is exactly the kind of drift jev-watch is built to surface.`
    );
  } else {
    console.log("All test cases returned consistent verdicts across runs.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
