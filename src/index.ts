import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { JevClient } from "./client";
import { OpenRouterClient } from "./openrouterClient";
import { AnswerClient } from "./types";
import { loadTestCase, loadTestCasesFromDir, runTestSuite } from "./runner";
import { printResults } from "./report";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function usage(): void {
  console.log(`jev-watch — catch drifted answers from the TypeSafe Jev API

Usage:
  jev-watch <path-to-test.json | directory-of-tests>

Environment (either one of):
  JEV_API_URL       Base URL of a direct TypeSafe Jev API deployment
  JEV_API_KEY       Bearer token for that deployment

  OPENROUTER_API_KEY  OpenRouter API key, to call Jev via OpenRouter instead
  OPENROUTER_MODEL    Model slug (default: ~typesafe/jev-latest)
`);
}

function buildClient(): AnswerClient | undefined {
  const baseUrl = process.env.JEV_API_URL;
  const apiKey = process.env.JEV_API_KEY;
  if (baseUrl && apiKey) {
    return new JevClient({ baseUrl, apiKey });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return new OpenRouterClient({
      apiKey: openRouterKey,
      model: process.env.OPENROUTER_MODEL,
    });
  }

  return undefined;
}

export async function main(argv: string[]): Promise<number> {
  const target = argv[2];

  if (!target || target === "-h" || target === "--help") {
    usage();
    return target ? 0 : 1;
  }

  const client = buildClient();
  if (!client) {
    console.error(
      "Missing credentials in environment (.env.local): set JEV_API_URL + JEV_API_KEY " +
        "for a direct Jev API deployment, or OPENROUTER_API_KEY to call Jev via OpenRouter."
    );
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

  const results = await runTestSuite(client, tests);
  printResults(results);

  return results.every((r) => r.passed) ? 0 : 1;
}
