import {
  createDefaultSearchProvider,
  createLlmClient,
  runPipeline,
  type PipelineResult,
  type PipelineStage,
} from '@interview-prep-kit/core';

export interface GenerateInput {
  jd: string;
  companyUrl: string;
  companyName?: string;
  days: number;
}

/** Injectable so the API and its tests share one interface; tests pass a stub. */
export interface PipelineRunner {
  run(input: GenerateInput, onProgress: (stage: PipelineStage) => void): Promise<PipelineResult>;
}

/** Production runner: the real pipeline with the env-configured LLM + search stack. */
export function createProductionRunner(): PipelineRunner {
  const llm = createLlmClient();
  const searchProvider = createDefaultSearchProvider();
  return {
    run: (input, onProgress) => runPipeline(input, { llm, searchProvider, onProgress }),
  };
}
