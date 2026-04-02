import type { TabId } from "../types";
import { activeTab } from "../hooks/useStore";
import { t } from "../hooks/useI18n";

const TABS: { id: TabId; key: string }[] = [
  { id: "print", key: "print" },
  { id: "settings", key: "settings" },
  { id: "about", key: "about" },
];

export function Navigation() {
  const tr = t.value;
  const current = activeTab.value;

  return (
    <nav class="nav-tabs">
      {TABS.map(({ id, key }) => (
        <button
          key={id}
          class={`nav-tab ${current === id ? "active" : ""}`}
          onClick={() => (activeTab.value = id)}
        >
          {tr(key)}
        </button>
      ))}
    </nav>
  );
}
