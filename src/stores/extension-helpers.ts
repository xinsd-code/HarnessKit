import type { Extension, ExtensionKind, GroupedExtension } from "@/lib/types";
import {
  deriveExtensionUrl,
  extensionGroupKey,
  extensionListGroupKey,
  logicalExtensionName,
  sortAgentNames,
  usesLooseLogicalAssetIdentity,
} from "@/lib/types";
import type { ScopeValue } from "@/stores/scope-store";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function deduplicatePermissions(
  perms: Extension["permissions"],
): Extension["permissions"] {
  const merged = new Map<string, Set<string>>();
  for (const p of perms) {
    const values =
      "paths" in p
        ? p.paths
        : "domains" in p
          ? p.domains
          : "commands" in p
            ? p.commands
            : "engines" in p
              ? p.engines
              : "keys" in p
                ? p.keys
                : [];
    const existing = merged.get(p.type) ?? new Set<string>();
    for (const v of values) existing.add(v);
    merged.set(p.type, existing);
  }
  const result: Extension["permissions"] = [];
  for (const [type, values] of merged) {
    const arr = [...values].sort();
    switch (type) {
      case "filesystem":
        result.push({ type, paths: arr });
        break;
      case "network":
        result.push({ type, domains: arr });
        break;
      case "shell":
        result.push({ type, commands: arr });
        break;
      case "database":
        result.push({ type, engines: arr });
        break;
      case "env":
        result.push({ type, keys: arr });
        break;
    }
  }
  return result;
}

function deduplicateExtensionsById(extensions: Extension[]): Extension[] {
  const seen = new Set<string>();
  const result: Extension[] = [];
  for (const ext of extensions) {
    if (seen.has(ext.id)) continue;
    seen.add(ext.id);
    result.push(ext);
  }
  return result;
}

function buildGroupedExtension(
  key: string,
  instances: Extension[],
): GroupedExtension {
  const dedupedInstances = deduplicateExtensionsById(instances);
  const first = dedupedInstances[0];
  return {
    groupKey: key,
    name: first.name,
    kind: first.kind,
    description: first.description,
    source: first.source,
    agents: sortAgentNames([
      ...new Set(dedupedInstances.flatMap((e) => e.agents)),
    ]),
    tags: [...new Set(dedupedInstances.flatMap((e) => e.tags))],
    pack: dedupedInstances.find((e) => e.pack)?.pack ?? null,
    permissions: deduplicatePermissions(
      dedupedInstances.flatMap((e) => e.permissions),
    ),
    enabled: dedupedInstances.some((e) => e.enabled),
    trust_score: dedupedInstances.reduce<number | null>(
      (min, e) =>
        e.trust_score != null
          ? min != null
            ? Math.min(min, e.trust_score)
            : e.trust_score
          : min,
      null,
    ),
    installed_at: dedupedInstances.reduce(
      (earliest, e) =>
        e.installed_at < earliest ? e.installed_at : earliest,
      first.installed_at,
    ),
    updated_at: dedupedInstances.reduce(
      (latest, e) => (e.updated_at > latest ? e.updated_at : latest),
      first.updated_at,
    ),
    instances: dedupedInstances,
  };
}

