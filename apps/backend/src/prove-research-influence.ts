import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { createLlmClient, runPipeline, StaticSearchProvider } from '@interview-prep-kit/core';

/**
 * CAUSAL PIPELINE TEST (not a test of live discovery).
 *
 * Proves that interview-research findings, once present, change the generated
 * question mix. The JD is technical-only (no behavioural requirements), so the
 * `behavioural` / `system-design` categories can ONLY come from interview
 * research. We run the exact production runPipeline() twice — identical JD +
 * company — differing ONLY in whether interview research is available.
 *
 * The "with" run pins ONE real, company-specific interview write-up and fetches it
 * LIVE; it passes the same company-specific evidence gate the real pipeline uses
 * (nothing fabricated). This isolates the causal variable; it does NOT claim the
 * page was found by live search. Live DISCOVERY is exercised by `npm run
 * evaluate:real`, whose honest result in this runtime is that discussion hosts are
 * mostly blocked.
 */
const JD = `Backend Engineer
Requirements:
- 4+ years backend engineering
- Strong Node.js and TypeScript
- Strong PostgreSQL experience
- Experience designing distributed systems
- Experience building REST APIs`;

// A real, fetchable, COMPANY-SPECIFIC interview write-up (mentions Spotify + a
// behavioural interview signal) — passes the same evidence gate as production.
const COMPANY = 'Spotify';
const REAL_URL = 'https://blog.rampatra.com/spotify-interview-backend-engineer-ii';

async function runOnce(
  llm: ReturnType<typeof createLlmClient>,
  label: string,
  provider: StaticSearchProvider | undefined,
): Promise<Record<string, unknown>> {
  let interview: unknown;
  const { kit } = await runPipeline(
    { jd: JD, companyUrl: 'https://example.com', companyName: COMPANY, days: 5 },
    {
      llm,
      searchProvider: provider,
      onArtifact: (a) => {
        if (a.type === 'interview-research') interview = a.research;
      },
    },
  );
  const categories = [...new Set(kit.questions.map((q) => q.category))];
  return {
    label,
    interview_research: interview,
    categories,
    behavioural_questions: kit.questions.filter((q) => q.category === 'behavioural').length,
    system_design_questions: kit.questions.filter((q) => q.category === 'system-design').length,
  };
}

async function main(): Promise<void> {
  const llm = createLlmClient();
  const withResearch = await runOnce(
    llm,
    'with_interview_research',
    new StaticSearchProvider([{ url: REAL_URL, title: 'System design interview guide' }]),
  );
  const withoutResearch = await runOnce(llm, 'without_interview_research', undefined);

  const out = {
    note: 'CAUSAL PIPELINE TEST (not live discovery). Same technical-only JD + company; the only difference is whether interview research is present. The pinned source is a real, company-specific interview write-up fetched live that passes the production evidence gate. Categories present only WITH research show the findings change the question mix.',
    real_source: REAL_URL,
    with_research: withResearch,
    without_research: withoutResearch,
  };
  await mkdir('evaluation-results', { recursive: true });
  await writeFile('evaluation-results/research-influence-proof.json', `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.error('WITH   :', JSON.stringify(withResearch.categories));
  console.error('WITHOUT:', JSON.stringify(withoutResearch.categories));
  console.error('Wrote evaluation-results/research-influence-proof.json');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
