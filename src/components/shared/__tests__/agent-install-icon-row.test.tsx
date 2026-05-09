import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentInstallIconRow } from "@/components/shared/agent-install-icon-row";

describe("AgentInstallIconRow", () => {
  it("renders installed, pending, disabled, and empty states", () => {
    const onClick = vi.fn();
    render(
      <AgentInstallIconRow
        items={[
          {
            name: "claude",
            installed: true,
            onClick,
            title: "Claude Code · 点击移除全局安装",
          },
          { name: "codex", pending: true, title: "Codex · 安装中" },
          { name: "gemini", disabled: true, title: "Gemini CLI · 当前不可添加" },
        ]}
        emptyText="No agents"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Claude Code · 点击移除全局安装" }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Codex · 安装中" }).disabled,
    ).toBe(true);
    expect(screen.queryByText("No agents")).toBeNull();
  });
});
