import * as React from 'react';
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
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

export type AiProvider = 'claude' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
}

export interface ServerAiStatus {
  aiProvider: AiProvider;
  hasClaudeKey: boolean;
  hasGeminiKey: boolean;
}

const PROVIDER_META: Record<AiProvider, { label: string; placeholder: string; consoleUrl: string }> = {
  claude: {
    label: 'Claude (Anthropic)',
    placeholder: 'sk-ant-...',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
  },
  gemini: {
    label: 'Gemini (Google)',
    placeholder: 'AIza...',
    consoleUrl: 'https://aistudio.google.com/apikey',
  },
};

export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 10) return '••••••';
  return `${k.slice(0, 6)}••••${k.slice(-4)}`;
}

interface AiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AiSettings | null;
  serverStatus: ServerAiStatus | null;
  onSave: (settings: AiSettings) => void;
  onClear: () => void;
}

export function AiSettingsDialog({ open, onOpenChange, settings, serverStatus, onSave, onClear }: AiSettingsDialogProps) {
  const [provider, setProvider] = React.useState<AiProvider>(settings?.provider ?? 'claude');
  const [apiKey, setApiKey] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);

  // Reset the form each time the dialog opens
  React.useEffect(() => {
    if (open) {
      setProvider(settings?.provider ?? 'claude');
      setApiKey('');
      setShowKey(false);
    }
  }, [open, settings]);

  const meta = PROVIDER_META[provider];
  const serverHasKey = provider === 'claude' ? serverStatus?.hasClaudeKey : serverStatus?.hasGeminiKey;

  const handleSave = () => {
    const key = apiKey.trim();
    if (!key) return;
    onSave({ provider, apiKey: key });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Settings</DialogTitle>
          <DialogDescription>
            Choose an AI provider and paste your API key. The key is stored only in this browser and sent with each AI
            request. The server never saves it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {settings && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <div className="min-w-0">
                <p className="font-medium">Using {PROVIDER_META[settings.provider].label}</p>
                <p className="font-mono text-xs text-emerald-700">{maskKey(settings.apiKey)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClear();
                  setApiKey('');
                }}
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </div>
          )}

          {!settings && serverStatus && (
            <p className="rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-600">
              No browser key set.{' '}
              {serverStatus.hasClaudeKey || serverStatus.hasGeminiKey
                ? `Server is using its .env key (${PROVIDER_META[serverStatus.aiProvider].label}).`
                : 'Server has no .env key either, so AI parsing and matching are off until you add one.'}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Provider</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
              <SelectTrigger>
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">{PROVIDER_META.claude.label}</SelectItem>
                <SelectItem value="gemini">{PROVIDER_META.gemini.label}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="ai-api-key" className="text-xs font-medium text-slate-600">
                API key
              </label>
              <a
                href={meta.consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                Get a key
              </a>
            </div>
            <div className="relative">
              <Input
                id="ai-api-key"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
                placeholder={settings?.provider === provider ? 'Paste a new key to replace' : meta.placeholder}
                className="pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {serverHasKey && (
              <p className="text-xs text-slate-500">The server also has a {meta.label} key in .env. A browser key takes priority.</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!apiKey.trim()}>
              <KeyRound className="size-4" />
              Save Key
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
