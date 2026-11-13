export type AtsProvider = 'greenhouse' | 'lever' | 'ashby';

export interface AtsSource {
  id: string;
  provider: AtsProvider;
  slug: string;
  label: string;
  enabled: boolean;
  lastPolledAt?: string;
  lastJobCount?: number;
  status?: 'idle' | 'ok' | 'error';
  errorMessage?: string;
}

export interface NormalizedJob {
  id: string;
  externalId: string;
  sourceId: string;
  provider: AtsProvider;
  company: string;
  companySlug: string;
  title: string;
  department: string;
  location: string;
  workplaceType: 'Remote' | 'Hybrid' | 'On-site' | 'Unspecified';
  employmentType: string;
  applyUrl: string;
  updatedAt: string;
  firstSeenAt: string;
  isNew: boolean;
  descriptionText: string;
  descriptionSnippet: string;
}

export interface ParsedResume {
  candidateName: string;
  headline: string;
  yearsExperience: number;
  location: string;
  targetRoles: string[];
  coreSkills: string[];
  toolsAndFrameworks: string[];
  domains: string[];
  education: string;
  summary: string;
  rawText: string;
  parsedAt: string;
}

export type GapSeverity = 'critical' | 'moderate' | 'minor';

export interface SkillGap {
  skill: string;
  severity: GapSeverity;
  reason: string;
  bridgeTip: string;
}

export type ConfidenceTier = 'Strong Fit' | 'Good Fit' | 'Partial Fit' | 'Stretch';

export interface JobMatchAnalysis {
  jobId: string;
  confidenceScore: number;
  confidenceTier: ConfidenceTier;
  rationale: string;
  matchedSkills: string[];
  missingGaps: SkillGap[];
  strengthHighlights: string[];
  analyzedAt: string;
}

export interface PollResponse {
  jobs: NormalizedJob[];
  sources: AtsSource[];
  polledAt: string;
  newCount: number;
  totalCount: number;
}
