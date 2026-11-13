import type { AtsProvider, AtsSource, NormalizedJob } from '../src/types/ats';

export const DEFAULT_ATS_SOURCES: AtsSource[] = [
  { id: 'gh-stripe', provider: 'greenhouse', slug: 'stripe', label: 'Stripe', enabled: true },
  { id: 'gh-figma', provider: 'greenhouse', slug: 'figma', label: 'Figma', enabled: true },
  { id: 'gh-anthropic', provider: 'greenhouse', slug: 'anthropic', label: 'Anthropic', enabled: true },
  { id: 'gh-vercel', provider: 'greenhouse', slug: 'vercel', label: 'Vercel', enabled: true },
  { id: 'gh-databricks', provider: 'greenhouse', slug: 'databricks', label: 'Databricks', enabled: true },
  { id: 'ab-ramp', provider: 'ashby', slug: 'ramp', label: 'Ramp', enabled: true },
  { id: 'ab-linear', provider: 'ashby', slug: 'linear', label: 'Linear', enabled: true },
  { id: 'lv-spotify', provider: 'lever', slug: 'spotify', label: 'Spotify', enabled: true },
];

const seenJobTimestamps = new Map<string, string>();
let hasCompletedInitialPoll = false;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function htmlToPlainText(rawHtml: string): string {
  if (!rawHtml) return '';
  const decoded = decodeHtmlEntities(rawHtml);
  return decoded
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferWorkplaceType(
  location: string,
  explicitType?: string,
  isRemoteFlag?: boolean
): NormalizedJob['workplaceType'] {
  const combined = `${explicitType ?? ''} ${location}`.toLowerCase();
  if (isRemoteFlag || combined.includes('remote')) return 'Remote';
  if (combined.includes('hybrid')) return 'Hybrid';
  if (combined.includes('on-site') || combined.includes('onsite') || combined.includes('in-office')) {
    return 'On-site';
  }
  return location && location !== 'Unspecified' ? 'On-site' : 'Unspecified';
}

function makeSnippet(text: string, maxLength = 210): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

function computeIsNew(jobId: string, updatedAtIso: string, pollNowIso: string): { firstSeenAt: string; isNew: boolean } {
  const existing = seenJobTimestamps.get(jobId);
  if (existing) {
    // Still mark as new if discovered within the last 10 minutes
    const ageMs = Date.now() - new Date(existing).getTime();
    return {
      firstSeenAt: existing,
      isNew: hasCompletedInitialPoll && ageMs < 10 * 60 * 1000,
    };
  }

  seenJobTimestamps.set(jobId, pollNowIso);

  if (!hasCompletedInitialPoll) {
    // On initial load, highlight roles updated in the last 72 hours as fresh
    const updatedMs = new Date(updatedAtIso).getTime();
    const isFresh = Number.isFinite(updatedMs) && Date.now() - updatedMs < 72 * 60 * 60 * 1000;
    return { firstSeenAt: pollNowIso, isNew: isFresh };
  }

  // Discovered during an active subsequent poll
  return { firstSeenAt: pollNowIso, isNew: true };
}

async function fetchGreenhouse(source: AtsSource, pollNowIso: string): Promise<NormalizedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.slug)}/jobs?content=true`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Greenhouse responded ${res.status}`);
  }

  const data = (await res.json()) as {
    jobs?: Array<{
      id: number | string;
      title?: string;
      updated_at?: string;
      absolute_url?: string;
      location?: { name?: string };
      departments?: Array<{ name?: string }>;
      content?: string;
    }>;
  };

  const jobs = data.jobs ?? [];
  return jobs.map((job) => {
    const id = `greenhouse:${source.slug}:${job.id}`;
    const location = job.location?.name?.trim() || 'Unspecified';
    const department = job.departments?.[0]?.name?.trim() || 'General';
    const updatedAt = job.updated_at || pollNowIso;
    const descriptionText = htmlToPlainText(job.content || '');
    const { firstSeenAt, isNew } = computeIsNew(id, updatedAt, pollNowIso);

    return {
      id,
      externalId: String(job.id),
      sourceId: source.id,
      provider: 'greenhouse',
      company: source.label,
      companySlug: source.slug,
      title: job.title?.trim() || 'Untitled Role',
      department,
      location,
      workplaceType: inferWorkplaceType(location),
      employmentType: 'Full-time',
      applyUrl: job.absolute_url || `https://boards.greenhouse.io/${source.slug}/jobs/${job.id}`,
      updatedAt,
      firstSeenAt,
      isNew,
      descriptionText,
      descriptionSnippet: makeSnippet(descriptionText),
    };
  });
}

