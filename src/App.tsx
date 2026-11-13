import * as React from 'react';
import {
  Briefcase,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  AiSettingsDialog,
  maskKey,
  type AiSettings,
  type ServerAiStatus,
} from '@/src/components/AiSettingsDialog';
import { AtsSourcesView } from '@/src/components/AtsSourcesView';
import { JobMatchInspector } from '@/src/components/JobMatchInspector';
import { ResumeWorkspace } from '@/src/components/ResumeWorkspace';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Skeleton } from '@/src/components/ui/skeleton';
import { Textarea } from '@/src/components/ui/textarea';
import {
  formatClockTime,
  formatRelativeTime,
  getConfidenceDisplay,
  SAMPLE_RESUME_TEXT,
} from '@/src/lib/formatters';
import type {
  AtsProvider,
  AtsSource,
  JobMatchAnalysis,
  NormalizedJob,
  ParsedResume,
  PollResponse,
} from '@/src/types/ats';

type ActiveTab = 'feed' | 'resume' | 'sources';
type FeedScope = 'all' | 'fresh' | 'matched' | 'strong';
type WorkplaceFilter = 'all' | 'Remote' | 'Hybrid' | 'On-site';
type PollIntervalSec = '0' | '30' | '60' | '300';

const STORAGE_KEYS = {
  resume: 'rolepulse_resume_v1',
  draft: 'rolepulse_resume_draft_v1',
  matches: 'rolepulse_matches_v1',
  sources: 'rolepulse_sources_v1',
  aiSettings: 'rolepulse_ai_settings_v1',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('feed');

  // Jobs & ATS Sources state
  const [sources, setSources] = React.useState<AtsSource[]>(() =>
    readStorage<AtsSource[]>(STORAGE_KEYS.sources, [])
  );
  const [jobs, setJobs] = React.useState<NormalizedJob[]>([]);
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);
  const [isPolling, setIsPolling] = React.useState(true);
  const [pollError, setPollError] = React.useState<string | null>(null);
  const [lastPolledAt, setLastPolledAt] = React.useState<string | undefined>(undefined);
  const [pollIntervalSec, setPollIntervalSec] = React.useState<PollIntervalSec>('60');

  // Filter state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [feedScope, setFeedScope] = React.useState<FeedScope>('all');
  const [workplaceFilter, setWorkplaceFilter] = React.useState<WorkplaceFilter>('all');
  const [companyFilter, setCompanyFilter] = React.useState<string>('all');

  // Resume state
  const [resume, setResume] = React.useState<ParsedResume | null>(() =>
    readStorage<ParsedResume | null>(STORAGE_KEYS.resume, null)
  );
  const [resumeDraft, setResumeDraft] = React.useState<string>(() =>
    readStorage<string>(STORAGE_KEYS.draft, '')
  );
  const [isParsingResume, setIsParsingResume] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [quickResumeModalOpen, setQuickResumeModalOpen] = React.useState(false);

  // Match analysis state
  const [matchesByJobId, setMatchesByJobId] = React.useState<Record<string, JobMatchAnalysis>>(() =>
    readStorage<Record<string, JobMatchAnalysis>>(STORAGE_KEYS.matches, {})
  );
  const [analyzingJobIds, setAnalyzingJobIds] = React.useState<Record<string, boolean>>({});
  const [isBatchScoring, setIsBatchScoring] = React.useState(false);
  const [analyzeErrors, setAnalyzeErrors] = React.useState<Record<string, string>>({});

  // AI provider + key supplied from the UI (kept in this browser only)
  const [aiSettings, setAiSettings] = React.useState<AiSettings | null>(() =>
    readStorage<AiSettings | null>(STORAGE_KEYS.aiSettings, null)
  );
  const [aiSettingsOpen, setAiSettingsOpen] = React.useState(false);
  const [serverAiStatus, setServerAiStatus] = React.useState<ServerAiStatus | null>(null);

  React.useEffect(() => {
    try {
      if (aiSettings) localStorage.setItem(STORAGE_KEYS.aiSettings, JSON.stringify(aiSettings));
      else localStorage.removeItem(STORAGE_KEYS.aiSettings);
    } catch {
      // storage unavailable: key lives in memory for this session only
    }
  }, [aiSettings]);

  React.useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: ServerAiStatus) => setServerAiStatus(data))
      .catch(() => setServerAiStatus(null));
  }, []);

  const aiHeaders = React.useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (aiSettings?.apiKey) {
      headers['x-ai-provider'] = aiSettings.provider;
      headers['x-ai-api-key'] = aiSettings.apiKey;
    }
    return headers;
  }, [aiSettings]);

  const hasAnyAiKey = Boolean(aiSettings || serverAiStatus?.hasClaudeKey || serverAiStatus?.hasGeminiKey);
  const openSettingsIfKeyMissing = (message: string) => {
    if (/API_KEY is not configured|Invalid ANTHROPIC_API_KEY|API key not valid/i.test(message)) setAiSettingsOpen(true);
  };

  // Persist key state cleanly
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.resume, JSON.stringify(resume));
    } catch {
      // ignore storage quota issues
    }
  }, [resume]);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(resumeDraft));
    } catch {
      // ignore
    }
  }, [resumeDraft]);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.matches, JSON.stringify(matchesByJobId));
    } catch {
      // ignore
    }
  }, [matchesByJobId]);

  React.useEffect(() => {
    if (sources.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEYS.sources, JSON.stringify(sources));
      } catch {
        // ignore
      }
    }
  }, [sources]);

  // Poll public ATS endpoints
  const runPoll = React.useCallback(async (customSources?: AtsSource[]) => {
    setIsPolling(true);
    setPollError(null);
    try {
      const payloadSources = customSources ?? (sources.length > 0 ? sources : undefined);
      const response = await fetch('/api/jobs/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: payloadSources,
          limitPerSource: 25,
        }),
      });

      const data = (await response.json()) as PollResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to poll ATS endpoints');
      }

      setJobs(data.jobs);
      setSources(data.sources);
      setLastPolledAt(data.polledAt);
      setSelectedJobId((prev) => {
        if (prev && data.jobs.some((j) => j.id === prev)) return prev;
        return data.jobs[0]?.id ?? null;
      });
    } catch (err) {
      setPollError(err instanceof Error ? err.message : 'Unable to reach ATS polling service');
    } finally {
      setIsPolling(false);
    }
  }, [sources]);

  // Initial poll on mount
  React.useEffect(() => {
    void runPoll(sources.length > 0 ? sources : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scheduled auto-polling
  React.useEffect(() => {
    const seconds = Number(pollIntervalSec);
    if (!seconds || seconds <= 0) return;

    const timer = window.setInterval(() => {
      void runPoll();
    }, seconds * 1000);

    return () => window.clearInterval(timer);
  }, [pollIntervalSec, runPoll]);

  // Resume parsing handlers
  const handleParseText = async (text: string) => {
    if (!text.trim()) return;
    setIsParsingResume(true);
    setParseError(null);
    try {
      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({ resumeText: text }),
      });
      const data = (await res.json()) as { resume?: ParsedResume; error?: string };
      if (!res.ok || !data.resume) {
        throw new Error(data.error || 'Resume parsing failed');
      }
      setResume(data.resume);
      setResumeDraft(data.resume.rawText || text);
      // Clear stale match scores because baseline resume changed
      setMatchesByJobId({});
      setQuickResumeModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to parse resume';
      setParseError(message);
      openSettingsIfKeyMissing(message);
    } finally {
      setIsParsingResume(false);
    }
  };

  const handleParseFile = async (file: File) => {
    setIsParsingResume(true);
    setParseError(null);
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);

        const res = await fetch('/api/resume/parse', {
          method: 'POST',
          headers: aiHeaders(),
          body: JSON.stringify({ fileBase64: base64, mimeType: 'application/pdf' }),
        });
        const data = (await res.json()) as { resume?: ParsedResume; error?: string };
        if (!res.ok || !data.resume) {
          throw new Error(data.error || 'PDF resume parsing failed');
        }
        setResume(data.resume);
        setResumeDraft(data.resume.rawText);
        setMatchesByJobId({});
        setQuickResumeModalOpen(false);
      } else {
        const text = await file.text();
        setResumeDraft(text);
        await handleParseText(text);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to process uploaded file';
      setParseError(message);
      openSettingsIfKeyMissing(message);
    } finally {
      setIsParsingResume(false);
    }
  };

  const handleClearResume = () => {
    setResume(null);
    setResumeDraft('');
    setMatchesByJobId({});
    setParseError(null);
  };

  // Match analysis handlers
  const handleAnalyzeJobs = async (targetJobs: NormalizedJob[], isBatch = false) => {
    if (!resume || targetJobs.length === 0) return;

    const jobIds = targetJobs.map((j) => j.id);
    if (isBatch) setIsBatchScoring(true);
    setAnalyzingJobIds((prev) => {
      const next = { ...prev };
      jobIds.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
    setAnalyzeErrors((prev) => {
      const next = { ...prev };
      jobIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });

    try {
      const res = await fetch('/api/jobs/match', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({ resume, jobs: targetJobs }),
      });
      const data = (await res.json()) as { matches?: JobMatchAnalysis[]; error?: string };
      if (!res.ok || !data.matches) {
        throw new Error(data.error || 'Match scoring failed');
      }

      setMatchesByJobId((prev) => {
        const next = { ...prev };
        data.matches!.forEach((m) => {
          next[m.jobId] = m;
        });
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to analyze job match';
      openSettingsIfKeyMissing(message);
      setAnalyzeErrors((prev) => {
        const next = { ...prev };
        jobIds.forEach((id) => {
          next[id] = message;
        });
        return next;
      });
    } finally {
      if (isBatch) setIsBatchScoring(false);
      setAnalyzingJobIds((prev) => {
        const next = { ...prev };
        jobIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
    }
  };

  // ATS source management
  const handleToggleSource = (id: string, enabled: boolean) => {
    const updated = sources.map((s) => (s.id === id ? { ...s, enabled } : s));
    setSources(updated);
    void runPoll(updated);
  };

  const handleAddSource = async (provider: AtsProvider, slug: string, label: string) => {
    const id = `${provider}-${slug}-${Date.now()}`;
    const updated = [...sources, { id, provider, slug, label, enabled: true }];
    setSources(updated);
    await runPoll(updated);
  };

  const handleRemoveSource = (id: string) => {
    const updated = sources.filter((s) => s.id !== id);
    setSources(updated);
    setJobs((prev) => prev.filter((j) => j.sourceId !== id));
  };

  // Derived collections & metrics
  const companyOptions = React.useMemo(() => {
    const unique = Array.from(new Set(jobs.map((j) => j.company))).sort();
    return unique;
  }, [jobs]);

  const filteredJobs = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = jobs.filter((job) => {
      if (workplaceFilter !== 'all' && job.workplaceType !== workplaceFilter) return false;
      if (companyFilter !== 'all' && job.company !== companyFilter) return false;

      const match = matchesByJobId[job.id];
      if (feedScope === 'fresh' && !job.isNew) return false;
      if (feedScope === 'matched' && !match) return false;
      if (feedScope === 'strong' && (!match || match.confidenceScore < 75)) return false;

      if (q) {
        const haystack = `${job.title} ${job.company} ${job.department} ${job.location} ${job.descriptionSnippet}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    // When resume matches exist, bubble scored roles slightly or keep fresh-first unless filtering by matched
    if (feedScope === 'matched' || feedScope === 'strong') {
      return [...list].sort(
        (a, b) => (matchesByJobId[b.id]?.confidenceScore ?? 0) - (matchesByJobId[a.id]?.confidenceScore ?? 0)
      );
    }

    return list;
  }, [jobs, searchQuery, workplaceFilter, companyFilter, feedScope, matchesByJobId]);

  const selectedJob = React.useMemo(
    () => filteredJobs.find((j) => j.id === selectedJobId) ?? filteredJobs[0] ?? null,
    [filteredJobs, selectedJobId]
  );

  const freshCount = React.useMemo(() => jobs.filter((j) => j.isNew).length, [jobs]);
  const healthySourceCount = React.useMemo(
    () => sources.filter((s) => s.enabled && s.status === 'ok').length,
    [sources]
  );
  const enabledSourceCount = React.useMemo(() => sources.filter((s) => s.enabled).length, [sources]);
  const matchedCount = React.useMemo(() => Object.keys(matchesByJobId).length, [matchesByJobId]);

  const unscoredVisibleJobs = React.useMemo(
    () => filteredJobs.filter((j) => !matchesByJobId[j.id]).slice(0, 6),
    [filteredJobs, matchesByJobId]
  );

  const quickFileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-slate-900">
      {/* Top Bar Contract: 3 zones (Wordmark | Single-line Nav | 1 Primary CTA) */}
      <header className="sticky top-0 z-30 bg-[#F4F5F7]/90 backdrop-blur-md border-b border-slate-200/70">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            RolePulse
          </button>

          <nav className="flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('feed')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                activeTab === 'feed'
                  ? 'text-slate-900 border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Job Feed
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('resume')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                activeTab === 'resume'
                  ? 'text-slate-900 border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Resume Profile
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                activeTab === 'sources'
                  ? 'text-slate-900 border-b-2 border-primary'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              ATS Sources
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAiSettingsOpen(true)}
              title={aiSettings ? `${aiSettings.provider} key ${maskKey(aiSettings.apiKey)}` : 'Add an AI API key'}
            >
              <span
                className={`size-2 rounded-full ${hasAnyAiKey ? 'bg-emerald-500' : 'bg-amber-500'}`}
                aria-hidden
              />
              <KeyRound className="size-3.5" />
              {aiSettings ? (aiSettings.provider === 'claude' ? 'Claude' : 'Gemini') : 'AI Key'}
            </Button>
            <Button type="button" size="sm" onClick={() => void runPoll()} disabled={isPolling}>
              <RefreshCw className={`size-3.5 ${isPolling ? 'animate-spin' : ''}`} />
              {isPolling ? 'Polling ATS...' : 'Poll Fresh Jobs'}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
        {/* Summary Strip: Single elevated surface with 4 metric segments */}
        <section className="surface-elevated rounded-2xl grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="px-6 py-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">Live Open Roles</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
                {jobs.length}
              </span>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {lastPolledAt ? `Polled ${formatClockTime(lastPolledAt)}` : 'Initial sync'}
              </span>
            </div>
          </div>

          <div className="px-6 py-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">Fresh Listings</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono tabular-nums text-primary">
                {freshCount}
              </span>
              <span className="text-xs text-slate-500">Recently updated or newly polled</span>
            </div>
          </div>

          <div className="px-6 py-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">ATS Endpoints</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
                {healthySourceCount}/{enabledSourceCount}
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('sources')}
                className="text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                Manage boards
              </button>
            </div>
          </div>

          <div className="px-6 py-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">Resume Baseline</p>
            {resume ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{resume.candidateName}</p>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    {resume.coreSkills.length + resume.toolsAndFrameworks.length} skills · {matchedCount} scored
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('resume')}
                  className="text-xs font-medium text-primary hover:underline shrink-0 cursor-pointer"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-sm text-slate-500">Not uploaded</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuickResumeModalOpen(true)}
                  className="h-7 px-2.5 text-xs"
                >
                  <Upload className="size-3" />
                  Add Resume
                </Button>
              </div>
            )}
          </div>
        </section>

        {pollError && (
          <div className="surface-elevated rounded-xl px-5 py-3.5 text-sm text-rose-700 bg-rose-50 flex items-center justify-between gap-4">
            <span>{pollError}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void runPoll()}>
              Retry Poll
            </Button>
          </div>
        )}

        {activeTab === 'feed' && (
          <div className="space-y-5">
            {/* Toolbar */}
            <div className="surface-elevated rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[260px]">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search title, company, stack, location..."
                    className="pl-9"
                  />
                </div>

                {/* Segmented Scope Filter */}
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {(
                    [
                      { id: 'all', label: 'All Roles' },
                      { id: 'fresh', label: `Fresh (${freshCount})` },
                      { id: 'matched', label: `Scored (${matchedCount})` },
                      { id: 'strong', label: 'Strong Fit' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFeedScope(item.id)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        feedScope === item.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="w-[140px]">
                  <Select value={workplaceFilter} onValueChange={(v) => setWorkplaceFilter(v as WorkplaceFilter)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Workplace" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Workplaces</SelectItem>
                      <SelectItem value="Remote">Remote</SelectItem>
                      <SelectItem value="Hybrid">Hybrid</SelectItem>
                      <SelectItem value="On-site">On-site</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-[150px]">
                  <Select value={companyFilter} onValueChange={setCompanyFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Company" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Companies</SelectItem>
                      {companyOptions.map((company) => (
                        <SelectItem key={company} value={company}>
                          {company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="w-[136px]">
                  <Select value={pollIntervalSec} onValueChange={(v) => setPollIntervalSec(v as PollIntervalSec)}>
                    <SelectTrigger aria-label="Auto-poll interval">
                      <SlidersHorizontal className="size-3.5 text-slate-400 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Manual Poll</SelectItem>
                      <SelectItem value="30">Poll every 30s</SelectItem>
                      <SelectItem value="60">Poll every 60s</SelectItem>
                      <SelectItem value="300">Poll every 5m</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {resume ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    disabled={isBatchScoring || unscoredVisibleJobs.length === 0}
                    onClick={() => void handleAnalyzeJobs(unscoredVisibleJobs, true)}
                  >
                    {isBatchScoring ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4 text-primary" />
                    )}
                    {isBatchScoring
                      ? 'Scoring Roles...'
                      : unscoredVisibleJobs.length > 0
                      ? `Score Top ${unscoredVisibleJobs.length}`
                      : 'All Visible Scored'}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setQuickResumeModalOpen(true)}>
                    <Upload className="size-4" />
                    Upload Resume to Score
                  </Button>
                )}
              </div>
            </div>

            {/* Master-Detail Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: Job Feed List */}
              <div className="lg:col-span-6 surface-elevated rounded-2xl overflow-hidden">
                {isPolling && jobs.length === 0 ? (
                  <div className="divide-y divide-slate-100">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="p-6 space-y-2.5">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-3.5 w-1/2" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ))}
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <Briefcase className="size-5" />
                    </div>
                    <div className="space-y-1 max-w-xs mx-auto">
                      <p className="text-sm font-semibold text-slate-900">No matching listings</p>
                      <p className="text-sm text-slate-500">
                        Adjust your search or filter criteria, or poll your ATS boards for new openings.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('');
                        setFeedScope('all');
                        setWorkplaceFilter('all');
                        setCompanyFilter('all');
                      }}
                    >
                      Reset Filters
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredJobs.map((job) => {
                      const isSelected = selectedJob?.id === job.id;
                      const match = matchesByJobId[job.id];
                      const isScoringThis = Boolean(analyzingJobIds[job.id]);
                      const conf = match
                        ? getConfidenceDisplay(match.confidenceScore, match.confidenceTier)
                        : null;

                      return (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => setSelectedJobId(job.id)}
                          className={`w-full text-left px-6 py-4 transition-colors cursor-pointer block ${
                            isSelected ? 'bg-blue-50/55' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-baseline gap-2.5">
                                <h3 className="text-base font-semibold text-slate-900 truncate">
                                  {job.title}
                                </h3>
                                {job.isNew && (
                                  <span className="text-xs font-semibold text-primary shrink-0">New</span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{job.company}</span>
                                <span aria-hidden="true">·</span>
                                <span>{job.location}</span>
                                <span aria-hidden="true">·</span>
                                <span>{job.workplaceType}</span>
                                <span aria-hidden="true">·</span>
                                <span className="capitalize">{job.provider}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">{formatRelativeTime(job.updatedAt)}</span>
                              </div>
                            </div>

                            {/* Right-aligned tabular confidence or status */}
                            <div className="shrink-0 text-right">
                              {isScoringThis ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                                  <Loader2 className="size-3.5 animate-spin" />
                                  Scoring
                                </span>
                              ) : conf && match ? (
                                <div className="space-y-0.5">
                                  <div className={`text-base font-semibold font-mono tabular-nums ${conf.textClass}`}>
                                    {match.confidenceScore}%
                                  </div>
                                  <div className={`text-[11px] font-medium ${conf.textClass}`}>
                                    {conf.label}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {job.descriptionSnippet && (
                            <p className="mt-2 text-xs leading-relaxed text-slate-500 line-clamp-2">
                              {job.descriptionSnippet}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right: Sticky Inspector */}
              <div className="lg:col-span-6 lg:sticky lg:top-[5.25rem]">
                <JobMatchInspector
                  job={selectedJob}
                  resume={resume}
                  analysis={selectedJob ? matchesByJobId[selectedJob.id] : undefined}
                  isAnalyzing={selectedJob ? Boolean(analyzingJobIds[selectedJob.id]) : false}
                  analyzeError={selectedJob ? analyzeErrors[selectedJob.id] ?? null : null}
                  onAnalyzeJob={(job) => void handleAnalyzeJobs([job])}
                  onOpenResumeTab={() => setQuickResumeModalOpen(true)}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'resume' && (
          <ResumeWorkspace
            resume={resume}
            resumeDraft={resumeDraft}
            onDraftChange={setResumeDraft}
            onParseText={handleParseText}
            onParseFile={handleParseFile}
            onClearResume={handleClearResume}
            isParsing={isParsingResume}
            parseError={parseError}
          />
        )}

        {activeTab === 'sources' && (
          <AtsSourcesView
            sources={sources}
            isPolling={isPolling}
            onToggleSource={handleToggleSource}
            onAddSource={handleAddSource}
            onRemoveSource={handleRemoveSource}
            onPollAll={() => void runPoll()}
          />
        )}
      </main>

      {/* Quick Resume Upload / Paste Dialog (keeps user on Job Feed) */}
      <Dialog open={quickResumeModalOpen} onOpenChange={setQuickResumeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Your Resume for AI Match Scoring</DialogTitle>
            <DialogDescription>
              Upload a PDF/TXT file or paste your resume below. AI (Claude or Gemini) parses your experience once and scores live ATS openings with gap highlights.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResumeDraft(SAMPLE_RESUME_TEXT)}
                disabled={isParsingResume}
              >
                Load Sample Resume
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickFileInputRef.current?.click()}
                disabled={isParsingResume}
              >
                <Upload className="size-3.5" />
                Upload PDF / TXT
              </Button>
              <input
                ref={quickFileInputRef}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleParseFile(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </div>

            <Textarea
              value={resumeDraft}
              onChange={(e) => setResumeDraft(e.target.value)}
              placeholder="Paste your resume text here..."
              className="min-h-[240px]"
              disabled={isParsingResume}
            />

            {parseError && (
              <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{parseError}</div>
            )}

            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setQuickResumeModalOpen(false)}
                disabled={isParsingResume}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleParseText(resumeDraft)}
                disabled={isParsingResume || !resumeDraft.trim()}
              >
                {isParsingResume ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {isParsingResume ? 'Parsing Resume...' : 'Parse & Enable Matching'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AiSettingsDialog
        open={aiSettingsOpen}
        onOpenChange={setAiSettingsOpen}
        settings={aiSettings}
        serverStatus={serverAiStatus}
        onSave={(next) => {
          setAiSettings(next);
          setParseError(null);
        }}
        onClear={() => setAiSettings(null)}
      />
    </div>
  );
}
