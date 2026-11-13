import type { NormalizedJob, ParsedResume } from '../src/types/ats';

export const RESUME_SYSTEM_INSTRUCTION = `You are a precise technical recruiter and resume parser.
Extract structured candidate information from the provided resume.
Be factual and grounded strictly in the resume content. Do not invent skills or years of experience that are not supported by the text.
If extracting from an attached PDF/document, also reconstruct a clean plain-text summary in rawText.`;

export const MATCH_SYSTEM_INSTRUCTION = `You are a rigorous, honest hiring calibration engine comparing a candidate resume against live job postings.
For each job, assign a realistic confidenceScore from 0 to 100:
- 82-100 ("Strong Fit"): Meets core role level, primary tech stack/domain, and most explicit requirements.
- 65-81 ("Good Fit"): Strong overlap on core skills with minor tooling or domain gaps.
- 45-64 ("Partial Fit"): Meaningful transferable skills, but missing several explicit requirements or seniority match.
- 0-44 ("Stretch"): Significant domain, stack, or seniority mismatch.

Be specific and cite actual technologies/requirements from the job description.
For missingGaps, list concrete missing skills, certifications, domain experience, or seniority gaps with actionable bridgeTips. Keep matchedSkills concise (up to 8 items) and missingGaps focused on the top 2-5 real gaps.`;

export function buildMatchPayload(resume: ParsedResume, jobs: NormalizedJob[]) {
  return {
    candidate: {
      headline: resume.headline,
      yearsExperience: resume.yearsExperience,
      location: resume.location,
      coreSkills: resume.coreSkills,
      toolsAndFrameworks: resume.toolsAndFrameworks,
      domains: resume.domains,
      summary: resume.summary,
      rawExcerpt: resume.rawText.slice(0, 3500),
    },
    jobs: jobs.map((job) => ({
      jobId: job.id,
      company: job.company,
      title: job.title,
      department: job.department,
      location: job.location,
      workplaceType: job.workplaceType,
      description: job.descriptionText.slice(0, 2600),
    })),
  };
}
