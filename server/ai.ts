import type { JobMatchAnalysis, NormalizedJob, ParsedResume } from '../src/types/ats';
import { matchJobsWithClaude, parseResumeWithClaude } from './claude';
import { matchJobsWithGemini, parseResumeWithGemini } from './gemini';

export type AiProvider = 'claude' | 'gemini';

/** Key supplied from the UI for a single request; never persisted server-side. */
export interface AiOverride {
  provider?: AiProvider;
  apiKey?: string;
}

function isSet(value: string | undefined, placeholder: string): boolean {
  return Boolean(value && value.trim() && value !== placeholder);
}

export function hasClaudeKey(): boolean {
  return isSet(process.env.ANTHROPIC_API_KEY, 'MY_ANTHROPIC_API_KEY');
}

export function hasGeminiKey(): boolean {
  return isSet(process.env.GEMINI_API_KEY, 'MY_GEMINI_API_KEY');
}

export function parseAiProvider(value: unknown): AiProvider | undefined {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return v === 'claude' || v === 'gemini' ? v : undefined;
}

/**
 * Priority: a UI-supplied key (with its provider) > AI_PROVIDER env >
 * Claude when ANTHROPIC_API_KEY is set > Gemini.
 */
export function getAiProvider(override?: AiOverride): AiProvider {
  if (override?.apiKey && override.provider) return override.provider;
  const forced = parseAiProvider(process.env.AI_PROVIDER);
  if (forced) return forced;
  if (hasClaudeKey()) return 'claude';
  return 'gemini';
}

export function parseResume(
  input: { resumeText?: string; fileBase64?: string; mimeType?: string },
  override?: AiOverride
): Promise<ParsedResume> {
  const key = override?.apiKey || undefined;
  return getAiProvider(override) === 'claude' ? parseResumeWithClaude(input, key) : parseResumeWithGemini(input, key);
}

export function matchJobs(resume: ParsedResume, jobs: NormalizedJob[], override?: AiOverride): Promise<JobMatchAnalysis[]> {
  const key = override?.apiKey || undefined;
  return getAiProvider(override) === 'claude'
    ? matchJobsWithClaude(resume, jobs, key)
    : matchJobsWithGemini(resume, jobs, key);
}
