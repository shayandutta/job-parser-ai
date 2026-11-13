import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ATS_SOURCES, pollAtsSources } from './server/ats';
import { getAiProvider, hasClaudeKey, hasGeminiKey, matchJobs, parseAiProvider, parseResume, type AiOverride } from './server/ai';
import type { AtsSource, NormalizedJob, ParsedResume } from './src/types/ats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

/** Reads a UI-supplied provider/key from request headers (used for this request only, never stored). */
function getAiOverride(req: express.Request): AiOverride | undefined {
  const apiKey = req.header('x-ai-api-key')?.trim();
  const provider = parseAiProvider(req.header('x-ai-provider'));
  return apiKey && provider ? { apiKey, provider } : undefined;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      aiProvider: getAiProvider(),
      hasGeminiKey: hasGeminiKey(),
      hasClaudeKey: hasClaudeKey(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/jobs/sources', (_req, res) => {
    res.json({ sources: DEFAULT_ATS_SOURCES });
  });

  app.get('/api/jobs/poll', async (_req, res) => {
    try {
      const result = await pollAtsSources(DEFAULT_ATS_SOURCES);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to poll ATS endpoints';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/jobs/poll', async (req, res) => {
    try {
      const { sources, limitPerSource } = (req.body ?? {}) as {
        sources?: AtsSource[];
        limitPerSource?: number;
      };
      const result = await pollAtsSources(sources, limitPerSource ?? 25);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to poll ATS endpoints';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/resume/parse', async (req, res) => {
    try {
      const { resumeText, fileBase64, mimeType } = (req.body ?? {}) as {
        resumeText?: string;
        fileBase64?: string;
        mimeType?: string;
      };

      if (!resumeText?.trim() && !fileBase64) {
        res.status(400).json({ error: 'Provide resume text or upload a resume document.' });
        return;
      }

      const parsed = await parseResume({ resumeText, fileBase64, mimeType }, getAiOverride(req));
      res.json({ resume: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse resume';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/jobs/match', async (req, res) => {
    try {
      const { resume, jobs } = (req.body ?? {}) as {
        resume?: ParsedResume;
        jobs?: NormalizedJob[];
      };

      if (!resume || !Array.isArray(jobs) || jobs.length === 0) {
        res.status(400).json({ error: 'Parsed resume and at least one job are required.' });
        return;
      }

      // Process up to 10 jobs per request cleanly to keep latency crisp
      const batch = jobs.slice(0, 10);
      const matches = await matchJobs(resume, batch, getAiOverride(req));
      res.json({ matches });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze job matches';
      res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RolePulse server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
