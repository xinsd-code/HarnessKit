import { NavLink } from "react-router-dom";
import { LayoutDashboard, Package, Shield, Bot, Settings, ShoppingBag } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Overview" },
  { to: "/extensions", icon: Package, label: "Extensions" },
  { to: "/marketplace", icon: ShoppingBag, label: "Marketplace" },
  { to: "/audit", icon: Shield, label: "Audit" },
  { to: "/agents", icon: Bot, label: "Agents" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col px-3 pb-5">
      {/* Top spacer for traffic lights */}
      <div className="h-12 shrink-0" />

      <div className="mb-6 px-3">
        <h1 className="text-lg font-bold tracking-tight text-sidebar-foreground">HarnessKit</h1>
        <p className="text-[11px] text-muted-foreground/70">v0.1.0</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-all duration-150",
                isActive
                  ? "bg-sidebar-accent/80 text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/60 font-medium hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )
            }
          >
            <Icon size={20} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
