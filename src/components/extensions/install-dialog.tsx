import { useState } from "react";
import { api } from "@/lib/invoke";
import { useExtensionStore } from "@/stores/extension-store";
import { X } from "lucide-react";

export function InstallDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetch = useExtensionStore((s) => s.fetch);

  const handleInstall = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.installFromGit(url.trim());
      await fetch();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Install from Git</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-500">Enter a Git repository URL containing a skill to install.</p>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleInstall()}
          placeholder="https://github.com/user/skill-repo.git"
          className="mt-3 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:focus:border-zinc-400"
          autoFocus
          disabled={loading}
        />
        {error && (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleInstall}
            disabled={loading || !url.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Installing..." : "Install"}
          </button>
        </div>
      </div>
    </div>
  );
}
