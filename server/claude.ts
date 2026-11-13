import Anthropic from '@anthropic-ai/sdk';
import type { JobMatchAnalysis, NormalizedJob, ParsedResume } from '../src/types/ats';
import { MATCH_SYSTEM_INSTRUCTION, RESUME_SYSTEM_INSTRUCTION, buildMatchPayload } from './prompts';

const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

function getClaudeClient(overrideKey?: string): Anthropic {
  const apiKey = overrideKey?.trim() || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'MY_ANTHROPIC_API_KEY') {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add a Claude key in AI Settings or set it in .env.');
  }
  return new Anthropic({ apiKey });
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
}

const stringArray = { type: 'array', items: { type: 'string' } } as const;

const RESUME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidateName: { type: 'string', description: 'Full name of the candidate or "Candidate" if omitted' },
    headline: { type: 'string', description: 'Concise professional headline (e.g., Senior Full-Stack Engineer)' },
    yearsExperience: { type: 'number', description: 'Estimated total years of relevant professional experience' },
    location: { type: 'string', description: 'City/region or Remote if stated, else Unspecified' },
    targetRoles: { ...stringArray, description: '3 to 5 suitable job titles based on experience' },
    coreSkills: { ...stringArray, description: 'Primary engineering/product/domain competencies and languages' },
    toolsAndFrameworks: { ...stringArray, description: 'Specific frameworks, cloud services, databases, and tooling' },
    domains: { ...stringArray, description: 'Industry or technical domains (e.g., Fintech, Distributed Systems)' },
    education: { type: 'string', description: 'Highest degree or notable credential, or empty string' },
    summary: { type: 'string', description: 'Crisp 2-sentence candidate profile summary' },
    rawText: { type: 'string', description: 'Clean plain-text representation of the resume' },
  },
  required: [
    'candidateName',
    'headline',
    'yearsExperience',
    'location',
    'targetRoles',
    'coreSkills',
    'toolsAndFrameworks',
    'domains',
    'education',
    'summary',
    'rawText',
  ],
};

const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jobId: { type: 'string' },
          confidenceScore: { type: 'integer' },
          confidenceTier: { type: 'string', enum: ['Strong Fit', 'Good Fit', 'Partial Fit', 'Stretch'] },
          rationale: { type: 'string' },
          matchedSkills: stringArray,
          missingGaps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                skill: { type: 'string' },
                severity: { type: 'string', enum: ['critical', 'moderate', 'minor'] },
                reason: { type: 'string' },
                bridgeTip: { type: 'string' },
              },
              required: ['skill', 'severity', 'reason', 'bridgeTip'],
            },
          },
          strengthHighlights: stringArray,
        },
        required: [
          'jobId',
          'confidenceScore',
          'confidenceTier',
          'rationale',
          'matchedSkills',
          'missingGaps',
          'strengthHighlights',
        ],
      },
    },
  },
  required: ['matches'],
};

function formatClaudeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid ANTHROPIC_API_KEY.';
  if (err instanceof Anthropic.RateLimitError) return 'Claude rate limit reached. Try again shortly.';
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}

async function callClaudeJson<T>(params: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  schema: Record<string, unknown>;
  apiKey?: string;
}): Promise<T> {
  const client = getClaudeClient(params.apiKey);
  try {
    const stream = client.beta.messages.stream({
      model: getModel(),
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: params.schema } },
      system: params.system,
      messages: [{ role: 'user', content: params.content }],
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === 'refusal') {
      throw new Error(`Claude declined the request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : '.'}`);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Claude response was cut off (max_tokens). Try fewer jobs per request.');
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(formatClaudeError(err));
  }
}

export async function parseResumeWithClaude(input: {
  resumeText?: string;
  fileBase64?: string;
  mimeType?: string;
}, apiKey?: string): Promise<ParsedResume> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];

  if (input.fileBase64 && input.mimeType === 'application/pdf') {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: input.fileBase64 },
    });
  } else if (input.fileBase64) {
    // Plain-text uploads (txt/md): decode and send as text
    content.push({ type: 'text', text: `Resume document:\n\n${Buffer.from(input.fileBase64, 'base64').toString('utf8')}` });
  }

  content.push({
    type: 'text',
    text: input.resumeText?.trim()
      ? `Resume content:\n\n${input.resumeText.trim()}`
      : 'Parse the attached resume document into the requested JSON structure.',
  });

  const parsed = await callClaudeJson<Omit<ParsedResume, 'parsedAt'>>({
    system: RESUME_SYSTEM_INSTRUCTION,
    content,
    schema: RESUME_SCHEMA,
    apiKey,
  });

  return {
    ...parsed,
    rawText: input.resumeText?.trim() || parsed.rawText || '',
    parsedAt: new Date().toISOString(),
  };
}

export async function matchJobsWithClaude(resume: ParsedResume, jobs: NormalizedJob[], apiKey?: string): Promise<JobMatchAnalysis[]> {
  if (jobs.length === 0) return [];

  const payload = await callClaudeJson<{ matches?: Array<Omit<JobMatchAnalysis, 'analyzedAt'>> }>({
    system: MATCH_SYSTEM_INSTRUCTION,
    content: JSON.stringify(buildMatchPayload(resume, jobs)),
    schema: MATCH_SCHEMA,
    apiKey,
  });

  const now = new Date().toISOString();
  return (payload.matches ?? []).map((m) => ({
    ...m,
    confidenceScore: Math.max(0, Math.min(100, Math.round(m.confidenceScore))),
    analyzedAt: now,
  }));
}
