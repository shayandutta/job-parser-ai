import * as React from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Separator } from '@/src/components/ui/separator';
import { Switch } from '@/src/components/ui/switch';
import { formatClockTime } from '@/src/lib/formatters';
import type { AtsProvider, AtsSource } from '@/src/types/ats';

interface AtsSourcesViewProps {
  sources: AtsSource[];
  isPolling: boolean;
  onToggleSource: (id: string, enabled: boolean) => void;
  onAddSource: (provider: AtsProvider, slug: string, label: string) => Promise<void>;
  onRemoveSource: (id: string) => void;
  onPollAll: () => void;
}

export function AtsSourcesView({
  sources,
  isPolling,
  onToggleSource,
  onAddSource,
  onRemoveSource,
  onPollAll,
}: AtsSourcesViewProps) {
  const [provider, setProvider] = React.useState<AtsProvider>('greenhouse');
  const [slug, setSlug] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [isAdding, setIsAdding] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = slug.trim().toLowerCase();
    const cleanLabel = label.trim() || cleanSlug;
    if (!cleanSlug) return;

    setIsAdding(true);
    try {
      await onAddSource(provider, cleanSlug, cleanLabel);
      setSlug('');
      setLabel('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Custom Public ATS Board */}
      <section className="surface-elevated rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Public ATS Endpoints</h2>
            <p className="text-sm text-slate-500">
              Add any company board slug from Greenhouse, Lever, or Ashby to poll live openings directly.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onPollAll} disabled={isPolling}>
            <RefreshCw className={`size-3.5 ${isPolling ? 'animate-spin' : ''}`} />
            Poll Enabled Boards
          </Button>
        </div>

        <Separator />

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-3 space-y-1.5">
            <label className="text-xs font-medium text-slate-600">ATS Provider</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as AtsProvider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="greenhouse">Greenhouse</SelectItem>
                <SelectItem value="lever">Lever</SelectItem>
                <SelectItem value="ashby">Ashby</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-4 space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Board Slug</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. notion, airbnb, discord"
              disabled={isAdding}
            />
          </div>

          <div className="sm:col-span-3 space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Company Name</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Notion"
              disabled={isAdding}
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" className="w-full" disabled={isAdding || !slug.trim()}>
              <Plus className="size-4" />
              {isAdding ? 'Adding...' : 'Add & Poll'}
            </Button>
          </div>
        </form>
      </section>

      {/* Active Endpoints Table */}
      <section className="surface-elevated rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500">
                <th className="py-3.5 px-6">Company</th>
                <th className="py-3.5 px-4">Provider</th>
                <th className="py-3.5 px-4">Board Slug</th>
                <th className="py-3.5 px-4">Endpoint Status</th>
                <th className="py-3.5 px-4 text-right">Jobs Fetched</th>
                <th className="py-3.5 px-4 text-right">Last Polled</th>
                <th className="py-3.5 px-6 text-right">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {sources.map((src) => (
                <tr key={src.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-6 font-medium text-slate-900">{src.label}</td>
                  <td className="py-3.5 px-4 text-slate-600 capitalize">{src.provider}</td>
                  <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{src.slug}</td>
                  <td className="py-3.5 px-4">
                    {!src.enabled ? (
                      <span className="text-xs text-slate-400">Paused</span>
                    ) : src.status === 'error' ? (
                      <span className="text-xs font-medium text-rose-700" title={src.errorMessage}>
                        Error: {src.errorMessage || 'Unavailable'}
                      </span>
                    ) : src.status === 'ok' ? (
                      <span className="text-xs font-medium text-emerald-700">Healthy</span>
                    ) : (
                      <span className="text-xs text-slate-500">Pending poll</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {src.lastJobCount ?? 0}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500">
                    {formatClockTime(src.lastPolledAt)}
                  </td>
                  <td className="py-3.5 px-6">
                    <div className="flex items-center justify-end gap-3">
                      <Switch
                        checked={src.enabled}
                        onCheckedChange={(checked) => onToggleSource(src.id, checked)}
                        aria-label={`Toggle ${src.label}`}
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveSource(src.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-colors cursor-pointer"
                        aria-label={`Remove ${src.label}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
