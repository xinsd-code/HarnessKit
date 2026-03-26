import { NavLink } from "react-router-dom";
import { LayoutDashboard, Package, Shield, Bot, Settings } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Overview" },
  { to: "/extensions", icon: Package, label: "Extensions" },
  { to: "/audit", icon: Shield, label: "Audit" },
  { to: "/agents", icon: Bot, label: "Agents" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-zinc-800 bg-zinc-950 px-3 py-4">
      <div className="mb-8 px-3">
        <h1 className="text-lg font-bold text-zinc-100">HarnessKit</h1>
        <p className="text-xs text-zinc-500">v0.1.0</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