export function buildGroups(extensions: Extension[]): GroupedExtension[] {
  const uniqueExtensions = deduplicateExtensionsById(extensions);
  // Pre-pass: index URL-keyed groups by (kind, logical name) so a sourceless
  // instance (e.g. a project copy rediscovered from disk without install
  // metadata) can attach to its marketplace-installed/global sibling instead
  // of forming a separate row. Only redirect when there is exactly one such
  // sibling — multiple distinct developers for the same logical asset means
  // we can't safely decide which one a sourceless row belongs to.
  const urlSiblings = new Map<string, Set<string>>();
  for (const ext of uniqueExtensions) {
    if (usesLooseLogicalAssetIdentity(ext)) continue;
    if (deriveExtensionUrl(ext) == null) continue;
    const sk = `${ext.kind}\0${logicalExtensionName(ext)}`;
    const keys = urlSiblings.get(sk) ?? new Set<string>();
    keys.add(extensionGroupKey(ext));
    urlSiblings.set(sk, keys);
  }

  const map = new Map<string, Extension[]>();
  for (const ext of uniqueExtensions) {
    let key = extensionListGroupKey(ext);
    if (!usesLooseLogicalAssetIdentity(ext) && deriveExtensionUrl(ext) == null) {
      const sk = `${ext.kind}\0${logicalExtensionName(ext)}`;
      const siblings = urlSiblings.get(sk);
      if (siblings?.size === 1) {
        key = siblings.values().next().value as string;
      } else {
        key = `${ext.kind}\0${logicalExtensionName(ext)}\0(sourceless)`;
      }
    }
    const list = map.get(key);
    if (list) list.push(ext);
    else map.set(key, [ext]);
  }
  const groups: GroupedExtension[] = [];
  for (const [key, instances] of map) {
    groups.push(buildGroupedExtension(key, instances));
  }
  const merged = new Map<string, GroupedExtension>();
  for (const group of groups) {
    // Merge by the logical asset identity only. A single extension can exist
    // globally and in one or more projects, or across multiple agents, but it
    // should still render as one row in Extensions with aggregated agents and
    // instances.
    const mergeKey = group.groupKey;
    const existing = merged.get(mergeKey);
    if (!existing) {
      merged.set(mergeKey, group);
      continue;
    }
    merged.set(
      mergeKey,
      buildGroupedExtension(mergeKey, [
        ...existing.instances,
        ...group.instances,
      ]),
    );
  }
  return [...merged.values()];
}

function buildCliLookup(groups: GroupedExtension[]): {
  cliIds: Set<string>;
  cliPacks: Set<string>;
  hasLarkCli: boolean;
} {
  const cliIds = new Set<string>();
  const cliPacks = new Set<string>();
  let hasLarkCli = false;
  for (const group of groups) {
    if (group.kind !== "cli") continue;
    for (const instance of group.instances) {
      cliIds.add(instance.id);
    }
    if (group.pack) cliPacks.add(group.pack);
    if (
      group.name === "Lark / Feishu CLI" ||
      group.pack === "larksuite/cli" ||
      group.instances.some((instance) =>
        instance.source.url?.includes("larksuite/cli"),
      )
    ) {
      hasLarkCli = true;
    }
  }
  return { cliIds, cliPacks, hasLarkCli };
}

function isLarkCliSkillGroup(group: GroupedExtension): boolean {
  if (group.kind !== "skill") return false;
  const groupName = group.name.toLowerCase();
  if (groupName.includes("lark shared") || groupName.startsWith("lark-")) {
    return true;
  }
  return group.instances.some(
    (instance) =>
      instance.pack === "larksuite/cli" ||
      instance.source.url?.includes("larksuite/cli"),
  );
}

export function isCliChildSkillGroup(
  group: GroupedExtension,
  groups: GroupedExtension[],
): boolean {
  if (group.kind !== "skill") return false;
  const { cliIds, cliPacks, hasLarkCli } = buildCliLookup(groups);
  return group.instances.some(
    (instance) =>
      (instance.cli_parent_id != null && cliIds.has(instance.cli_parent_id)) ||
      (instance.pack != null && cliPacks.has(instance.pack)),
  ) || (hasLarkCli && isLarkCliSkillGroup(group));
}

export function filterSkillTabGroups(
  groups: GroupedExtension[],
): GroupedExtension[] {
  return groups.filter((group) => !isCliChildSkillGroup(group, groups));
}

/** Find all child extensions of a CLI group (by cli_parent_id or matching pack).
 *  When one instance of a group matches, all sibling instances are included
 *  so that toggle/delete affects every agent the extension is installed on. */
export function findCliChildren(
  extensions: Extension[],
  cliId: string | undefined,
  cliPack: string | null,
): Extension[] {
  // First pass: find groupKeys of matching extensions
  const matchedGroupKeys = new Set<string>();
  for (const e of extensions) {
    if (e.kind === "cli") continue;
    if (
      (cliId && e.cli_parent_id === cliId) ||
      (cliPack && e.pack === cliPack)
    ) {
      matchedGroupKeys.add(extensionListGroupKey(e));
    }
  }
  // Second pass: return ALL extensions belonging to matched groups
  return extensions.filter(
    (e) => e.kind !== "cli" && matchedGroupKeys.has(extensionListGroupKey(e)),
  );
}

