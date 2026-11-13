import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { JobMatchAnalysis, NormalizedJob, ParsedResume } from '../src/types/ats';
import { MATCH_SYSTEM_INSTRUCTION, RESUME_SYSTEM_INSTRUCTION, buildMatchPayload } from './prompts';

function getAiClient(overrideKey?: string): GoogleGenAI {
  const apiKey = overrideKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Add a Gemini key in AI Settings or set it in .env.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number } };
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Not a JSON string
  }
  return raw;
}

async function withRetry<T>(fn: (model: string) => Promise<T>): Promise<T> {
  const models = ['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let lastError: unknown;

  for (let attempt = 0; attempt < models.length; attempt++) {
    try {
      return await fn(models[attempt]);
    } catch (err) {
      lastError = err;
      const msg = formatGeminiError(err).toLowerCase();
      const isTransient =
        msg.includes('503') ||
        msg.includes('unavailable') ||
        msg.includes('high demand') ||
        msg.includes('429') ||
        msg.includes('resource_exhausted');

      if (!isTransient || attempt === models.length - 1) {
        throw new Error(formatGeminiError(err));
      }

      const delayMs = 900 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(formatGeminiError(lastError));
}

export async function parseResumeWithGemini(input: {
  resumeText?: string;
  fileBase64?: string;
  mimeType?: string;
}, apiKey?: string): Promise<ParsedResume> {
  const ai = getAiClient(apiKey);

  const instruction = RESUME_SYSTEM_INSTRUCTION;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (input.fileBase64 && input.mimeType) {
    parts.push({
      inlineData: {
        mimeType: input.mimeType,
        data: input.fileBase64,
      },
    });
  }

  if (input.resumeText?.trim()) {
    parts.push({
      text: `Resume content:\n\n${input.resumeText.trim()}`,
    });
  } else {
    parts.push({
      text: 'Parse the attached resume document into the requested JSON structure.',
    });
  }

  const response = await withRetry((model) =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction: instruction,
        thinkingConfig: {
          thinkingLevel: model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateName: { type: Type.STRING, description: 'Full name of the candidate or "Candidate" if omitted' },
            headline: { type: Type.STRING, description: 'Concise professional headline (e.g., Senior Full-Stack Engineer)' },
            yearsExperience: { type: Type.NUMBER, description: 'Estimated total years of relevant professional experience' },
            location: { type: Type.STRING, description: 'City/region or Remote if stated, else Unspecified' },
            targetRoles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 to 5 suitable job titles based on experience',
            },
            coreSkills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Primary engineering/product/domain competencies and languages',
            },
            toolsAndFrameworks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Specific frameworks, cloud services, databases, and tooling',
            },
            domains: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Industry or technical domains (e.g., Fintech, Distributed Systems, ML Infrastructure)',
            },
            education: { type: Type.STRING, description: 'Highest degree or notable credential, or empty string' },
            summary: { type: Type.STRING, description: 'Crisp 2-sentence candidate profile summary' },
            rawText: { type: Type.STRING, description: 'Clean plain-text representation of the resume' },
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
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Omit<ParsedResume, 'parsedAt'>;

  return {
    ...parsed,
    rawText: input.resumeText?.trim() || parsed.rawText || '',
    parsedAt: new Date().toISOString(),
  };
}

export async function matchJobsWithGemini(
  resume: ParsedResume,
  jobs: NormalizedJob[],
  apiKey?: string
): Promise<JobMatchAnalysis[]> {
  if (jobs.length === 0) return [];
  const ai = getAiClient(apiKey);

  const systemInstruction = MATCH_SYSTEM_INSTRUCTION;

  const response = await withRetry((model) =>
    ai.models.generateContent({
      model,
      contents: JSON.stringify(buildMatchPayload(resume, jobs)),
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matches: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  jobId: { type: Type.STRING },
                  confidenceScore: { type: Type.INTEGER },
                  confidenceTier: {
                    type: Type.STRING,
                    description: 'One of: Strong Fit, Good Fit, Partial Fit, Stretch',
                  },
                  rationale: { type: Type.STRING },
                  matchedSkills: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  missingGaps: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        skill: { type: Type.STRING },
                        severity: {
                          type: Type.STRING,
                          description: 'One of: critical, moderate, minor',
                        },
                        reason: { type: Type.STRING },
                        bridgeTip: { type: Type.STRING },
                      },
                      required: ['skill', 'severity', 'reason', 'bridgeTip'],
                    },
                  },
                  strengthHighlights: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
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
        },
      },
    })
  );

  const payload = JSON.parse((response.text ?? '{"matches":[]}').trim()) as {
    matches?: Array<Omit<JobMatchAnalysis, 'analyzedAt'>>;
  };

  const now = new Date().toISOString();
  return (payload.matches ?? []).map((m) => ({
    ...m,
    confidenceScore: Math.max(0, Math.min(100, Math.round(m.confidenceScore))),
    analyzedAt: now,
  }));
}
