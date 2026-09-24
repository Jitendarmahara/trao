import 'dotenv/config';
import { createRepositories } from './db/index.js';
import { buildApp } from './http/app.js';
import { createProductionRunner } from './pipeline-runner.js';
import { createProductionSectionGenerator } from './section-generator.js';

/** API server entry point. Wires env-configured persistence + pipeline runner. */
async function main(): Promise<void> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error('SESSION_SECRET is required (see .env.example).');

  const repositories = await createRepositories();
  const runner = createProductionRunner();
  const sectionGenerator = createProductionSectionGenerator();
  const app = buildApp({
    repositories,
    runner,
    sectionGenerator,
    sessionSecret,
    secureCookies: process.env.NODE_ENV === 'production',
  });

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`Interview Prep Kit API listening on :${port}`);
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
