import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectInstallPanel } from "@/components/shared/project-install-panel";

describe("ProjectInstallPanel", () => {
  it("shows the selected project and delegates row clicks", () => {
    const onProjectChange = vi.fn();
    const onInstall = vi.fn();

    render(
      <ProjectInstallPanel
        projects={[
          {
            id: "alpha",
            name: "alpha",
            path: "/projects/alpha",
            created_at: "2026-05-09T00:00:00.000Z",
            exists: true,
          },
          {
            id: "beta",
            name: "beta",
            path: "/projects/beta",
            created_at: "2026-05-09T00:00:00.000Z",
            exists: true,
          },
        ]}
        selectedProjectPath="/projects/alpha"
        onProjectChange={onProjectChange}
        selectedProjectName="alpha"
        agentItems={[
          {
            name: "claude",
            installed: false,
            onClick: onInstall,
            title: "Claude Code · 安装到项目",
          },
        ]}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select target project" }),
      {
        target: { value: "/projects/beta" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Claude Code · 安装到项目" }),
    );

    expect(onProjectChange).toHaveBeenCalledWith("/projects/beta");
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it("does not render a project selector for global-only kinds", () => {
    render(
      <ProjectInstallPanel
        projects={[]}
        selectedProjectPath=""
        onProjectChange={() => undefined}
        selectedProjectName={null}
        agentItems={[]}
        emptyText="Project install is unavailable"
      />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Project install is unavailable")).toBeTruthy();
  });
});
