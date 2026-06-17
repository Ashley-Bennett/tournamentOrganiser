// Dev-only console helpers. Called once from main.tsx in development.

type Fiber = {
  return?: Fiber | null;
  child?: Fiber | null;
  sibling?: Fiber | null;
  type?: unknown;
  memoizedProps?: Record<string, unknown>;
  memoizedState?: FiberState | null;
  stateNode?: unknown;
};

type FiberState = {
  memoizedState?: unknown;
  next?: FiberState | null;
  queue?: { dispatch?: unknown };
};

function getFiberFromDom(el: Element): Fiber | null {
  const key = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
  );
  return key ? (el as unknown as Record<string, Fiber>)[key] : null;
}

function getComponentFiber(el: Element): Fiber | null {
  let fiber = getFiberFromDom(el);
  while (fiber) {
    if (typeof fiber.type === "function") return fiber;
    fiber = fiber.return ?? null;
  }
  return null;
}

// ─── whichComponent ──────────────────────────────────────────────────────────

function whichComponent(el?: Element | null): void {
  if (!el) {
    console.info("%c[devTools] usage: whichComponent($0)", "color:#888");
    return;
  }

  let fiber = getFiberFromDom(el);
  const names: string[] = [];
  while (fiber) {
    const { type } = fiber;
    if (typeof type === "function" && (type as { name?: string }).name) {
      names.push((type as { name: string }).name);
    }
    fiber = fiber.return ?? null;
  }

  if (!names.length) {
    console.warn("[devTools] No React components found on this element.");
    return;
  }

  console.groupCollapsed(
    `%c${names[0]}  %c← ${el.tagName.toLowerCase()}`,
    "color:#4ade80;font-weight:bold",
    "color:#888;font-weight:normal"
  );
  console.log("Component stack (inner → outer):");
  names.forEach((name, i) => console.log(`${"  ".repeat(i + 1)}${name}`));
  console.log("DOM element:", el);
  console.groupEnd();
}

// ─── logProps ────────────────────────────────────────────────────────────────

function logProps(el?: Element | null): void {
  if (!el) {
    console.info("%c[devTools] usage: logProps($0)", "color:#888");
    return;
  }
  const fiber = getComponentFiber(el);
  if (!fiber) {
    console.warn("[devTools] No React component found on this element.");
    return;
  }
  const name = (fiber.type as { name?: string })?.name ?? "Unknown";
  console.group(`%c${name} props`, "color:#60a5fa;font-weight:bold");
  console.log(fiber.memoizedProps ?? {});
  console.groupEnd();
}

// ─── logState ────────────────────────────────────────────────────────────────

function logState(el?: Element | null): void {
  if (!el) {
    console.info("%c[devTools] usage: logState($0)", "color:#888");
    return;
  }
  const fiber = getComponentFiber(el);
  if (!fiber) {
    console.warn("[devTools] No React component found on this element.");
    return;
  }
  const name = (fiber.type as { name?: string })?.name ?? "Unknown";

  const hooks: unknown[] = [];
  let node = fiber.memoizedState;
  while (node) {
    hooks.push(node.memoizedState);
    node = node.next ?? null;
  }

  if (!hooks.length) {
    console.info(`%c${name} has no hook state`, "color:#888");
    return;
  }

  console.group(`%c${name} state (${hooks.length} hook${hooks.length > 1 ? "s" : ""})`, "color:#f472b6;font-weight:bold");
  hooks.forEach((val, i) => console.log(`hook[${i}]`, val));
  console.groupEnd();
}

// ─── highlight ───────────────────────────────────────────────────────────────

const HIGHLIGHT_ATTR = "data-dev-highlight";

function highlight(componentName: string): void {
  // Clear previous highlights
  document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((el) => {
    (el as HTMLElement).style.removeProperty("outline");
    (el as HTMLElement).style.removeProperty("outline-offset");
    el.removeAttribute(HIGHLIGHT_ATTR);
  });

  if (!componentName) {
    console.info("%c[devTools] usage: highlight('ComponentName')  — pass '' to clear", "color:#888");
    return;
  }

  let count = 0;
  const colors = ["#f472b6", "#60a5fa", "#4ade80", "#facc15", "#fb923c"];

  function walk(fiber: Fiber | null | undefined): void {
    if (!fiber) return;
    const typeName = typeof fiber.type === "function"
      ? (fiber.type as { name?: string }).name
      : null;

    if (typeName === componentName && fiber.stateNode instanceof Element) {
      const el = fiber.stateNode as HTMLElement;
      const color = colors[count % colors.length];
      el.style.outline = `2px solid ${color}`;
      el.style.outlineOffset = "2px";
      el.setAttribute(HIGHLIGHT_ATTR, componentName);
      count++;
    }

    walk(fiber.child);
    walk(fiber.sibling);
  }

  // Get root fiber
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  const rootFiber = getFiberFromDom(rootEl);
  walk(rootFiber?.child);

  if (count === 0) {
    console.warn(`[devTools] No mounted instances of "${componentName}" found.`);
  } else {
    console.info(
      `%c[devTools] Highlighted ${count} instance${count > 1 ? "s" : ""} of ${componentName}. Call highlight('') to clear.`,
      "color:#4ade80"
    );
  }
}

