import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { JevClient } from "./client";
import { loadTestCase, loadTestCasesFromDir, runTestSuite } from "./runner";
import { printResults } from "./report";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function usage(): void {
  console.log(`jev-watch — catch drifted answers from the TypeSafe Jev API

Usage:
  jev-watch <path-to-test.json | directory-of-tests>

Environment:
  OPEN_ROUTE_KEY     OpenRouter API key (required)
  OPEN_ROUTE_MODEL   OpenRouter model id (optional, default ~typesafe/jev-latest)
`);
}

export async function main(argv: string[]): Promise<number> {
  const target = argv[2];

  if (!target || target === "-h" || target === "--help") {
    usage();
    return target ? 0 : 1;
  }

  const apiKey = process.env.OPEN_ROUTE_KEY;
  const model = process.env.OPEN_ROUTE_MODEL;

  if (!apiKey) {
    console.error("Missing OPEN_ROUTE_KEY in environment (.env.local).");
    return 1;
  }

  const resolved = path.resolve(process.cwd(), target);
  if (!fs.existsSync(resolved)) {
    console.error(`No such file or directory: ${resolved}`);
    return 1;
  }

  const tests = fs.statSync(resolved).isDirectory()
    ? loadTestCasesFromDir(resolved)
    : [{ file: path.basename(resolved), test: loadTestCase(resolved) }];

  if (tests.length === 0) {
    console.error(`No .json test cases found in ${resolved}`);
    return 1;
  }

  const client = new JevClient({ apiKey, model });
  const results = await runTestSuite(client, tests);
  printResults(results);

  return results.every((r) => r.passed) ? 0 : 1;
}
