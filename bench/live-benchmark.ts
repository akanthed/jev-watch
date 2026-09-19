import * as path from "path";
import * as dotenv from "dotenv";
import { JevClient } from "../src/client";
import { OpenRouterClient } from "../src/openrouterClient";
import { AnswerClient } from "../src/types";
import { loadTestCasesFromDir, runTestSuite } from "../src/runner";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Hits the real Jev API (direct or via OpenRouter) against examples/,
// repeated, to show jev-watch actually catches drift against a live model
// rather than only a mock. Costs real API calls -- kept small by default.
// Override with BENCH_RUNS.

function buildClient(): AnswerClient | undefined {
  const apiKey = process.env.JEV_API_KEY;
  if (apiKey) {
    return new JevClient({ apiKey, baseUrl: process.env.JEV_API_URL, model: process.env.JEV_MODEL });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return new OpenRouterClient({ apiKey: openRouterKey, model: process.env.OPENROUTER_MODEL });
  }

  return undefined;
}

async function main() {
  const client = buildClient();
  if (!client) {
    console.log("Neither JEV_API_KEY nor OPENROUTER_API_KEY set -- skipping live benchmark.");
    return;
  }

  const runs = Number(process.env.BENCH_RUNS ?? 3);
  const examplesDir = path.resolve(process.cwd(), "examples");
  const tests = loadTestCasesFromDir(examplesDir);

  console.log(`Running ${tests.length} example test cases x ${runs} run(s) against the live Jev API...`);
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
