import { clsx } from "clsx";
import {
  BadgeCheck,
  ChevronDown,
  ExternalLink,
  Folder,
  FolderOpen,
  GitBranch,
  Loader2,
  Package,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Terminal,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InstallDialog } from "@/components/extensions/install-dialog";
import { AgentMascot } from "@/components/shared/agent-mascot/agent-mascot";
import { Hint } from "@/components/shared/hint";
import { useScrollPassthrough } from "@/hooks/use-scroll-passthrough";
import { canInstallAtScope } from "@/lib/agent-capabilities";
import { humanizeError } from "@/lib/errors";
import { api } from "@/lib/invoke";
import {
  type ConfigScope,
  type MarketplaceItem,
  scopeKey,
  type SkillAuditInfo,
  sortAgents,
} from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";
import { useExtensionStore } from "@/stores/extension-store";
import { useMarketplaceStore } from "@/stores/marketplace-store";
import { useProjectStore } from "@/stores/project-store";
import { toast } from "@/stores/toast-store";

function marketplaceInstallKey(
  itemId: string,
  agentName: string,
  targetScope: ConfigScope,
): string {
  return `${itemId}:${agentName}:${scopeKey(targetScope)}`;
}

/** Extract install-related section from README markdown.
 *  Skips fenced code blocks so that `# shell comments` aren't mistaken for headings. */
