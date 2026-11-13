import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { JobMatchAnalysis, NormalizedJob, ParsedResume } from '../src/types/ats';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Add it in Settings > Secrets to enable AI matching.');
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
}): Promise<ParsedResume> {
  const ai = getAiClient();

  const instruction = `You are a precise technical recruiter and resume parser.
Extract structured candidate information from the provided resume.
Be factual and grounded strictly in the resume content. Do not invent skills or years of experience that are not supported by the text.
If extracting from an attached PDF/document, also reconstruct a clean plain-text summary in rawText.`;

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
  jobs: NormalizedJob[]
): Promise<JobMatchAnalysis[]> {
  if (jobs.length === 0) return [];
  const ai = getAiClient();

  const candidateProfile = {
    headline: resume.headline,
    yearsExperience: resume.yearsExperience,
    location: resume.location,
    coreSkills: resume.coreSkills,
    toolsAndFrameworks: resume.toolsAndFrameworks,
    domains: resume.domains,
    summary: resume.summary,
    rawExcerpt: resume.rawText.slice(0, 3500),
  };

  const compactJobs = jobs.map((job) => ({
    jobId: job.id,
    company: job.company,
    title: job.title,
    department: job.department,
    location: job.location,
    workplaceType: job.workplaceType,
    description: job.descriptionText.slice(0, 2600),
  }));

  const systemInstruction = `You are a rigorous, honest hiring calibration engine comparing a candidate resume against live job postings.
For each job, assign a realistic confidenceScore from 0 to 100:
- 82-100 ("Strong Fit"): Meets core role level, primary tech stack/domain, and most explicit requirements.
- 65-81 ("Good Fit"): Strong overlap on core skills with minor tooling or domain gaps.
- 45-64 ("Partial Fit"): Meaningful transferable skills, but missing several explicit requirements or seniority match.
- 0-44 ("Stretch"): Significant domain, stack, or seniority mismatch.

Be specific and cite actual technologies/requirements from the job description.
For missingGaps, list concrete missing skills, certifications, domain experience, or seniority gaps with actionable bridgeTips. Keep matchedSkills concise (up to 8 items) and missingGaps focused on the top 2-5 real gaps.`;

  const response = await withRetry((model) =>
    ai.models.generateContent({
      model,
      contents: JSON.stringify({
        candidate: candidateProfile,
        jobs: compactJobs,
      }),
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
