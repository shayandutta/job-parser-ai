import * as React from 'react';
import { FileText, Loader2, Trash2, Upload, UserCheck } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Separator } from '@/src/components/ui/separator';
import { Textarea } from '@/src/components/ui/textarea';
import { SAMPLE_RESUME_TEXT } from '@/src/lib/formatters';
import type { ParsedResume } from '@/src/types/ats';

interface ResumeWorkspaceProps {
  resume: ParsedResume | null;
  resumeDraft: string;
  onDraftChange: (text: string) => void;
  onParseText: (text: string) => Promise<void>;
  onParseFile: (file: File) => Promise<void>;
  onClearResume: () => void;
  isParsing: boolean;
  parseError: string | null;
}

export function ResumeWorkspace({
  resume,
  resumeDraft,
  onDraftChange,
  onParseText,
  onParseFile,
  onClearResume,
  isParsing,
  parseError,
}: ResumeWorkspaceProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onParseFile(file);
    e.target.value = '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Input & Upload Plane */}
      <section className="lg:col-span-6 surface-elevated rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Resume Input</h2>
            <p className="text-sm text-slate-500">
              Upload a PDF, TXT, or Markdown resume or paste plain text to extract structured skills.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDraftChange(SAMPLE_RESUME_TEXT)}
              disabled={isParsing}
            >
              Load Sample
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
            >
              <Upload className="size-3.5" />
              Upload File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        <Textarea
          value={resumeDraft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Paste your resume content here (experience, skills, tools, education)..."
          className="min-h-[360px] font-sans text-sm leading-relaxed resize-y"
          disabled={isParsing}
        />

        {parseError && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {parseError}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-1">
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {resumeDraft.trim().length > 0 ? `${resumeDraft.trim().split(/\s+/).length} words` : 'No text entered'}
          </span>
          <div className="flex items-center gap-2">
            {resume && (
              <Button type="button" variant="ghost" size="sm" onClick={onClearResume} disabled={isParsing}>
                <Trash2 className="size-3.5" />
                Clear
              </Button>
            )}
            <Button
              type="button"
              onClick={() => onParseText(resumeDraft)}
              disabled={isParsing || !resumeDraft.trim()}
            >
              {isParsing ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {isParsing ? 'Parsing Resume...' : resume ? 'Re-parse Resume' : 'Parse Resume'}
            </Button>
          </div>
        </div>
      </section>

      {/* Right: Parsed Profile View */}
      <section className="lg:col-span-6 surface-elevated rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Parsed Candidate Profile</h2>
            <p className="text-sm text-slate-500">
              Structured baseline used to compute confidence scores and skill gaps across live ATS jobs.
            </p>
          </div>
          {resume && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 shrink-0">
              <UserCheck className="size-4" />
              <span>Ready for Matching</span>
            </div>
          )}
        </div>

        <Separator />

        {!resume ? (
          <div className="py-16 text-center space-y-3">
            <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <FileText className="size-5" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <p className="text-sm font-medium text-slate-900">No resume parsed yet</p>
              <p className="text-sm text-slate-500">
                Upload a PDF or paste your resume on the left, or load the sample profile to test live job matching.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h3 className="text-xl font-semibold text-slate-900">{resume.candidateName}</h3>
              <p className="text-sm font-medium text-slate-700">{resume.headline}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono tabular-nums">{resume.yearsExperience} yrs experience</span>
                <span aria-hidden="true">·</span>
                <span>{resume.location || 'Location unspecified'}</span>
                {resume.education && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{resume.education}</span>
                  </>
                )}
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-600">{resume.summary}</p>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-500">Target Roles</h4>
                <ul className="space-y-1.5 text-sm text-slate-800">
                  {resume.targetRoles.map((role) => (
                    <li key={role} className="leading-snug">
                      {role}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-500">Domains</h4>
                <ul className="space-y-1.5 text-sm text-slate-800">
                  {resume.domains.map((domain) => (
                    <li key={domain} className="leading-snug">
                      {domain}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500">Core Skills</h4>
              <p className="text-sm leading-relaxed text-slate-800">
                {resume.coreSkills.join(' · ')}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500">Tools & Frameworks</h4>
              <p className="text-sm leading-relaxed text-slate-700">
                {resume.toolsAndFrameworks.join(' · ')}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