function extractInstallSection(readme: string): string | null {
  const lines = readme.split("\n");
  const installHeadingRe =
    /^#{1,3}\s+.*?(install\w*|setup|getting\s+started|quick\s+start|usage|安装|快速开始)/i;
  const fenceRe = /^(`{3,}|~{3,})/;

  // First pass: mark which lines are inside fenced code blocks
  const inCodeBlock: boolean[] = new Array(lines.length);
  let insideFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(fenceRe);
    if (m) {
      if (!insideFence) {
        insideFence = true;
        fenceChar = m[1][0];
        fenceLen = m[1].length;
        inCodeBlock[i] = true;
        continue;
      }
      // Closing fence must use same char and at least same length
      if (lines[i].startsWith(fenceChar.repeat(fenceLen))) {
        inCodeBlock[i] = true;
        insideFence = false;
        continue;
      }
    }
    inCodeBlock[i] = insideFence;
  }

  // Second pass: find install heading outside code blocks
  for (let i = 0; i < lines.length; i++) {
    if (inCodeBlock[i]) continue;
    if (!installHeadingRe.test(lines[i])) continue;
    // Found an install heading — collect until next heading of same or higher level
    const level = (lines[i].match(/^(#+)/) ?? ["", "#"])[1].length;
    const sectionLines = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      if (!inCodeBlock[j]) {
        const hm = lines[j].match(/^(#+)\s+/);
        if (hm && hm[1].length <= level) break;
      }
      sectionLines.push(lines[j]);
    }
    const section = sectionLines.join("\n").trim();
    if (section.length > 20) return section;
  }
  return null;
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const AGENT_ICON_TONES: Record<string, string> = {
  claude: "border-[#f2c8b2] bg-[#fff3ec]",
  codex: "border-[#c7efe2] bg-[#edfdf6]",
  gemini: "border-[#cfe2ff] bg-[#eef4ff]",
  cursor: "border-[#d8d2ff] bg-[#f1efff]",
  antigravity: "border-[#fde0cf] bg-[#fff4ed]",
  qoder: "border-[#d6f2dc] bg-[#eefcf1]",
  copilot: "border-[#d5e6ff] bg-[#eef5ff]",
  windsurf: "border-[#d8dcff] bg-[#f1f3ff]",
};

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk)
    return <span className="text-xs text-muted-foreground">unknown</span>;
  const color =
    risk === "safe"
      ? "text-primary"
      : risk === "low"
        ? "text-muted-foreground"
        : "text-destructive";
  const Icon =
    risk === "safe" ? ShieldCheck : risk === "low" ? Shield : ShieldAlert;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon size={12} />
      {risk}
    </span>
  );
}

function AuditSection({ audit }: { audit: SkillAuditInfo }) {
  return (
    <div className="space-y-2">
      {[
        { name: "Anthropic Trust Hub", data: audit.ath },
        { name: "Socket", data: audit.socket },
        { name: "Snyk", data: audit.snyk },
      ].map(({ name, data }) => (
        <div key={name} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{name}</span>
          <RiskBadge risk={data?.risk ?? null} />
        </div>
      ))}
      {audit.socket?.score != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Score</span>
          <span className="font-mono font-medium">
            {audit.socket.score}/100
          </span>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  selected,
  onSelect,
  index,
}: {
  item: MarketplaceItem;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  return (
    <button
      onClick={onSelect}
      aria-label={`View details for ${item.name}`}
      className={clsx(
        "animate-fade-in flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200",
        selected
          ? "border-ring bg-accent shadow-sm"
          : "border-border bg-card hover:border-ring/50 hover:bg-accent/50 hover:shadow-sm",
      )}
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      {item.icon_url && (
        <img
          src={item.icon_url}
          alt={item.name}
          loading="lazy"
          decoding="async"
          className="mt-0.5 h-8 w-8 shrink-0 rounded-lg"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{item.name}</span>
          {item.verified && (
            <BadgeCheck size={14} className="shrink-0 text-primary" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
          {item.description}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/60">
          {item.kind === "cli" && item.stars != null ? (
            <>
              <Star size={10} className="inline -mt-0.5 mr-0.5" />
              {formatInstalls(item.stars)}
            </>
          ) : (
            <>{formatInstalls(item.installs)} installs</>
          )}
          {item.categories.length > 0 &&
            ` · ${item.categories.slice(0, 2).join(", ")}`}
          {item.source && ` · ${item.source}`}
        </p>
      </div>
    </button>
  );
}

export default function MarketplacePage() {
  const {
    tab,
    setTab,
    query,
    setQuery,
    results,
    trending,
    loading,
    trendingLoading,
    search,
    loadTrending,
    selectedItem,
    selectItem,
    closePreview,
    previewContent,
    previewLoading,
    auditInfo,
    auditLoading,
    cliReadme,
    cliReadmeLoading,
    installing,
    install,
  } = useMarketplaceStore();
  const { agents, fetch: fetchAgents, agentOrder } = useAgentStore();
  const projects = useProjectStore((s) => s.projects);
  const rescanAndFetch = useExtensionStore((s) => s.rescanAndFetch);
  const extensions = useExtensionStore((s) => s.extensions);
  const [marketplaceProjectScope, setMarketplaceProjectScope] =
    useState<ConfigScope | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [justInstalled, setJustInstalled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installMode, setInstallMode] = useState<"git" | "local">("git");
  const detailPanelRef = useRef<HTMLDivElement>(null);

  const isItemInstalled = (
    item: MarketplaceItem,
    agentName: string,
    activeScope: ConfigScope,
  ) => {
    const key = marketplaceInstallKey(item.id, agentName, activeScope);
    if (installed.has(key)) return true;

    const targetKey = scopeKey(activeScope);

    return extensions.some((ext) => {
      if (!ext.agents.includes(agentName)) return false;

      if (item.kind === "skill") {
        if (!["skill", "plugin"].includes(ext.kind)) return false;
      } else {
        if (ext.kind !== item.kind) return false;
      }

      const extUrl =
        ext.install_meta?.url_resolved ??
        ext.install_meta?.url ??
        ext.source.url;
      let extSource = "";
      if (extUrl) {
        const match = extUrl.match(/github\.com\/([^/]+\/[^/]+)/);
        extSource = match ? match[1].replace(/\.git$/, "") : extUrl;
      }
      if (!extSource && ext.pack) extSource = ext.pack;

      // GitHub repo slugs are case-insensitive; marketplace normalizes to
      // lowercase while scanner preserves original casing. Compare lowered
      // on both sides to avoid false negatives.
      const itemSourceLower = item.source.toLowerCase();
      const matchSource =
        extSource.toLowerCase() === itemSourceLower ||
        (ext.pack ?? "").toLowerCase() === itemSourceLower;

      let nameMatches: boolean;
      if (item.kind === "skill") {
        // Match strictly by name. The scanner sometimes classifies individual
        // items in a collection repo (e.g. github/awesome-copilot) as kind=plugin,
        // so "same source URL + kind=plugin" doesn't reliably mean the whole repo
        // is installed — it could be just one sibling. See PR #21 discussion.
        const targetName =
          item.skill_id && item.skill_id.length > 0 ? item.skill_id : item.name;
        nameMatches = ext.name.toLowerCase() === targetName.toLowerCase();
      } else {
        nameMatches = ext.name.toLowerCase() === item.name.toLowerCase();
      }
      if (!nameMatches || !matchSource) return false;

      return scopeKey(ext.scope) === targetKey;
    });
  };

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const handleNestedWheel = useScrollPassthrough();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);
  useEffect(() => {
    loadTrending();
  }, [loadTrending]);
  useEffect(() => {
    if (selectedItem) detailPanelRef.current?.focus({ preventScroll: true });
  }, [selectedItem]);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setError(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      search();
    }, 300);
  };
  const handleInstall = async (
    item: MarketplaceItem,
    targetAgent: string | undefined,
    targetScope: ConfigScope,
  ) => {
    setError(null);
    try {
      const result = await install(item, targetAgent, targetScope);
      // Refresh extension store so audit page can resolve names immediately
      useExtensionStore.getState().fetch();
      const key = marketplaceInstallKey(
        item.id,
        targetAgent ?? "",
        targetScope,
      );
      setInstalled((prev) => new Set(prev).add(key));
      toast.success(
        result.was_update ? `${item.name} updated` : `${item.name} installed`,
      );
      // Trigger flash animation
      if (!prefersReducedMotion()) {
        setJustInstalled((prev) => new Set(prev).add(key));
        setTimeout(() => {
          setJustInstalled((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }, 500);
      }
    } catch (e) {
      setError(String(e));
      toast.error("Installation failed");
    }
  };
  const findMatchingInstances = (
    item: MarketplaceItem,
    agentName: string,
    targetScope: ConfigScope,
  ) => {
    const targetKey = scopeKey(targetScope);
    return extensions.filter((ext) => {
      if (!ext.agents.includes(agentName)) return false;
      if (scopeKey(ext.scope) !== targetKey) return false;

      if (item.kind === "skill") {
        if (!["skill", "plugin"].includes(ext.kind)) return false;
      } else if (ext.kind !== item.kind) {
        return false;
      }

      const extUrl =
        ext.install_meta?.url_resolved ??
        ext.install_meta?.url ??
        ext.source.url;
      let extSource = "";
      if (extUrl) {
        const match = extUrl.match(/github\.com\/([^/]+\/[^/]+)/);
        extSource = match ? match[1].replace(/\.git$/, "") : extUrl;
      }
      if (!extSource && ext.pack) extSource = ext.pack;

      const itemSourceLower = item.source.toLowerCase();
      const matchSource =
        extSource.toLowerCase() === itemSourceLower ||
        (ext.pack ?? "").toLowerCase() === itemSourceLower;
      if (!matchSource) return false;

      const targetName =
        item.kind === "skill" && item.skill_id && item.skill_id.length > 0
          ? item.skill_id
          : item.name;
      return ext.name.toLowerCase() === targetName.toLowerCase();
    });
  };
  const handleToggleMarketplaceInstall = async (
    item: MarketplaceItem,
    agentName: string,
    targetScope: ConfigScope,
  ) => {
    const matches = findMatchingInstances(item, agentName, targetScope);
    const isInstalled = matches.length > 0;
    if (!isInstalled) {
      await handleInstall(item, agentName, targetScope);
      return;
    }

    setError(null);
    try {
      await Promise.all(matches.map((ext) => api.deleteExtension(ext.id)));
      setInstalled((prev) => {
        const next = new Set(prev);
        next.delete(marketplaceInstallKey(item.id, agentName, targetScope));
        return next;
      });
      await rescanAndFetch();
      toast.success(`${item.name} 已从 ${agentName} 卸载`);
    } catch (e) {
      setError(String(e));
      toast.error("卸载失败");
    }
  };

  const detectedAgents = sortAgents(
    agents.filter((a) => a.detected),
    agentOrder,
  );
  const settingsAgents = sortAgents(agents, agentOrder);
  const globalInstallScope: ConfigScope = { type: "global" };
  const projectInstallAgents =
    selectedItem?.kind === "skill" && marketplaceProjectScope?.type === "project"
      ? settingsAgents.filter((agent) =>
          canInstallAtScope(agent.name, "skill", marketplaceProjectScope),
        )
      : [];
  const selectedProject =
    marketplaceProjectScope?.type === "project"
      ? projects.find((project) => project.path === marketplaceProjectScope.path) ?? {
          name: marketplaceProjectScope.name,
          path: marketplaceProjectScope.path,
        }
      : null;
  const selectedProjectPath =
    marketplaceProjectScope?.type === "project"
      ? marketplaceProjectScope.path
      : "";
  const displayItems = query.length >= 2 ? results : trending;
  const showTrending = query.length < 2;

  return (
    <div className="flex flex-1 flex-col min-h-0 -mb-6">
      {/* Fixed header */}
      <div className="shrink-0 space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight select-none">
              Marketplace
            </h2>
            <button
              onClick={() => {
                setInstallMode("git");
                setShowInstall(!showInstall || installMode !== "git");
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-accent hover:shadow-md"
            >
              <GitBranch size={12} />
              Install from Git
            </button>
            <button
              onClick={() => {
                setInstallMode("local");
                setShowInstall(!showInstall || installMode !== "local");
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-accent hover:shadow-md"
            >
              <FolderOpen size={12} />
              Install from Local
            </button>
          </div>
          <div className="flex rounded-lg border border-border">
            <button
              onClick={() => setTab("skill")}
              className={clsx(
                "flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors border-b-2",
                tab === "skill"
                  ? "bg-primary text-primary-foreground border-b-primary-foreground/50"
                  : "text-muted-foreground border-b-transparent hover:bg-accent",
              )}
            >
              <Package size={12} />
              Skills
            </button>
            <button
              onClick={() => setTab("cli")}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2",
                tab === "cli"
                  ? "bg-primary text-primary-foreground border-b-primary-foreground/50"
                  : "text-muted-foreground border-b-transparent hover:bg-accent",
              )}
            >
              <Terminal size={12} />
              Agent-first CLI
            </button>
            <button
              onClick={() => setTab("mcp")}
              className={clsx(
                "flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors border-b-2",
                tab === "mcp"
                  ? "bg-primary text-primary-foreground border-b-primary-foreground/50"
                  : "text-muted-foreground border-b-transparent hover:bg-accent",
              )}
            >
              <Server size={12} />
              MCP Servers
            </button>
          </div>
        </div>

        <InstallDialog
          open={showInstall}
          mode={installMode}
          onClose={() => setShowInstall(false)}
        />

        <div className="relative max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={
              tab === "skill"
                ? "Search skills..."
                : tab === "mcp"
                  ? "Search MCP servers..."
                  : "Search Agent-first CLIs..."
            }
            aria-label="Search marketplace"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-8 text-sm placeholder:text-muted-foreground transition-[background-color,border-color,box-shadow] duration-200 focus:border-ring focus:bg-background focus:shadow-md focus:outline-none"
          />
          {query && (
            <button
              onClick={() => handleQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <Hint id="marketplace-intro">
          Search for skills, MCP servers, and Agent-first CLIs to install across
          your Agents. Use 'Install from Git' to install from a Git URL, or
          'Install from Local' to install from a local directory.
        </Hint>
      </div>

      {/* Scrollable content */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-y-auto space-y-4 pb-4">
          {error && (
            <p className="text-sm text-destructive">{humanizeError(error)}</p>
          )}

          {showTrending && !trendingLoading && trending.length > 0 && (
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <TrendingUp size={14} className="text-primary" />
              <span>
                Trending{" "}
                {tab === "skill"
                  ? "Skills"
                  : tab === "mcp"
                    ? "MCP Servers"
                    : "Agent-first CLI"}
              </span>
            </div>
          )}

          {(loading || trendingLoading) && displayItems.length === 0 && (
            <div
              className="flex justify-center py-12"
              aria-live="polite"
              role="status"
            >
              <Loader2
                size={24}
                className="animate-spin text-muted-foreground"
              />
            </div>
          )}

          {!loading &&
            !trendingLoading &&
            displayItems.length === 0 &&
            query.length >= 2 && (
              <div className="py-8 px-6">
                <p className="text-sm font-medium text-foreground">
                  Nothing matched "{query}"
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try different keywords or browse the trending items below.
                </p>
              </div>
            )}

          <div className="grid gap-2">
            {displayItems.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                selected={selectedItem?.id === item.id}
                onSelect={() => selectItem(item)}
                index={i}
              />
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedItem && (
          <div className="absolute right-0 top-0 bottom-0 w-96 z-10">
            <div
              ref={detailPanelRef}
              tabIndex={-1}
              onWheel={(e) => e.stopPropagation()}
              className="animate-slide-in-right flex h-full flex-col rounded-xl border border-border bg-card shadow-sm outline-none"
            >
              {/* Fixed header */}
              <div className="shrink-0 flex items-start justify-between border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {selectedItem.icon_url && (
                      <img
                        src={selectedItem.icon_url}
                        alt={selectedItem.name}
                        loading="lazy"
                        decoding="async"
                        className="h-6 w-6 rounded"
                      />
                    )}
                    <h3 className="text-lg font-semibold">
                      {selectedItem.name}
                    </h3>
                    {selectedItem.verified && (
                      <BadgeCheck size={16} className="shrink-0 text-primary" />
                    )}
                  </div>
                  {selectedItem.source && (
                    <a
                      href={
                        selectedItem.repo_url ??
                        (selectedItem.kind === "mcp"
                          ? `https://smithery.ai/server/${selectedItem.source}`
                          : `https://github.com/${selectedItem.source}`)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {selectedItem.source}
                      <ExternalLink size={10} className="shrink-0" />
                    </a>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {selectedItem.kind === "cli" &&
                    selectedItem.stars != null ? (
                      <>
                        <Star size={10} className="inline -mt-0.5 mr-0.5" />
                        {formatInstalls(selectedItem.stars)}
                      </>
                    ) : (
                      <>{formatInstalls(selectedItem.installs)} installs</>
                    )}
                  </p>
                </div>
                <button
                  onClick={closePreview}
                  aria-label="Close details"
                  className="shrink-0 rounded-lg p-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
                {selectedItem.description && (
                  <p className="text-sm text-muted-foreground">
                    {selectedItem.description}
                  </p>
                )}

                {selectedItem.categories.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {selectedItem.categories.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {/* MCP install guidance */}
                {selectedItem.kind === "mcp" && (
                  <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm font-medium text-foreground">
                      Install this MCP server
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Visit Smithery for setup instructions, configuration
                      options, and connection details.
                    </p>
                    <a
                      href={`https://smithery.ai/server/${selectedItem.source}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Server size={12} />
                      Set up on Smithery
                      <ExternalLink size={10} />
                    </a>
                  </div>
                )}

                {/* CLI install guidance */}
                {selectedItem.kind === "cli" && (
                  <>
                    {selectedItem.repo_url && (
                      <a
                        href={selectedItem.repo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        View on GitHub
                        <ExternalLink size={10} />
                      </a>
                    )}
                    <div className="mt-4">
                      <h4 className="mb-2 border-b border-border pb-1 text-xs font-medium text-muted-foreground">
                        Installation Guide
                      </h4>
                      <div className="rounded-lg border border-border bg-card p-3">
                        {cliReadmeLoading ? (
                          <div className="flex justify-center py-6">
                            <Loader2
                              size={16}
                              className="animate-spin text-muted-foreground"
                            />
                          </div>
                        ) : cliReadme ? (
                          (() => {
                            const section = extractInstallSection(cliReadme);
                            return (
                              <pre
                                onWheel={handleNestedWheel}
                                className="whitespace-pre-wrap text-xs text-muted-foreground max-h-[40vh] overflow-y-auto"
                              >
                                {section ?? cliReadme.slice(0, 2000)}
                              </pre>
                            );
                          })()
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            No README available. Check the GitHub repository for
                            installation instructions.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Security Audit (skills only) */}
                {selectedItem.kind === "skill" && (
                  <div className="mt-4">
                    <h4 className="mb-2 border-b border-border pb-1 text-xs font-medium text-muted-foreground">
                      Security Audit
                    </h4>
                    <div className="rounded-lg border border-border bg-card p-3">
                      {auditLoading ? (
                        <div className="flex justify-center py-2">
                          <Loader2
                            size={14}
                            className="animate-spin text-muted-foreground"
                          />
                        </div>
                      ) : auditInfo ? (
                        <AuditSection audit={auditInfo} />
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No audit data available
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Install to agents */}
                {detectedAgents.length > 0 && selectedItem.kind === "skill" && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-baseline gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Install to Agent
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-1.5" aria-live="polite">
                      {detectedAgents.map((agent) => {
                        const key = marketplaceInstallKey(
                          selectedItem.id,
                          agent.name,
                          globalInstallScope,
                        );
                        const capabilityOk = canInstallAtScope(
                          agent.name,
                          "skill",
                          globalInstallScope,
                        );
                        const isInstalled = isItemInstalled(
                          selectedItem,
                          agent.name,
                          globalInstallScope,
                        );
                        const isFlashing = justInstalled.has(key);
                        const isInstallingThis = installing === key;
                        const isInstallingAny =
                          installing?.startsWith(`${selectedItem.id}:`) ?? false;
                        const disabled = isInstallingAny || !capabilityOk;
                        return (
                          <button
                            key={agent.name}
                            disabled={disabled}
                            aria-disabled={disabled}
                            title={
                              isInstalled
                                ? `从 ${agent.name} 移除`
                                : !capabilityOk
                                  ? `${agent.name} doesn't support installing this kind at this scope`
                                  : `安装到 ${agent.name}`
                            }
                            onClick={() =>
                              handleToggleMarketplaceInstall(
                                selectedItem,
                                agent.name,
                                globalInstallScope,
                              )
                            }
                            className={clsx(
                              "relative flex h-11 w-11 items-center justify-center rounded-full border transition-all disabled:cursor-not-allowed",
                              isFlashing
                                ? "border-primary/40 bg-primary/20 text-foreground shadow-sm"
                                : isInstalled
                                  ? `${AGENT_ICON_TONES[agent.name] ?? "border-border bg-muted/40"} text-foreground shadow-sm`
                                  : "border-border bg-muted/30 text-foreground hover:scale-[1.03] hover:border-border/60",
                              disabled && !isInstalled && "opacity-50",
                            )}
                          >
                            <div
                              className={clsx(
                                "flex h-6 w-6 items-center justify-center",
                                isInstalled ? "" : "grayscale opacity-40",
                              )}
                            >
                              {isInstallingThis ? (
                                <Loader2
                                  size={14}
                                  className="animate-spin text-muted-foreground"
                                />
                              ) : (
                                <AgentMascot name={agent.name} size={20} />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detectedAgents.length > 0 && selectedItem.kind === "skill" && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-baseline gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Install to Project
                      </h4>
                      {marketplaceProjectScope?.type === "project" && (
                        <span className="text-[10px] text-muted-foreground/70">
                          · {marketplaceProjectScope.name}
                        </span>
                      )}
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Target Project
                        </span>
                        <span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                          {projects.length} saved
                        </span>
                      </div>
                      <label className="group relative block">
                        <Folder
                          size={14}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground"
                        />
                        <select
                          value={selectedProjectPath}
                          onChange={(e) => {
                            const project = projects.find(
                              (item) => item.path === e.target.value,
                            );
                            setMarketplaceProjectScope(
                              project
                                ? {
                                    type: "project",
                                    name: project.name,
                                    path: project.path,
                                  }
                                : null,
                            );
                          }}
                          className="min-w-0 w-full appearance-none rounded-xl border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground shadow-sm transition-colors focus:border-ring focus:bg-background focus:outline-none"
                        >
                          <option value="">Select an existing project</option>
                          {projects.map((project) => (
                            <option key={project.path} value={project.path}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={14}
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                      </label>
                      <div className="mt-3 border-t border-border/60 pt-3">
                        {marketplaceProjectScope?.type !== "project" ? (
                          <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            Select a project first
                          </div>
                        ) : projectInstallAgents.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            No project-capable agents detected
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5" aria-live="polite">
                            {projectInstallAgents.map((agent) => {
                              const key = marketplaceInstallKey(
                                selectedItem.id,
                                agent.name,
                                marketplaceProjectScope,
                              );
                              const isInstalled = isItemInstalled(
                                selectedItem,
                                agent.name,
                                marketplaceProjectScope,
                              );
                              const isInstallingThis = installing === key;
                              const isInstallingAny =
                                installing?.startsWith(`${selectedItem.id}:`) ??
                                false;
                              const disabled = isInstallingAny;
                              return (
                                <button
                                  key={`project:${agent.name}`}
                                  type="button"
                                  disabled={disabled}
                                  aria-disabled={disabled}
                                  title={
                                    isInstalled
                                      ? `从 ${selectedProject?.name ?? marketplaceProjectScope.name} / ${agent.name} 移除`
                                      : `同步到 ${selectedProject?.name ?? marketplaceProjectScope.name} / ${agent.name}`
                                  }
                                  onClick={() =>
                                    handleToggleMarketplaceInstall(
                                      selectedItem,
                                      agent.name,
                                      marketplaceProjectScope,
                                    )
                                  }
                                  className={clsx(
                                    "relative flex h-11 w-11 items-center justify-center rounded-full border transition-all disabled:cursor-not-allowed",
                                    isInstalled
                                      ? `${AGENT_ICON_TONES[agent.name] ?? "border-border bg-muted/40"} shadow-sm`
                                      : "border-border bg-muted/30 hover:scale-[1.03] hover:border-border/60",
                                    isInstallingAny && !isInstalled && "opacity-60",
                                  )}
                                >
                                  <div
                                    className={clsx(
                                      "flex h-6 w-6 items-center justify-center",
                                      isInstalled ? "" : "grayscale opacity-40",
                                    )}
                                  >
                                    {isInstallingThis ? (
                                      <Loader2
                                        size={14}
                                        className="animate-spin text-muted-foreground"
                                      />
                                    ) : (
                                      <AgentMascot name={agent.name} size={20} />
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* SKILL.md content (skills only) */}
                {selectedItem.kind === "skill" && (
                  <div className="mt-4">
                    <h4 className="mb-2 border-b border-border pb-1 text-xs font-medium text-muted-foreground">
                      Documentation
                    </h4>
                    <div className="rounded-lg border border-border bg-card p-3">
                      {previewLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2
                            size={20}
                            className="animate-spin text-muted-foreground"
                          />
                        </div>
                      ) : previewContent ? (
                        <pre
                          onWheel={handleNestedWheel}
                          className="whitespace-pre-wrap text-xs text-muted-foreground max-h-[40vh] overflow-y-auto"
                        >
                          {previewContent}
                        </pre>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No preview available
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
