import * as React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileSearch,
  Loader2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Progress } from '@/src/components/ui/progress';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { Separator } from '@/src/components/ui/separator';
import { Skeleton } from '@/src/components/ui/skeleton';
import { formatRelativeTime, getConfidenceDisplay, getSeverityDisplay } from '@/src/lib/formatters';
import type { JobMatchAnalysis, NormalizedJob, ParsedResume } from '@/src/types/ats';

interface JobMatchInspectorProps {
  job: NormalizedJob | null;
  resume: ParsedResume | null;
  analysis?: JobMatchAnalysis;
  isAnalyzing: boolean;
  analyzeError: string | null;
  onAnalyzeJob: (job: NormalizedJob) => void;
  onOpenResumeTab: () => void;
}

export function JobMatchInspector({
  job,
  resume,
  analysis,
  isAnalyzing,
  analyzeError,
  onAnalyzeJob,
  onOpenResumeTab,
}: JobMatchInspectorProps) {
  if (!job) {
    return (
      <div className="surface-elevated rounded-2xl p-8 text-center space-y-3">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <FileSearch className="size-5" />
        </div>
        <div className="space-y-1 max-w-xs mx-auto">
          <h3 className="text-base font-semibold text-slate-900">Select a job listing</h3>
          <p className="text-sm text-slate-500">
            Choose any role from the live ATS feed to inspect its description, confidence score, and skill gaps.
          </p>
        </div>
      </div>
    );
  }

  const confidence = analysis
    ? getConfidenceDisplay(analysis.confidenceScore, analysis.confidenceTier)
    : null;

  return (
    <div className="surface-elevated rounded-2xl overflow-hidden flex flex-col max-h-[calc(100vh-8.5rem)]">
      {/* Header */}
      <div className="p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 leading-snug text-balance">
              {job.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-medium text-slate-800">{job.company}</span>
              <span aria-hidden="true">·</span>
              <span>{job.department}</span>
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
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
              Apply
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* AI Confidence & Gap Analysis Block */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Resume Match & Skill Gaps</h3>
              {resume && analysis && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onAnalyzeJob(job)}
                  disabled={isAnalyzing}
                  className="h-7 px-2.5 text-xs"
                >
                  {isAnalyzing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Re-score
                </Button>
              )}
            </div>

            {!resume ? (
              <div className="surface-recessed rounded-xl p-5 space-y-3">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Upload or paste your resume to calculate a tailored confidence score and highlight missing skills for this role.
                </p>
                <Button type="button" size="sm" onClick={onOpenResumeTab}>
                  <Upload className="size-3.5" />
                  Add Resume
                </Button>
              </div>
            ) : isAnalyzing ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : analyzeError ? (
              <div className="rounded-xl bg-rose-50 p-4 space-y-2.5">
                <p className="text-sm text-rose-700">{analyzeError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => onAnalyzeJob(job)}>
                  Retry Analysis
                </Button>
              </div>
            ) : !analysis ? (
              <div className="surface-recessed rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-800">Ready to evaluate against {resume.candidateName}</p>
                  <p className="text-xs text-slate-500">
                    Run AI analysis to score alignment and detect missing requirements.
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => onAnalyzeJob(job)}>
                  Analyze Match
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Confidence Meter */}
                <div className={`rounded-xl p-4 space-y-3 ${confidence?.surfaceClass}`}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex items-baseline gap-2.5">
                      <span className={`text-3xl font-semibold font-mono tabular-nums tracking-tight ${confidence?.textClass}`}>
                        {analysis.confidenceScore}%
                      </span>
                      <span className={`text-sm font-semibold ${confidence?.textClass}`}>
                        {confidence?.label}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      Scored {formatRelativeTime(analysis.analyzedAt)}
                    </span>
                  </div>
                  <Progress value={analysis.confidenceScore} indicatorClassName={confidence?.barClass} />
                  <p className="text-sm text-slate-700 leading-relaxed">{analysis.rationale}</p>
                </div>

                {/* Matched Strengths */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="size-3.5" />
                    <span>Matched Qualifications ({analysis.matchedSkills.length})</span>
                  </div>
                  {analysis.matchedSkills.length > 0 ? (
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {analysis.matchedSkills.join(' · ')}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">No direct requirement overlaps highlighted.</p>
                  )}
                  {analysis.strengthHighlights.length > 0 && (
                    <ul className="space-y-1 pt-1 text-sm text-slate-600">
                      {analysis.strengthHighlights.map((item, i) => (
                        <li key={i} className="leading-relaxed">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Separator />

                {/* Highlighted Gaps */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <AlertTriangle className="size-3.5 text-amber-600" />
                    <span>Identified Skill & Experience Gaps ({analysis.missingGaps.length})</span>
                  </div>

                  {analysis.missingGaps.length === 0 ? (
                    <p className="text-sm text-emerald-700">
                      No major gaps detected against the stated job requirements.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {analysis.missingGaps.map((gap, index) => {
                        const sev = getSeverityDisplay(gap.severity);
                        return (
                          <div key={`${gap.skill}-${index}`} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-slate-900">{gap.skill}</span>
                              <span className={`text-xs font-medium shrink-0 ${sev.textClass}`}>
                                {sev.label}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed">{gap.reason}</p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              <span className="font-medium text-slate-700">How to bridge: </span>
                              {gap.bridgeTip}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Full Job Description */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Role Description</h3>
            <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line max-w-[70ch]">
              {job.descriptionText || 'No full description provided by this ATS endpoint.'}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