// ─── findComponent ───────────────────────────────────────────────────────────

function findComponent(componentName: string): Element[] {
  if (!componentName) {
    console.info("%c[devTools] usage: findComponent('ComponentName')", "color:#888");
    return [];
  }

  const results: Element[] = [];

  function walk(fiber: Fiber | null | undefined): void {
    if (!fiber) return;
    const typeName = typeof fiber.type === "function"
      ? (fiber.type as { name?: string }).name
      : null;
    if (typeName === componentName && fiber.stateNode instanceof Element) {
      results.push(fiber.stateNode);
    }
    walk(fiber.child);
    walk(fiber.sibling);
  }

  const rootEl = document.getElementById("root");
  if (!rootEl) return [];
  const rootFiber = getFiberFromDom(rootEl);
  walk(rootFiber?.child);

  if (!results.length) {
    console.warn(`[devTools] No mounted instances of "${componentName}" found.`);
  } else {
    console.info(`%c[devTools] Found ${results.length} instance${results.length > 1 ? "s" : ""} of ${componentName}`, "color:#4ade80");
    results.forEach((el, i) => console.log(`  [${i}]`, el));
  }

  return results;
}

// ─── logQuery (Supabase /rest/v1 interceptor) ────────────────────────────────

let queryLoggerActive = false;

function logQuery(enable = true): void {
  if (!enable) {
    queryLoggerActive = false;
    console.info("%c[devTools] Supabase query logging disabled", "color:#888");
    return;
  }
  if (queryLoggerActive) {
    console.info("%c[devTools] Supabase query logging already active", "color:#888");
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const [input, init] = args;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

    if (queryLoggerActive && url.includes("/rest/v1/")) {
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const urlObj = new URL(url);
      const table = urlObj.pathname.replace(/.*\/rest\/v1\//, "");
      const params = Object.fromEntries(urlObj.searchParams.entries());

      const start = performance.now();
      const res = await originalFetch(...args);
      const ms = (performance.now() - start).toFixed(1);
      const clone = res.clone();

      clone.json().then((data) => {
        const rows = Array.isArray(data) ? data.length : "?";
        console.groupCollapsed(
          `%c${method} %c${table}  %c${rows} rows  %c${ms}ms`,
          "color:#facc15;font-weight:bold",
          "color:#60a5fa;font-weight:bold",
          "color:#4ade80",
          "color:#888"
        );
        if (Object.keys(params).length) console.log("params", params);
        if (init?.body) {
          try { console.log("body", JSON.parse(init.body as string)); } catch { /* non-JSON body */ }
        }
        console.log("response", data);
        console.groupEnd();
      }).catch(() => { /* non-JSON response */ });

      return res;
    }

    return originalFetch(...args);
  };

  queryLoggerActive = true;
  console.info(
    "%c[devTools] Supabase query logging enabled\n%cAll /rest/v1/ requests will be logged. Call logQuery(false) to stop.",
    "color:#4ade80;font-weight:bold",
    "color:#aaa"
  );
}

// ─── install ─────────────────────────────────────────────────────────────────

export function installDevTools(): void {
  const g = window as unknown as Record<string, unknown>;
  g.whichComponent = whichComponent;
  g.logProps = logProps;
  g.logState = logState;
  g.highlight = highlight;
  g.findComponent = findComponent;
  g.logQuery = logQuery;

  console.info(
    "%c[devTools] installed\n" +
    "%c  whichComponent($0)        — component name + stack\n" +
    "  logProps($0)               — props of the nearest component\n" +
    "  logState($0)               — hook state of the nearest component\n" +
    "  highlight('Name')          — outline every instance on the page\n" +
    "  findComponent('Name')      — return DOM nodes for every instance\n" +
    "  logQuery()                 — log all Supabase REST queries",
    "color:#4ade80;font-weight:bold",
    "color:#aaa"
  );
}
