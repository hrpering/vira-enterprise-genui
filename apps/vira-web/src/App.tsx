import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useMemo, useState } from "react";
import { activeRun, navigation, recentRuns } from "./data.js";
import { Button, Icon, MobileDrawer, StatusBadge } from "./components/ui.js";
import type { NavigationItem, Role, SurfaceState, Tone } from "./types.js";

const groupLabels: Record<NavigationItem["group"], string> = {
  workspace: "Workspace",
  operations: "Operations",
  build: "Build",
  admin: "Administration",
};

const stateCopy: Record<SurfaceState, { title: string; detail: string; tone: Tone }> = {
  ready: { title: "Live evidence connected", detail: "Updates are streaming from the durable run ledger.", tone: "positive" },
  loading: { title: "Loading workspace", detail: "Resolving exact application and release references…", tone: "info" },
  empty: { title: "Nothing needs action", detail: "New tasks and approvals will appear here.", tone: "neutral" },
  partial: { title: "Partial results", detail: "Some provider evidence has not arrived yet.", tone: "warning" },
  error: { title: "Request failed", detail: "No mutation was attempted. Retry when the service recovers.", tone: "negative" },
  uncertain: { title: "Outcome uncertain", detail: "Vira will not report success until postconditions are verified.", tone: "warning" },
  degraded: { title: "Degraded mode", detail: "Reads are available; protected writes are paused.", tone: "warning" },
  offline: { title: "You are offline", detail: "This view is cached. Mutations remain disabled.", tone: "negative" },
  reconnecting: { title: "Reconnecting", detail: "Evidence stream interrupted. Durable state is preserved.", tone: "info" },
};

