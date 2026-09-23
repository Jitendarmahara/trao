import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createLlmClient, DuckDuckGoSearchProvider } from '@interview-prep-kit/core';
import { runBatch } from './batch/run-batch.js';

/**
 * Batch entry point (Section 9):
 *   npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Reads an array of cases, runs the SAME pipeline the app uses on each, and
 * writes a single JSON file in the Appendix B shape. Continues after a case
 * fails. Reads LLM credentials from environment variables (.env / .env.example).
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
  });

  if (!values.input || !values.output) {
    throw new Error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
  }

  const raw = await readFile(values.input, 'utf8');
  const cases: unknown = JSON.parse(raw);
  if (!Array.isArray(cases)) {
    throw new Error('Input file must be a JSON array of cases.');
  }

  const llm = createLlmClient();
  const searchProvider = new DuckDuckGoSearchProvider();

  const result = await runBatch(cases, {
    llm,
    searchProvider,
    allowLocal: true, // company sites in the batch may be served from a local address
    onCase: (id, status) => console.error(`[${status}] ${id}`),
  });

  await writeFile(values.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const ok = result.kits.filter((k) => k.status === 'ok').length;
  console.error(
    `Wrote ${result.kits.length} kit(s) — ${ok} ok, ${result.kits.length - ok} failed → ${values.output}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