async function fetchLever(source: AtsSource, pollNowIso: string): Promise<NormalizedJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(source.slug)}?mode=json`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Lever responded ${res.status}`);
  }

  const postings = (await res.json()) as Array<{
    id: string;
    text?: string;
    createdAt?: number;
    hostedUrl?: string;
    applyUrl?: string;
    workplaceType?: string;
    categories?: {
      location?: string;
      department?: string;
      team?: string;
      commitment?: string;
    };
    descriptionPlain?: string;
    description?: string;
    lists?: Array<{ text?: string; content?: string }>;
    additionalPlain?: string;
  }>;

  if (!Array.isArray(postings)) {
    throw new Error('Unexpected Lever response format');
  }

  return postings.map((post) => {
    const id = `lever:${source.slug}:${post.id}`;
    const location = post.categories?.location?.trim() || 'Unspecified';
    const department = post.categories?.department?.trim() || post.categories?.team?.trim() || 'General';
    const updatedAt = post.createdAt ? new Date(post.createdAt).toISOString() : pollNowIso;

    const listBlocks = (post.lists ?? [])
      .map((l) => `${l.text ? `${l.text}\n` : ''}${htmlToPlainText(l.content || '')}`)
      .join('\n\n');

    const baseText = post.descriptionPlain?.trim() || htmlToPlainText(post.description || '');
    const descriptionText = [baseText, listBlocks, post.additionalPlain?.trim()]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const { firstSeenAt, isNew } = computeIsNew(id, updatedAt, pollNowIso);

    return {
      id,
      externalId: post.id,
      sourceId: source.id,
      provider: 'lever',
      company: source.label,
      companySlug: source.slug,
      title: post.text?.trim() || 'Untitled Role',
      department,
      location,
      workplaceType: inferWorkplaceType(location, post.workplaceType),
      employmentType: post.categories?.commitment?.trim() || 'Full-time',
      applyUrl: post.hostedUrl || post.applyUrl || `https://jobs.lever.co/${source.slug}/${post.id}`,
      updatedAt,
      firstSeenAt,
      isNew,
      descriptionText,
      descriptionSnippet: makeSnippet(descriptionText),
    };
  });
}

async function fetchAshby(source: AtsSource, pollNowIso: string): Promise<NormalizedJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.slug)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Ashby responded ${res.status}`);
  }

  const data = (await res.json()) as {
    jobs?: Array<{
      id: string;
      title?: string;
      department?: string;
      team?: string;
      location?: string;
      isRemote?: boolean;
      workplaceType?: string;
      employmentType?: string;
      publishedAt?: string;
      jobUrl?: string;
      applyUrl?: string;
      descriptionPlain?: string;
      descriptionHtml?: string;
    }>;
  };

  const jobs = data.jobs ?? [];
  return jobs.map((job) => {
    const id = `ashby:${source.slug}:${job.id}`;
    const location = job.location?.trim() || (job.isRemote ? 'Remote' : 'Unspecified');
    const department = job.department?.trim() || job.team?.trim() || 'General';
    const updatedAt = job.publishedAt || pollNowIso;
    const descriptionText = job.descriptionPlain?.trim() || htmlToPlainText(job.descriptionHtml || '');
    const { firstSeenAt, isNew } = computeIsNew(id, updatedAt, pollNowIso);

    return {
      id,
      externalId: job.id,
      sourceId: source.id,
      provider: 'ashby',
      company: source.label,
      companySlug: source.slug,
      title: job.title?.trim() || 'Untitled Role',
      department,
      location,
      workplaceType: inferWorkplaceType(location, job.workplaceType, job.isRemote),
      employmentType: job.employmentType?.trim() || 'Full-time',
      applyUrl: job.jobUrl || job.applyUrl || `https://jobs.ashbyhq.com/${source.slug}/${job.id}`,
      updatedAt,
      firstSeenAt,
      isNew,
      descriptionText,
      descriptionSnippet: makeSnippet(descriptionText),
    };
  });
}

async function fetchSource(source: AtsSource, pollNowIso: string): Promise<NormalizedJob[]> {
  const provider: AtsProvider = source.provider;
  if (provider === 'greenhouse') return fetchGreenhouse(source, pollNowIso);
  if (provider === 'lever') return fetchLever(source, pollNowIso);
  if (provider === 'ashby') return fetchAshby(source, pollNowIso);
  throw new Error(`Unsupported provider: ${provider}`);
}

export async function pollAtsSources(
  inputSources?: AtsSource[],
  limitPerSource = 25
): Promise<{
  jobs: NormalizedJob[];
  sources: AtsSource[];
  polledAt: string;
  newCount: number;
  totalCount: number;
}> {
  const pollNowIso = new Date().toISOString();
  const sourcesToPoll = (inputSources && inputSources.length > 0 ? inputSources : DEFAULT_ATS_SOURCES).map((s) => ({
    ...s,
  }));

  const results = await Promise.allSettled(
    sourcesToPoll.map(async (source) => {
      if (!source.enabled) {
        return { source: { ...source, status: 'idle' as const }, jobs: [] as NormalizedJob[] };
      }
      const jobs = await fetchSource(source, pollNowIso);
      const sorted = jobs
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limitPerSource);
      return {
        source: {
          ...source,
          lastPolledAt: pollNowIso,
          lastJobCount: jobs.length,
          status: 'ok' as const,
          errorMessage: undefined,
        },
        jobs: sorted,
      };
    })
  );

  const updatedSources: AtsSource[] = [];
  const allJobs: NormalizedJob[] = [];

  results.forEach((result, idx) => {
    const original = sourcesToPoll[idx];
    if (result.status === 'fulfilled') {
      updatedSources.push(result.value.source);
      allJobs.push(...result.value.jobs);
    } else {
      updatedSources.push({
        ...original,
        lastPolledAt: pollNowIso,
        lastJobCount: 0,
        status: 'error',
        errorMessage: result.reason instanceof Error ? result.reason.message : 'Failed to poll endpoint',
      });
    }
  });

  hasCompletedInitialPoll = true;

  allJobs.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const newCount = allJobs.filter((j) => j.isNew).length;

  return {
    jobs: allJobs,
    sources: updatedSources,
    polledAt: pollNowIso,
    newCount,
    totalCount: allJobs.length,
  };
}
