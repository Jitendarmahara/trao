import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { createLlmClient, runPipeline, StaticSearchProvider } from '@interview-prep-kit/core';

/**
 * Proof that DISCOVERED interview findings change the generated question mix.
 *
 * The JD is technical-only (no behavioural requirements), so the `behavioural`
 * and `system-design` categories can ONLY come from interview research. We run the
 * exact production runPipeline() twice — identical JD + company — differing only in
 * whether interview research is available.
 *
 * The "with" run pins one REAL, publicly discoverable interview-discussion page and
 * fetches it LIVE (nothing fabricated); the "without" run has no search provider.
 * (Live search DISCOVERY is exercised in `npm run evaluate:real`; here we pin a
 * real URL so the causal A/B is reproducible rather than at the mercy of a flaky
 * shared-IP search environment.)
 */
const JD = `Backend Engineer
Requirements:
- 4+ years backend engineering
- Strong Node.js and TypeScript
- Strong PostgreSQL experience
- Experience designing distributed systems
- Experience building REST APIs`;

const REAL_URL = 'https://www.tryexponent.com/blog/system-design-interview-guide';

async function runOnce(
  llm: ReturnType<typeof createLlmClient>,
  label: string,
  provider: StaticSearchProvider | undefined,
): Promise<Record<string, unknown>> {
  let interview: unknown;
  const { kit } = await runPipeline(
    { jd: JD, companyUrl: 'https://example.com', companyName: 'Example', days: 5 },
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
    note: 'Same technical-only JD + company; only difference is discovered interview research (a real page fetched live). Categories present only WITH research prove the findings change the question mix.',
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
