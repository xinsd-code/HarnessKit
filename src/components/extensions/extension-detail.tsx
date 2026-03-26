import { useEffect, useState } from "react";
import { useExtensionStore } from "@/stores/extension-store";
import { KindBadge } from "@/components/shared/kind-badge";
import { TrustBadge } from "@/components/shared/trust-badge";
import { api } from "@/lib/invoke";
import { X, File, Globe, Terminal, Database, Key, Calendar, GitBranch } from "lucide-react";
import type { Permission } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function PermissionDetail({ perm }: { perm: Permission }) {
  const icons: Record<string, typeof File> = { filesystem: File, network: Globe, shell: Terminal, database: Database, env: Key };
  const labels: Record<string, string> = { filesystem: "File System", network: "Network", shell: "Shell", database: "Database", env: "Environment" };
  const Icon = icons[perm.type] ?? File;
  const details = "paths" in perm ? perm.paths : "domains" in perm ? perm.domains : "commands" in perm ? perm.commands : "engines" in perm ? perm.engines : "keys" in perm ? perm.keys : [];

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon size={14} className="mt-0.5 shrink-0 text-zinc-400" />
      <div>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{labels[perm.type] ?? perm.type}</span>
        {details.length > 0 && (
          <p className="text-xs text-zinc-500">{details.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

export function ExtensionDetail() {
  const { extensions, selectedId, setSelectedId, toggle } = useExtensionStore();
  const ext = extensions.find((e) => e.id === selectedId);
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    setContent(null);
    setLoadingContent(true);
    api.getExtensionContent(selectedId)
      .then(setContent)
      .catch(() => setContent(null))
      .finally(() => setLoadingContent(false));
  }, [selectedId]);

  if (!ext) return null;

  return (
    <div className="w-96 shrink-0 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{ext.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <KindBadge kind={ext.kind} />
            {ext.trust_score != null && <TrustBadge score={ext.trust_score} size="sm" />}
          </div>
        </div>
        <button onClick={() => setSelectedId(null)} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X size={18} />
        </button>
      </div>

      {ext.description && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{ext.description}</p>
      )}

      {/* Metadata */}
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-zinc-500">
          <Calendar size={14} />
          <span>Installed {formatDate(ext.installed_at)}</span>
        </div>
        {ext.source.origin === "git" && ext.source.url && (
          <div className="flex items-center gap-2 text-zinc-500">
            <GitBranch size={14} />
            <span className="truncate">{ext.source.url}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="text-xs">Agents:</span>
          <span>{ext.agents.join(", ")}</span>
        </div>
      </div>

      {/* Status toggle */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
        <span className="text-sm">Status</span>
        <button
          onClick={() => toggle(ext.id, !ext.enabled)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            ext.enabled
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}
        >
          {ext.enabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      {/* Permissions */}
      {ext.permissions.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-medium text-zinc-500">Permissions</h4>
          <div className="space-y-2">
            {ext.permissions.map((p, i) => (
              <PermissionDetail key={i} perm={p} />
            ))}
          </div>
        </div>
      )}

      {/* Content / Documentation */}
      <div className="mt-4">
        <h4 className="mb-2 text-xs font-medium text-zinc-500">
          {ext.kind === "skill" ? "Skill Documentation" : ext.kind === "mcp" ? "Server Configuration" : ext.kind === "hook" ? "Hook Command" : "Details"}
        </h4>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800">
          {loadingContent ? (
            <p className="text-xs text-zinc-500">Loading...</p>
          ) : content ? (
            <pre className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400 max-h-80 overflow-y-auto">{content}</pre>
          ) : (
            <p className="text-xs text-zinc-500 italic">No content available</p>
          )}
        </div>
      </div>
    </div>
  );
}