/** Expand selected groupKeys into the underlying extension IDs. */
export function expandGroupKeys(
  groups: GroupedExtension[],
  keys: Set<string>,
): string[] {
  return groups
    .filter((g) => keys.has(g.groupKey))
    .flatMap((g) => g.instances.map((e) => e.id));
}

// ---------------------------------------------------------------------------
// Memoized accessors (module-level cache)
// ---------------------------------------------------------------------------

// Simple reference-equality memoization for grouped() —
// recomputes only when the extensions array reference changes.
let _cachedGroups: GroupedExtension[] = [];
let _cachedExtRef: Extension[] = [];

// Memoization for filtered() — avoids re-filtering on every render call.
let _cachedFiltered: GroupedExtension[] = [];
let _cachedFilterKey = "";
let _cachedFilterGroupsRef: GroupedExtension[] = [];

export function getCachedGroups(extensions: Extension[]): GroupedExtension[] {
  if (extensions !== _cachedExtRef) {
    _cachedExtRef = extensions;
    _cachedGroups = buildGroups(extensions);
  }
  return _cachedGroups;
}

export function getCachedFiltered(
  groups: GroupedExtension[],
  kindFilter: ExtensionKind | null,
  agentFilter: string | null,
  packFilter: string | null,
  tagFilter: string | null,
  searchQuery: string,
  scope: ScopeValue,
  ignoreScope = false,
): GroupedExtension[] {
  // Memoize: skip recomputation if inputs haven't changed
  const scopeKeyForCache =
    ignoreScope
      ? "all"
      : scope.type === "all"
        ? "all"
        : scope.type === "global"
          ? "global"
          : `project:${scope.path}`;
  const key = `${groups.length}|${kindFilter}|${agentFilter}|${packFilter}|${tagFilter}|${searchQuery}|${scopeKeyForCache}`;
  if (key === _cachedFilterKey && groups === _cachedFilterGroupsRef) {
    return _cachedFiltered;
  }
  let result = groups;
  if (kindFilter) {
    result = result.filter((g) => g.kind === kindFilter);
    if (kindFilter === "skill") {
      result = result.filter((group) => !isCliChildSkillGroup(group, groups));
    }
  }
  if (agentFilter) {
    result = result.filter((g) => g.agents.includes(agentFilter));
  }
  if (packFilter) {
    result = result.filter((g) => g.pack === packFilter);
  }
  if (tagFilter) {
    result = result.filter((g) => g.tags.includes(tagFilter));
  }
  if (!ignoreScope && scope.type !== "all") {
    const targetKey = scope.type === "global" ? "global" : scope.path;
    if (scope.type === "project" && agentFilter) {
      // Project + agent filter: include project instances AND global instances
      // belonging to the filtered agent.
      result = result.filter((g) =>
        g.instances.some((i) => {
          const instKey =
            i.scope.type === "global" ? "global" : i.scope.path;
          return (
            instKey === targetKey ||
            (i.scope.type === "global" && i.agents.includes(agentFilter))
          );
        }),
      );
      // Sort: groups with at least one project instance first
      result = [...result].sort((a, b) => {
        const aProj = a.instances.some(
          (i) =>
            i.scope.type === "project" && i.scope.path === targetKey,
        );
        const bProj = b.instances.some(
          (i) =>
            i.scope.type === "project" && i.scope.path === targetKey,
        );
        if (aProj && !bProj) return -1;
        if (!aProj && bProj) return 1;
        return 0;
      });
    } else {
      result = result.filter((g) =>
        g.instances.some((i) => {
          const instKey =
            i.scope.type === "global" ? "global" : i.scope.path;
          return instKey === targetKey;
        }),
      );
    }
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q),
    );
  }
  _cachedFilterKey = key;
  _cachedFilterGroupsRef = groups;
  _cachedFiltered = result;
  return result;
}
