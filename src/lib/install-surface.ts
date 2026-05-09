import type {
  BuildInstallStateOptions,
  ConfigScope,
  Extension,
  InstallState,
  ResolveProjectSelectionOptions,
} from "./types";

function scopeMatches(
  extScope: ConfigScope,
  targetScope: ConfigScope,
): boolean {
  if (targetScope.type === "global") {
    return extScope.type === "global";
  }
  return extScope.type === "project" && extScope.path === targetScope.path;
}

export function resolveProjectSelection({
  contextScope,
  installedInstances,
  projects,
}: ResolveProjectSelectionOptions): ConfigScope | null {
  if (contextScope?.type === "project") {
    return contextScope;
  }

  for (const project of projects) {
    const hasInstalledInstance = installedInstances.some(
      (instance) =>
        instance.scope.type === "project" &&
        instance.scope.path === project.path,
    );
    if (hasInstalledInstance) {
      return {
        type: "project",
        name: project.name,
        path: project.path,
      };
    }
  }

  return null;
}

export function buildInstallState({
  agentName,
  instances,
  projectScope = null,
  surface,
}: BuildInstallStateOptions): InstallState {
  const matchingInstances = instances.filter(
    (instance) =>
      instance.agents.includes(agentName) &&
      (instance.scope.type === "global" ||
        projectScope == null ||
        scopeMatches(instance.scope, projectScope) ||
        instance.scope.type === "project"),
  );
  const globalInstances = matchingInstances.filter(
    (instance) => instance.scope.type === "global",
  );
  const projectInstances =
    projectScope?.type === "project"
      ? matchingInstances.filter(
          (instance) =>
            instance.scope.type === "project" &&
            instance.scope.path === projectScope.path,
        )
      : matchingInstances.filter((instance) => instance.scope.type === "project");
  const globalInstalled = globalInstances.length > 0;
  const projectInstalled = projectInstances.length > 0;

  if (
    (surface === "local-hub" || surface === "extension-list") &&
    projectInstalled &&
    !globalInstalled
  ) {
    return {
      globalInstalled,
      projectInstalled,
      installed: true,
      globalInstances,
      projectInstances,
      listAction: "open-detail",
    };
  }

  const installed =
    projectScope?.type === "project"
      ? projectInstalled || globalInstalled
      : globalInstalled || projectInstalled;

  return {
    globalInstalled,
    projectInstalled,
    installed,
    globalInstances,
    projectInstances,
    listAction:
      surface === "local-hub" || surface === "extension-list"
        ? globalInstalled
          ? "uninstall"
          : "install"
        : installed
          ? "uninstall"
          : "install",
  };
}

export function getInstallSourceInstance(
  instances: Extension[],
  targetScope: ConfigScope,
): Extension | null {
  if (targetScope.type === "project") {
    return (
      instances.find(
        (instance) =>
          instance.scope.type === "project" &&
          instance.scope.path === targetScope.path,
      ) ??
      instances.find((instance) => instance.scope.type === "global") ??
      instances[0] ??
      null
    );
  }

  return (
    instances.find((instance) => instance.scope.type === "global") ??
    instances[0] ??
    null
  );
}
