import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/app-shell";
import OverviewPage from "./pages/overview";
import ExtensionsPage from "./pages/extensions";
import AuditPage from "./pages/audit";
import AgentsPage from "./pages/agents";
import SettingsPage from "./pages/settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="extensions" element={<ExtensionsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
