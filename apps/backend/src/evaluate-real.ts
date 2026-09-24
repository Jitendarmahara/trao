import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createLlmClient, DuckDuckGoSearchProvider, loadLlmConfig } from '@interview-prep-kit/core';
import { collectCase } from './report/collect.js';
import { renderMarkdown } from './report/markdown.js';
import { RealCaseSchema, type CaseReport, type RealCompanyReport } from './report/types.js';

const INPUT = 'fixtures/real-cases.json';
const OUT_DIR = 'evaluation-results';
const JSON_PATH = `${OUT_DIR}/real-company-report.json`;
const MD_PATH = `${OUT_DIR}/real-company-summary.md`;

/**
 * Real-company evaluation harness. Runs the SAME runPipeline() over
 * fixtures/real-cases.json and writes one machine-readable JSON report plus a
 * human-readable Markdown summary. One case failing never stops the others.
 */
async function main(): Promise<void> {
  const raw = await readFile(INPUT, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${INPUT} must be a JSON array of cases.`);

  const model = loadLlmConfig().model;
  const llm = createLlmClient();
  const searchProvider = new DuckDuckGoSearchProvider();

  const cases: CaseReport[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const c = RealCaseSchema.safeParse(parsed[i]);
    if (!c.success) {
      const rawItem = parsed[i] as { id?: unknown };
      const id = typeof rawItem?.id === 'string' ? rawItem.id : `case-${i + 1}`;
      console.error(`[skip] ${id}: invalid case shape`);
      cases.push(minimalFailed(id, c.error.issues.map((e) => e.message).join('; ')));
      continue;
    }
    console.error(`[run ] ${c.data.id} …`);
    const report = await collectCase(c.data, { llm, searchProvider, allowLocal: false, model });
    console.error(`[${report.status === 'ok' ? 'ok  ' : 'fail'}] ${c.data.id} (${report.timing.duration_ms} ms)`);
    cases.push(report);
  }

  const report: RealCompanyReport = {
    report_version: '1.0',
    generated_at: new Date().toISOString(),
    cases,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(MD_PATH, renderMarkdown(report), 'utf8');

  const ok = cases.filter((c) => c.status === 'ok').length;
  console.error(`\nWrote ${JSON_PATH} and ${MD_PATH} — ${ok}/${cases.length} ok`);
}

function minimalFailed(id: string, message: string): CaseReport {
  return {
    id,
    company_url: '',
    role: null,
    requested_days: 0,
    status: 'failed',
    timing: { started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 0 },
    stages: [],
    extraction: null,
    retrieval: null,
    interview_research: null,
    interview_research_diagnostics: null,
    company_brief: null,
    initial_generation: null,
    coverage: null,
    schedule: null,
    checks: null,
    requirement_question_trace: null,
    llm: { model: '', call_count: 0, total_duration_ms: 0, calls: [] },
    final_kit: null,
    error: { code: 'INVALID_CASE', message },
  };
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