function Navigation({ role, current, onSelect }: { readonly role: Role; readonly current: string; readonly onSelect: (id: string) => void }) {
  const visible = navigation.filter((item) => item.roles.includes(role));
  return (
    <div className="navigation-shell">
      <div className="brand-row"><span className="brand-mark">V</span><span><b>Vira</b><small>Control center</small></span></div>
      <nav aria-label="Primary navigation">
        {(["workspace", "operations", "build", "admin"] as const).map((group) => {
          const items = visible.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return <section className="nav-group" key={group} aria-labelledby={`nav-${group}`}>
            <h2 id={`nav-${group}`}>{groupLabels[group]}</h2>
            {items.map((item) => <button key={item.id} className="nav-item" data-active={current === item.id} onClick={() => onSelect(item.id)} aria-current={current === item.id ? "page" : undefined}>
              <span className="nav-glyph" aria-hidden="true">{item.label.slice(0, 1)}</span><span>{item.label}</span>{item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </button>)}
          </section>;
        })}
      </nav>
      <div className="identity-card"><span className="avatar">MC</span><span><b>Maya Chen</b><small>{role} · Acme Europe</small></span><button aria-label="Open account menu">•••</button></div>
    </div>
  );
}

function EvidenceRail() {
  return <aside className="evidence-panel" aria-labelledby="evidence-title">
    <div className="panel-heading"><div><p className="eyebrow">Exact evidence</p><h2 id="evidence-title">Run trace</h2></div><StatusBadge tone="warning">Waiting</StatusBadge></div>
    <ol className="evidence-rail">
      {activeRun.evidence.map((step, index) => <li key={step.id} className={`evidence-step evidence-step--${step.tone}`}>
        <span className="evidence-node">{step.tone === "positive" ? <Icon name="check" /> : index + 1}</span>
        <div><div className="evidence-label"><b>{step.label}</b><time>{step.timestamp}</time></div><p>{step.detail}</p><code>{step.ref}</code></div>
      </li>)}
    </ol>
    <div className="integrity-note"><Icon name="pulse" /><div><b>Ledger integrity verified</b><span>Checkpoint 14:32:11 · chain intact</span></div></div>
  </aside>;
}

function StateBanner({ state, onDismiss }: { readonly state: SurfaceState; readonly onDismiss: () => void }) {
  if (state === "ready") return null;
  const copy = stateCopy[state];
  return <div className={`state-banner state-banner--${copy.tone}`} role={state === "error" || state === "offline" ? "alert" : "status"}>
    <Icon name={copy.tone === "negative" || copy.tone === "warning" ? "alert" : "pulse"} /><div><b>{copy.title}</b><span>{copy.detail}</span></div><button onClick={onDismiss} aria-label="Dismiss status"><Icon name="close" /></button>
  </div>;
}

function RunsWorkspace({ state }: { readonly state: SurfaceState }) {
  return <>
    <div className="metric-grid" aria-label="Workspace summary">
      <article><span>Active runs</span><strong>3</strong><small><i className="dot dot--positive" />All workers healthy</small></article>
      <article><span>Awaiting approval</span><strong>2</strong><small>Oldest · 8 minutes</small></article>
      <article><span>Needs attention</span><strong>1</strong><small><i className="dot dot--warning" />Outcome uncertain</small></article>
      <article><span>Usage this period</span><strong>₺1,284</strong><small>68% of budget</small></article>
    </div>
    <div className="content-grid">
      <section className="run-list-card" aria-labelledby="runs-title">
        <div className="panel-heading"><div><p className="eyebrow">Today</p><h2 id="runs-title">Recent runs</h2></div><button className="text-button">View all <Icon name="chevron" /></button></div>
        {state === "loading" ? <div className="skeleton-stack" aria-label="Loading runs"><i /><i /><i /></div> : state === "empty" ? <div className="empty-state"><span className="empty-orbit" /><h3>No runs yet</h3><p>Start with an Application or describe an outcome in Chat.</p><Button>Open Chat</Button></div> : <div className="run-table" aria-label="Recent runs">
          {recentRuns.map((run) => <button key={run.id} className="run-row">
            <span className={`status-symbol status-symbol--${run.status}`} aria-hidden="true" />
            <span className="run-main"><b>{run.intent}</b><small>{run.application} · {run.actor}</small></span>
            <StatusBadge tone={run.status === "completed" ? "positive" : run.status === "uncertain" ? "warning" : "info"}>{run.status}</StatusBadge>
            <time>{run.startedAt}</time><Icon name="chevron" />
          </button>)}
        </div>}
      </section>
      <section className="attention-card" aria-labelledby="attention-title">
        <div className="panel-heading"><div><p className="eyebrow">Priority queue</p><h2 id="attention-title">Needs attention</h2></div><span className="count">1</span></div>
        <div className="attention-body"><span className="attention-icon"><Icon name="alert" /></span><StatusBadge tone="warning">Uncertain</StatusBadge><h3>Google Calendar removal</h3><p>Provider acknowledged the write, but the expected postcondition has not been observed.</p><dl><div><dt>Run</dt><dd><code>run_01J8WZ…</code></dd></div><div><dt>Last check</dt><dd>43s ago</dd></div></dl><Button className="button--secondary">Review evidence</Button></div>
      </section>
    </div>
  </>;
}

function GenericWorkspace({ current }: { readonly current: string }) {
  const item = navigation.find((entry) => entry.id === current);
  return <section className="generic-workspace"><div className="empty-orbit" /><p className="eyebrow">Operational surface</p><h2>{item?.label ?? "Workspace"}</h2><p>This surface uses exact tenant and Application references through the Vira BFF. No semantic authority lives in the web layer.</p><div className="generic-actions"><Button>Open primary view</Button><Button className="button--secondary">View diagnostics</Button></div></section>;
}

export function App() {
  const initialRoute = window.location.hash.slice(1) || "runs";
  const [current, setCurrent] = useState(initialRoute);
  const [role, setRole] = useState<Role>("operator");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [state, setState] = useState<SurfaceState>(navigator.onLine ? "ready" : "offline");
  const [searchOpen, setSearchOpen] = useState(false);
  const groups = useMemo(() => navigation.filter((item) => item.roles.includes(role)), [role]);

  useEffect(() => {
    const online = () => setState("reconnecting");
    const offline = () => setState("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((value) => !value); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const select = (id: string) => { setCurrent(id); window.location.hash = id; setMobileOpen(false); };
  const currentLabel = groups.find((item) => item.id === current)?.label ?? "Runs";

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="desktop-sidebar"><Navigation role={role} current={current} onSelect={select} /></aside>
    <MobileDrawer open={mobileOpen} onOpenChange={setMobileOpen}><Navigation role={role} current={current} onSelect={select} /></MobileDrawer>
    <div className="workspace-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu" /></button>
        <div className="breadcrumb"><span>Acme Europe</span><Icon name="chevron" /><b>{currentLabel}</b></div>
        <button className="command-search" onClick={() => setSearchOpen((value) => !value)} aria-expanded={searchOpen} aria-label="Search runs, tasks, and evidence"><Icon name="search" /><span>Search runs, tasks, evidence…</span><kbd>⌘ K</kbd></button>
        <label className="role-switcher"><span className="sr-only">Preview role</span><select value={role} onChange={(event) => { setRole(event.target.value as Role); setCurrent("runs"); }}><option value="operator">Operator</option><option value="builder">Builder</option><option value="admin">Admin</option></select></label>
        <Button className="button--primary"><Icon name="plus" /> New run</Button>
      </header>
      {searchOpen ? <div className="command-palette" role="search"><label><span className="sr-only">Search</span><Icon name="search" /><input autoFocus placeholder="Search exact IDs or natural language" /></label><small>Try “uncertain runs today” or paste an exact evidence reference.</small></div> : null}
      <StateBanner state={state} onDismiss={() => setState("ready")} />
      <main id="main-content" className="main-content" tabIndex={-1}>
        <div className="page-heading"><div><p className="eyebrow">Operational control</p><h1>{current === "runs" ? "Good afternoon, Maya." : currentLabel}</h1><p>{current === "runs" ? "Three runs are active. One outcome needs your attention." : "Exact scope, durable state, and evidence-first actions."}</p></div>
          {current === "runs" ? <Tabs.Root className="time-tabs" defaultValue="today"><Tabs.List aria-label="Time range"><Tabs.Trigger value="today">Today</Tabs.Trigger><Tabs.Trigger value="week">7 days</Tabs.Trigger><Tabs.Trigger value="month">30 days</Tabs.Trigger></Tabs.List><Tabs.Content className="sr-only" value="today">Showing today</Tabs.Content><Tabs.Content className="sr-only" value="week">Showing seven days</Tabs.Content><Tabs.Content className="sr-only" value="month">Showing thirty days</Tabs.Content></Tabs.Root> : null}
        </div>
        {current === "runs" ? <RunsWorkspace state={state} /> : <GenericWorkspace current={current} />}
        <details className="state-preview"><summary>Preview resilient states</summary><div>{(Object.keys(stateCopy) as SurfaceState[]).map((item) => <button key={item} onClick={() => setState(item)} data-active={state === item}>{item}</button>)}</div></details>
      </main>
    </div>
    <EvidenceRail />
  </div>;
}
