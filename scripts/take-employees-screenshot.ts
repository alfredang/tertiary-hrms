/**
 * Employees Screenshot Generator (Mock HTML approach)
 *
 * Renders a pixel-accurate mock of the Employees page using anonymised
 * test data — no login, no real employee names exposed.
 *
 * Usage:
 *   npx tsx scripts/take-employees-screenshot.ts
 *
 * Output:
 *   screenshots/raw/04-employees.png          — clean 1290×2796
 *   screenshots/with-headers/04-employees.png — with gradient marketing banner
 */

import { chromium, type BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";

const VIEWPORT = { width: 430, height: 932 };
const DEVICE_SCALE_FACTOR = 3;
const HEADER_HEIGHT_CSS = 80;

// ── SVG icon helpers (Lucide paths, inlined to avoid any deps) ─────────────

const ICON = {
  menu: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  chevron: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  plus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  building: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`,
  mail: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  // Bottom nav
  dashboard: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="12" rx="1"/></svg>`,
  clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  receipt: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M12 16H8"/></svg>`,
  dollar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
};

// ── Mock employee data ─────────────────────────────────────────────────────

interface MockEmployee {
  initials: string;
  name: string;
  statusLabel: "Active" | "On Leave";
  statusClass: "active" | "on-leave";
  role: "Admin" | "Staff";
  position: string;
  department: string;
  email: string;
}

const EMPLOYEES: MockEmployee[] = [
  {
    initials: "TS",
    name: "Test Staff",
    statusLabel: "Active",
    statusClass: "active",
    role: "Staff",
    position: "Course Coordinator",
    department: "Operations",
    email: "staff@tertiaryinfotech.com",
  },
  {
    initials: "T2",
    name: "Test Staff 2",
    statusLabel: "Active",
    statusClass: "active",
    role: "Staff",
    position: "Trainer",
    department: "Education",
    email: "staff2@tertiaryinfotech.com",
  },
  {
    initials: "AW",
    name: "Alice Wong",
    statusLabel: "Active",
    statusClass: "active",
    role: "Staff",
    position: "Executive Assistant",
    department: "Administration",
    email: "a.wong@tertiaryinfotech.com",
  },
  {
    initials: "ML",
    name: "Marcus Lim",
    statusLabel: "On Leave",
    statusClass: "on-leave",
    role: "Staff",
    position: "IT Support",
    department: "Technology",
    email: "m.lim@tertiaryinfotech.com",
  },
  {
    initials: "SC",
    name: "Sarah Chen",
    statusLabel: "Active",
    statusClass: "active",
    role: "Staff",
    position: "Accounts Manager",
    department: "Finance",
    email: "s.chen@tertiaryinfotech.com",
  },
];

// ── Card renderer ──────────────────────────────────────────────────────────

function renderCard(emp: MockEmployee): string {
  const statusBadgeClass =
    emp.statusClass === "active" ? "badge-active" : "badge-on-leave";
  const roleBadgeClass = emp.role === "Admin" ? "badge-admin" : "badge-staff";

  return `
    <div class="card">
      <div class="card-top">
        <div class="card-avatar">
          ${emp.initials}
          <span class="status-dot ${emp.statusClass}"></span>
        </div>
        <div class="card-info">
          <div class="card-name">${emp.name}</div>
          <div class="badges">
            <span class="badge ${statusBadgeClass}">${emp.statusLabel}</span>
            <span class="badge ${roleBadgeClass}">${emp.role}</span>
            <span class="badge badge-outline">${emp.position}</span>
          </div>
        </div>
      </div>
      <div class="card-meta">
        <div class="meta-row">
          <span class="meta-icon">${ICON.building}</span>
          ${emp.department}
        </div>
        <div class="meta-row">
          <span class="meta-icon">${ICON.mail}</span>
          ${emp.email}
        </div>
      </div>
    </div>`;
}

// ── Full mock HTML ─────────────────────────────────────────────────────────

function buildMockHtml(): string {
  const cards = EMPLOYEES.map(renderCard).join("\n");
  const count = EMPLOYEES.length;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=430">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      background: #09090b;
      color: #fff;
      width: 430px;
      height: 932px;
      overflow: hidden;
      position: relative;
    }

    /* ── Top header bar ── */
    .app-header {
      position: fixed; top: 0; left: 0; right: 0;
      height: 64px;
      background: #09090b;
      border-bottom: 1px solid #1f2937;
      display: flex; align-items: center;
      padding: 0 16px;
      z-index: 40;
    }
    .header-left { display: flex; align-items: center; gap: 12px; flex: 1; }
    .header-right { display: flex; align-items: center; }
    .menu-btn {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      color: #d1d5db; background: transparent; border: none; border-radius: 6px;
    }
    .header-page-title { font-size: 18px; font-weight: 600; color: #fff; }
    .user-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: #4f46e5;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; color: #fff;
    }

    /* ── Scrollable content ── */
    .content {
      margin-top: 64px;
      margin-bottom: 57px;
      padding: 20px 16px 16px;
      height: calc(932px - 64px - 57px);
      overflow: hidden;
    }

    /* Page heading */
    .page-heading { margin-bottom: 20px; }
    .page-heading h1 { font-size: 24px; font-weight: 700; color: #fff; }
    .page-heading p { font-size: 14px; color: #9ca3af; margin-top: 4px; }

    /* Filters */
    .filters { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }

    .search-wrap { position: relative; }
    .search-icon-pos {
      position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
      color: #6b7280; pointer-events: none;
      display: flex; align-items: center;
    }
    .search-input {
      width: 100%; height: 38px;
      background: #09090b; border: 1px solid #374151; border-radius: 6px;
      padding: 0 12px 0 32px;
      font-size: 13px; color: #6b7280;
    }

    .select-row { display: flex; gap: 10px; }
    .select-box {
      flex: 1; height: 38px;
      background: #09090b; border: 1px solid #374151; border-radius: 6px;
      padding: 0 10px;
      font-size: 12px; color: #d1d5db;
      display: flex; align-items: center; justify-content: space-between;
    }
    .select-box span { color: #9ca3af; }

    .add-btn {
      width: 100%; height: 38px;
      background: #4f46e5; border: none; border-radius: 6px;
      color: #fff; font-size: 14px; font-weight: 500;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      cursor: pointer;
    }

    /* ── Employee cards ── */
    .cards { display: flex; flex-direction: column; gap: 10px; }

    .card {
      background: #030712; border: 1px solid #1f2937; border-radius: 8px;
      padding: 14px;
    }
    .card-top { display: flex; align-items: flex-start; gap: 12px; }
    .card-avatar {
      position: relative; flex-shrink: 0;
      width: 46px; height: 46px; border-radius: 50%;
      background: #4f46e5;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600; color: #fff;
    }
    .status-dot {
      position: absolute; bottom: 0; right: 0;
      width: 12px; height: 12px; border-radius: 50%; border: 2px solid #09090b;
    }
    .status-dot.active    { background: #22c55e; }
    .status-dot.on-leave  { background: #f59e0b; }

    .card-info { flex: 1; min-width: 0; }
    .card-name { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 7px; }
    .badges { display: flex; flex-wrap: wrap; gap: 5px; }
    .badge {
      display: inline-flex; align-items: center;
      padding: 2px 7px; border-radius: 9999px;
      font-size: 10.5px; font-weight: 500; border: 1px solid;
    }
    .badge-active   { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
    .badge-on-leave { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .badge-admin    { background: #f3e8ff; color: #6b21a8; border-color: #e9d5ff; }
    .badge-staff    { background: #f3f4f6; color: #374151; border-color: #e5e7eb; }
    .badge-outline  { background: transparent; color: #d1d5db; border-color: #4b5563; }

    .card-meta { margin-top: 12px; display: flex; flex-direction: column; gap: 7px; }
    .meta-row {
      display: flex; align-items: center; gap: 7px;
      font-size: 12px; color: #9ca3af; white-space: nowrap; overflow: hidden;
    }
    .meta-icon { color: #6b7280; flex-shrink: 0; display: flex; align-items: center; }

    /* ── Bottom nav ── */
    .bottom-nav {
      position: fixed; bottom: 0; left: 0; right: 0;
      height: 57px;
      background: #09090b; border-top: 1px solid #1f2937;
      display: flex; z-index: 50;
    }
    .nav-tab {
      flex: 1;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 3px; padding: 6px 4px;
      font-size: 10px; color: #6b7280; text-decoration: none;
    }
  </style>
</head>
<body>

  <!-- ── Top header bar ── -->
  <header class="app-header">
    <div class="header-left">
      <button class="menu-btn">${ICON.menu}</button>
      <span class="header-page-title">Employees</span>
    </div>
    <div class="header-right">
      <div class="user-avatar">TA</div>
    </div>
  </header>

  <!-- ── Page content ── -->
  <div class="content">
    <div class="page-heading">
      <h1>Employees</h1>
      <p>${count} team members</p>
    </div>

    <div class="filters">
      <div class="search-wrap">
        <span class="search-icon-pos">${ICON.search}</span>
        <input class="search-input" placeholder="Search employees…" readonly>
      </div>
      <div class="select-row">
        <div class="select-box">
          <span>All Departments</span>
          ${ICON.chevron}
        </div>
        <div class="select-box">
          <span>All</span>
          ${ICON.chevron}
        </div>
      </div>
      <button class="add-btn">${ICON.plus} Add Employee</button>
    </div>

    <div class="cards">
      ${cards}
    </div>
  </div>

  <!-- ── Bottom navigation ── -->
  <nav class="bottom-nav">
    <a class="nav-tab" href="#">${ICON.dashboard} Home</a>
    <a class="nav-tab" href="#">${ICON.clock} Leave</a>
    <a class="nav-tab" href="#">${ICON.receipt} Expenses</a>
    <a class="nav-tab" href="#">${ICON.dollar} Payroll</a>
    <a class="nav-tab" href="#">${ICON.calendar} Calendar</a>
  </nav>

</body>
</html>`;
}

// ── Composite header band (same logic as main screenshot script) ───────────

async function compositeWithHeader(
  context: BrowserContext,
  rawPngPath: string,
  outputPath: string,
  header: string,
  subtitle: string
) {
  const rawBuffer = fs.readFileSync(rawPngPath);
  const base64 = rawBuffer.toString("base64");
  const contentHeight = VIEWPORT.height - HEADER_HEIGHT_CSS;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;width:${VIEWPORT.width}px;height:${VIEWPORT.height}px;overflow:hidden;background:#09090b;">
  <div style="
    height:${HEADER_HEIGHT_CSS}px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#a855f7 100%);
    color:white;
    font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;">
    <div style="font-size:28px;font-weight:800;letter-spacing:-0.03em;line-height:1.2;">${header}</div>
    <div style="font-size:15px;font-weight:400;opacity:0.85;margin-top:4px;">${subtitle}</div>
  </div>
  <div style="width:${VIEWPORT.width}px;height:${contentHeight}px;overflow:hidden;">
    <img src="data:image/png;base64,${base64}"
         style="width:${VIEWPORT.width}px;height:auto;display:block;"/>
  </div>
</body>
</html>`;

  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: outputPath, fullPage: false });
  await page.close();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const rawDir = path.join(process.cwd(), "screenshots", "raw");
  const headerDir = path.join(process.cwd(), "screenshots", "with-headers");
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(headerDir, { recursive: true });

  console.log("🚀 Generating employees screenshot (mock HTML)…\n");

  const browser = await chromium.launch({ headless: true });

  const appCtx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  const compositeCtx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  // ── Raw screenshot ──
  const page = await appCtx.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.setContent(buildMockHtml(), { waitUntil: "load" });
  await page.waitForTimeout(500);

  const rawPath = path.join(rawDir, "04-employees.png");
  await page.screenshot({ path: rawPath, fullPage: false });
  await page.close();
  console.log(`   ✅ Raw:          ${rawPath}`);

  // ── With-header composite ──
  const headerPath = path.join(headerDir, "04-employees.png");
  await compositeWithHeader(
    compositeCtx,
    rawPath,
    headerPath,
    "Staff Directory",
    "Browse your team at a glance"
  );
  console.log(`   ✅ With header:  ${headerPath}`);

  await browser.close();

  console.log(
    `\n📐 Resolution: ${VIEWPORT.width * DEVICE_SCALE_FACTOR}×${VIEWPORT.height * DEVICE_SCALE_FACTOR}px (iPhone 14 Pro Max)`
  );
  console.log("🎉 Done!\n");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
