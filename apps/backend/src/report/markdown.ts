import type { CaseReport, RealCompanyReport } from './types.js';

function countByCategory(questions: { category: string }[]): string {
  const counts = new Map<string, number>();
  for (const q of questions) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  const parts = [...counts.entries()].map(([c, n]) => `${c}: ${n}`);
  return parts.length ? parts.join(', ') : '(none)';
}

function renderCase(c: CaseReport): string {
  const lines: string[] = [];
  lines.push(`# ${c.role ?? 'Role'} — ${c.company_url}`);
  lines.push('');
  lines.push('## Status');
  lines.push('');
  lines.push(c.status === 'ok' ? 'OK' : `FAILED — ${c.error?.code}: ${c.error?.message}`);
  lines.push('');

  lines.push('## Timing');
  lines.push('');
  lines.push(`- Total: ${c.timing.duration_ms} ms`);
  lines.push(`- LLM calls: ${c.llm.call_count} (${c.llm.total_duration_ms} ms, model ${c.llm.model})`);
  lines.push(`- Stages: ${c.stages.map((s) => `${s.stage}${s.duration_ms != null ? `(${s.duration_ms}ms)` : ''}`).join(' → ')}`);
  lines.push('');

  lines.push('## Requirements');
  lines.push('');
  if (c.extraction && c.extraction.requirements.length > 0) {
    lines.push('| ID | Priority | Kind | Requirement |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of c.extraction.requirements) {
      lines.push(`| ${r.id} | ${r.priority} | ${r.kind} | ${r.text.replace(/\|/g, '\\|')} |`);
    }
  } else {
    lines.push('_No requirements extracted._');
  }
  lines.push('');

  lines.push('## Retrieval');
  lines.push('');
  if (c.retrieval) {
    lines.push(`- Pages used: ${c.retrieval.pages_used.length}`);
    lines.push(`- Hiring pages: ${c.retrieval.hiring_pages.map((p) => p.url).join(', ') || '(none)'}`);
    lines.push(`- Skipped: ${c.retrieval.skipped.map((s) => `${s.url} (${s.reason})`).join('; ') || '(none)'}`);
  } else {
    lines.push('_No retrieval evidence._');
  }
  lines.push('');

  lines.push('## Interview research');
  lines.push('');
  if (c.interview_research) {
    const iv = c.interview_research;
    lines.push(`- Found: ${iv.found}`);
    lines.push(`- Signals: take-home=${iv.hasTakeHome}, system-design=${iv.hasSystemDesign}, behavioural=${iv.behaviouralEmphasis}`);
    lines.push(`- Summary: ${iv.summary}`);
    lines.push(`- Sources: ${iv.sources.join(', ') || '(none)'}`);
  } else {
    lines.push('_No interview research._');
  }
  if (c.interview_research_diagnostics) {
    const d = c.interview_research_diagnostics;
    lines.push('');
    lines.push('_Diagnostics:_');
    lines.push(`- Queries: ${d.queries_attempted.map((q) => `"${q}"`).join(', ')}`);
    lines.push(`- Returned URLs (${d.search_results_returned}): ${d.returned_urls.join(', ') || '(none)'}`);
    lines.push(`- Fetched URLs: ${d.fetched_urls.join(', ') || '(none)'}`);
    lines.push(`- Evidence sources (company-specific interview evidence): ${d.evidence_sources.join(', ') || '(none)'}`);
    lines.push(`- Rejected: ${d.rejected_sources.map((r) => `${r.url} (${r.reason})`).join('; ') || '(none)'}`);
    lines.push(`- Evidence decision → found: ${d.final_found} (usable sources: ${d.usable_search_results})`);
    lines.push(`- Detected signals: take-home=${d.signals_detected.hasTakeHome}, system-design=${d.signals_detected.hasSystemDesign}, behavioural=${d.signals_detected.behaviouralEmphasis}`);
    lines.push(`- Search error: ${d.search_error ?? '(none)'}`);
  }
  lines.push('');

  lines.push('## Initial question generation');
  lines.push('');
  lines.push(
    c.initial_generation
      ? `- ${c.initial_generation.initial_questions.length} questions (${countByCategory(c.initial_generation.initial_questions)})`
      : '_No initial generation captured._',
  );
  lines.push('');

  lines.push('## Coverage');
  lines.push('');
  if (c.coverage) {
    if (c.coverage.passes_detail.length === 0) {
      lines.push('- Pass 1: all must-haves covered on the first draft.');
    }
    for (const p of c.coverage.passes_detail) {
      lines.push(
        `- Pass ${p.pass}: missing before [${p.missingBefore.join(', ')}] → generated ${p.generated.length} → missing after [${p.missingAfter.join(', ')}]`,
      );
    }
    lines.push(`- Final passes: ${c.coverage.passes}`);
    lines.push(`- Uncovered must-haves: [${c.coverage.uncovered_requirement_ids.join(', ')}]`);
  } else {
    lines.push('_No coverage evidence._');
  }
  lines.push('');

  lines.push('## Requirement → Question coverage');
  lines.push('');
  if (c.requirement_question_trace) {
    lines.push('| Requirement | Priority | Questions |');
    lines.push('| --- | --- | --- |');
    for (const t of c.requirement_question_trace) {
      lines.push(`| ${t.requirement_id}: ${t.requirement_text.replace(/\|/g, '\\|')} | ${t.priority} | ${t.question_ids.join(', ') || '—'} |`);
    }
  } else {
    lines.push('_No trace (no kit produced)._');
  }
  lines.push('');

  lines.push('## Schedule');
  lines.push('');
  if (c.schedule) {
    lines.push('| Day | Focus | Questions | Minutes |');
    lines.push('| --- | --- | --- | --- |');
    for (const d of c.schedule) {
      lines.push(`| ${d.day} | ${d.focus} | ${d.question_ids.length} | ${d.minutes} |`);
    }
  } else {
    lines.push('_No schedule (no kit produced)._');
  }
  lines.push('');

  lines.push('## Final checks');
  lines.push('');
  if (c.checks) {
    const k = c.checks;
    lines.push(`- Structure valid: ${k.structure_valid}`);
    lines.push(`- All must-haves covered: ${k.all_must_haves_covered} (uncovered: [${k.uncovered_must_requirements.join(', ')}])`);
    lines.push(`- Requirements: ${k.requirement_count} (must ${k.must_requirement_count}, nice ${k.nice_requirement_count})`);
    lines.push(`- Questions: ${k.question_count} · Flashcards: ${k.flashcard_count}`);
    lines.push(`- Schedule: ${k.schedule_day_count} days, ${k.schedule_question_count} question slots`);
    lines.push(`- Duplicate question ids: [${k.duplicate_question_ids.join(', ')}]`);
    lines.push(`- Duplicate requirement ids: [${k.duplicate_requirement_ids.join(', ')}]`);
    lines.push(`- Invalid requirement references: [${k.invalid_requirement_references.join(', ')}]`);
    lines.push(`- Invalid question references (schedule): [${k.invalid_question_references.join(', ')}]`);
    lines.push(`- Questions with no requirement link: [${k.questions_missing_requirement_links.join(', ')}]`);
    lines.push(`- Schedule missing question ids: [${k.schedule_missing_question_ids.join(', ')}]`);
    lines.push(`- Schedule duplicate question ids: [${k.schedule_duplicate_question_ids.join(', ')}]`);
  } else {
    lines.push('_No checks (no kit produced)._');
  }
  lines.push('');

  return lines.join('\n');
}

/** Render the full human-readable summary. All content is factual, from the run. */
export function renderMarkdown(report: RealCompanyReport): string {
  const header = [
    '# Real Company Evaluation Summary',
    '',
    `Generated: ${report.generated_at}`,
    `Report version: ${report.report_version}`,
    `Cases: ${report.cases.length} (${report.cases.filter((c) => c.status === 'ok').length} ok, ${report.cases.filter((c) => c.status === 'failed').length} failed)`,
    '',
    '---',
    '',
  ].join('\n');
  return header + report.cases.map(renderCase).join('\n---\n\n') + '\n';
}
