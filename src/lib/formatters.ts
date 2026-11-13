import type { ConfidenceTier, GapSeverity } from '@/src/types/ats';

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const time = date.getTime();
  if (!Number.isFinite(time)) return 'Recently';

  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatClockTime(isoString?: string): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function getConfidenceDisplay(score: number, tier?: ConfidenceTier) {
  if (score >= 80) {
    return {
      textClass: 'text-emerald-700',
      barClass: 'bg-emerald-600',
      surfaceClass: 'bg-emerald-50/70',
      label: tier ?? 'Strong Fit',
    };
  }
  if (score >= 65) {
    return {
      textClass: 'text-sky-700',
      barClass: 'bg-sky-600',
      surfaceClass: 'bg-sky-50/70',
      label: tier ?? 'Good Fit',
    };
  }
  if (score >= 45) {
    return {
      textClass: 'text-amber-700',
      barClass: 'bg-amber-500',
      surfaceClass: 'bg-amber-50/70',
      label: tier ?? 'Partial Fit',
    };
  }
  return {
    textClass: 'text-rose-700',
    barClass: 'bg-rose-600',
    surfaceClass: 'bg-rose-50/70',
    label: tier ?? 'Stretch',
  };
}

export function getSeverityDisplay(severity: GapSeverity) {
  if (severity === 'critical') {
    return {
      label: 'Critical Gap',
      textClass: 'text-rose-700',
    };
  }
  if (severity === 'moderate') {
    return {
      label: 'Moderate Gap',
      textClass: 'text-amber-700',
    };
  }
  return {
    label: 'Minor Gap',
    textClass: 'text-slate-600',
  };
}

export const SAMPLE_RESUME_TEXT = `Maya Lin
San Francisco, CA (Open to Remote)
Senior Full-Stack Product Engineer — 6 Years Experience

SUMMARY
Product-minded full-stack engineer specializing in TypeScript, React, Node.js, and high-throughput PostgreSQL data applications. Built real-time financial analytics dashboards, API gateways, and developer workflows serving 200k+ monthly active users.

CORE SKILLS
- Languages: TypeScript, JavaScript, Python, SQL
- Frontend: React 19, Next.js, Tailwind CSS, TanStack Query, WebSockets, Design Systems
- Backend & Data: Node.js, Express, PostgreSQL, Redis, GraphQL, REST APIs, Prisma
- Cloud & Ops: AWS (ECS, S3, Lambda, RDS), Docker, GitHub Actions, Datadog, Terraform basics

EXPERIENCE
Staff-track / Senior Software Engineer — LedgerFlow (2022 – Present)
- Led frontend & API architecture for automated reconciliation workflows processing $1.8B/yr in B2B transactions.
- Cut p95 dashboard query latency from 1.4s to 210ms using PostgreSQL partial indexes and Redis read-through caching.
- Built internal AI document extraction pipeline integrating structured LLM outputs with human-in-the-loop review.
- Mentored 4 engineers and owned technical design reviews across Billing and Reporting squads.

Software Engineer — Verve Cloud (2020 – 2022)
- Developed React + TypeScript observability console and real-time log streaming UI.
- Implemented OAuth2 / SSO integrations (SAML, OIDC) and role-based access control for enterprise workspaces.

EDUCATION
B.S. in Computer Science, University of California, Davis`;
