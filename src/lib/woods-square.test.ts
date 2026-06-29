import { describe, expect, it } from "vitest";
import {
  DATE_PRESETS,
  MAX_WINDOW_DAYS,
  coveringRange,
  gapWindows,
  isAfterScheduledSendDay,
  isScheduledSendDay,
  scheduledSendDate,
  mergeDateRanges,
  missingWindows,
  monthWindows,
  partitionByEmailPresence,
  presetRange,
  upcomingMonthOf,
  windowDaysInclusive,
} from "@/lib/woods-square";

const d = (iso: string) => new Date(`${iso}T00:00:00`);

// Guards the date-window rules that the staff modal, admin card, and (now) the
// server-side validation all rely on. If an edit ever breaks the 7-day cap or the
// day-count math, these checks fail loudly instead of letting a bad window through.

describe("windowDaysInclusive", () => {
  it("counts a same-day window as 1 day", () => {
    expect(windowDaysInclusive("2026-06-09", "2026-06-09")).toBe(1);
  });

  it("counts the full span inclusively (9th–15th = 7 days)", () => {
    expect(windowDaysInclusive("2026-06-09", "2026-06-15")).toBe(7);
  });

  it("reports over-limit windows as more than the cap (9th–16th = 8 days)", () => {
    expect(windowDaysInclusive("2026-06-09", "2026-06-16")).toBe(MAX_WINDOW_DAYS + 1);
  });

  it("returns 0 when either end is missing", () => {
    expect(windowDaysInclusive("", "")).toBe(0);
    expect(windowDaysInclusive("2026-06-09", "")).toBe(0);
  });

  it("goes below 1 when the end is before the start (rejectable)", () => {
    expect(windowDaysInclusive("2026-06-15", "2026-06-09")).toBeLessThan(1);
  });
});

describe("presetRange", () => {
  it("every quick-pick stays within the 7-day cap", () => {
    for (const preset of DATE_PRESETS) {
      const { from, to } = presetRange(preset.from, preset.to);
      const days = windowDaysInclusive(from, to);
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(MAX_WINDOW_DAYS);
    }
  });

  it('the "1 week" preset is exactly 7 days', () => {
    const week = DATE_PRESETS.find((p) => p.label === "1 week")!;
    const { from, to } = presetRange(week.from, week.to);
    expect(windowDaysInclusive(from, to)).toBe(7);
  });

  it("returns ISO yyyy-MM-dd strings", () => {
    const { from, to } = presetRange(0, 6);
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── Monthly scheduler helpers ────────────────────────────────────────────────

describe("scheduledSendDate", () => {
  it("is the 15th of July 2026", () => {
    const sd = scheduledSendDate(2026, 6); // monthIndex 6 = July
    expect(sd.getMonth()).toBe(6);
    expect(sd.getDate()).toBe(15);
  });

  it("rolls a monthIndex past December into the next year", () => {
    const sd = scheduledSendDate(2026, 12); // Jan 2027
    expect(sd.getFullYear()).toBe(2027);
    expect(sd.getMonth()).toBe(0);
    expect(sd.getDate()).toBe(15);
  });

  it("always lands on the 15th of the requested month", () => {
    for (let m = 0; m < 12; m++) {
      const sd = scheduledSendDate(2026, m);
      expect(sd.getMonth()).toBe(m);
      expect(sd.getDate()).toBe(15);
    }
  });
});

describe("isScheduledSendDay", () => {
  it("is true only on the 15th", () => {
    expect(isScheduledSendDay(new Date(2026, 6, 15))).toBe(true); // the send day
    expect(isScheduledSendDay(new Date(2026, 6, 14))).toBe(false); // the day before
    expect(isScheduledSendDay(new Date(2026, 6, 16))).toBe(false); // the day after
  });
});

describe("isAfterScheduledSendDay", () => {
  it("is false on or before the 15th, true after it", () => {
    expect(isAfterScheduledSendDay(new Date(2026, 6, 14))).toBe(false); // before
    expect(isAfterScheduledSendDay(new Date(2026, 6, 15))).toBe(false); // the send day itself
    expect(isAfterScheduledSendDay(new Date(2026, 6, 16))).toBe(true); // the day after
    expect(isAfterScheduledSendDay(new Date(2026, 6, 31))).toBe(true); // month-end
  });
});

describe("monthWindows", () => {
  it("splits July (31 days) into 5 windows, last clamped to month-end", () => {
    const w = monthWindows(2026, 6);
    expect(w).toHaveLength(5);
    expect(w[0]).toEqual({ from: "2026-07-01", to: "2026-07-07" });
    expect(w[4]).toEqual({ from: "2026-07-29", to: "2026-07-31" });
  });

  it("splits February (28 days) into exactly 4 windows", () => {
    const w = monthWindows(2026, 1);
    expect(w).toHaveLength(4);
    expect(w[3]).toEqual({ from: "2026-02-22", to: "2026-02-28" });
  });

  it("covers every day with no window exceeding the 7-day cap", () => {
    const w = monthWindows(2026, 6);
    expect(w[0].from).toBe("2026-07-01");
    expect(w[w.length - 1].to).toBe("2026-07-31");
    for (const win of w) expect(windowDaysInclusive(win.from, win.to)).toBeLessThanOrEqual(MAX_WINDOW_DAYS);
  });
});

describe("upcomingMonthOf", () => {
  it("returns the next month", () => {
    expect(upcomingMonthOf(new Date(2026, 6, 1))).toEqual({ year: 2026, monthIndex: 7 }); // Jul → Aug
  });

  it("rolls over December → January of the next year", () => {
    expect(upcomingMonthOf(new Date(2026, 11, 15))).toEqual({ year: 2027, monthIndex: 0 });
  });
});

// ── Union-coverage dedup (scheduler idempotency) ─────────────────────────────

describe("mergeDateRanges", () => {
  it("merges consecutive days with no gap (01–03 + 04–10 ⇒ 01–10)", () => {
    const merged = mergeDateRanges([
      { from: d("2026-07-01"), to: d("2026-07-03") },
      { from: d("2026-07-04"), to: d("2026-07-10") },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ from: d("2026-07-01"), to: d("2026-07-10") });
  });

  it("keeps ranges with a real gap separate (01–03 + 05–07, missing the 4th)", () => {
    const merged = mergeDateRanges([
      { from: d("2026-07-05"), to: d("2026-07-07") },
      { from: d("2026-07-01"), to: d("2026-07-03") },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].from).toEqual(d("2026-07-01")); // sorted ascending
  });

  it("merges overlapping ranges", () => {
    const merged = mergeDateRanges([
      { from: d("2026-07-01"), to: d("2026-07-08") },
      { from: d("2026-07-05"), to: d("2026-07-12") },
    ]);
    expect(merged).toEqual([{ from: d("2026-07-01"), to: d("2026-07-12") }]);
  });
});

describe("coveringRange", () => {
  // The whole point: a month split across several invites with ANY boundaries still
  // counts as covered, so the scheduler won't re-send a set someone already has.
  it("treats July split into its 5 canonical windows as fully covering each window", () => {
    const july = monthWindows(2026, 6).map((w) => ({ from: d(w.from), to: d(w.to) }));
    for (const w of monthWindows(2026, 6)) {
      expect(coveringRange(july, d(w.from), d(w.to))).not.toBeNull();
    }
  });

  it("covers a canonical window even when existing invites use different boundaries", () => {
    // Person holds 28 Jun–04 Jul and 05 Jul–11 Jul; the canonical 01–07 Jul window is
    // fully inside their union despite never matching a single invite.
    const existing = [
      { from: d("2026-06-28"), to: d("2026-07-04") },
      { from: d("2026-07-05"), to: d("2026-07-11") },
    ];
    expect(coveringRange(existing, d("2026-07-01"), d("2026-07-07"))).not.toBeNull();
  });

  it("returns null when a gap leaves a day of the window uncovered", () => {
    const existing = [
      { from: d("2026-07-01"), to: d("2026-07-03") },
      { from: d("2026-07-05"), to: d("2026-07-10") }, // 4th missing
    ];
    expect(coveringRange(existing, d("2026-07-01"), d("2026-07-07"))).toBeNull();
  });

  it("returns null when the person has no prior invites", () => {
    expect(coveringRange([], d("2026-07-01"), d("2026-07-07"))).toBeNull();
  });
});

describe("missingWindows", () => {
  it("with no prior coverage, matches the full-month split", () => {
    expect(missingWindows(2026, 7, [])).toEqual(monthWindows(2026, 7)); // August
  });

  it("the headline case: holding Aug 3–7 yields 1–2 + 8–14/15–21/22–28/29–31", () => {
    const windows = missingWindows(2026, 7, [{ from: d("2026-08-03"), to: d("2026-08-07") }]);
    expect(windows).toEqual([
      { from: "2026-08-01", to: "2026-08-02" },
      { from: "2026-08-08", to: "2026-08-14" },
      { from: "2026-08-15", to: "2026-08-21" },
      { from: "2026-08-22", to: "2026-08-28" },
      { from: "2026-08-29", to: "2026-08-31" },
    ]);
  });

  it("returns nothing when the whole month is already covered (split across invites)", () => {
    const covered = [
      { from: d("2026-08-01"), to: d("2026-08-10") },
      { from: d("2026-08-11"), to: d("2026-08-31") },
    ];
    expect(missingWindows(2026, 7, covered)).toEqual([]);
  });

  it("fills a single missing day with a one-day window", () => {
    // Has all of August except the 10th.
    const covered = [
      { from: d("2026-08-01"), to: d("2026-08-09") },
      { from: d("2026-08-11"), to: d("2026-08-31") },
    ];
    expect(missingWindows(2026, 7, covered)).toEqual([{ from: "2026-08-10", to: "2026-08-10" }]);
  });

  it("splits a gap longer than 7 days into ≤7-day chunks from the gap start", () => {
    // Missing 9–31 (has 1–8): chunks start at the gap, not the canonical grid.
    const windows = missingWindows(2026, 7, [{ from: d("2026-08-01"), to: d("2026-08-08") }]);
    expect(windows).toEqual([
      { from: "2026-08-09", to: "2026-08-15" },
      { from: "2026-08-16", to: "2026-08-22" },
      { from: "2026-08-23", to: "2026-08-29" },
      { from: "2026-08-30", to: "2026-08-31" },
    ]);
  });
});

// ── Habitap bulk-import confirmation (the #4 fix: partial import ≠ full success) ──

describe("partitionByEmailPresence", () => {
  const people = [
    { id: "1", name: "Ann", email: "ann@x.com" },
    { id: "2", name: "Bob", email: "BOB@x.com" },
    { id: "3", name: "Cal", email: "cal@x.com" },
  ];

  it("the headline case: 2 of 3 land → the dropped one is reported missing", () => {
    // Visitor list shows ann + bob; cal was silently dropped by the import.
    const { present, missing } = partitionByEmailPresence(people, "Visitors: ann@x.com, bob@x.com");
    expect(present.map((p) => p.id)).toEqual(["1", "2"]);
    expect(missing.map((p) => p.id)).toEqual(["3"]);
  });

  it("matches case-insensitively on the email", () => {
    // Bob's stored email is upper-case but the page renders it lower-case — still confirmed.
    const { present } = partitionByEmailPresence(people, "bob@x.com");
    expect(present.map((p) => p.id)).toContain("2");
  });

  it("all present when every email appears", () => {
    const { present, missing } = partitionByEmailPresence(people, "ann@x.com bob@x.com cal@x.com");
    expect(present).toHaveLength(3);
    expect(missing).toHaveLength(0);
  });

  it("all missing when the visitor list is empty (favours re-sending over silent drop)", () => {
    const { present, missing } = partitionByEmailPresence(people, "");
    expect(present).toHaveLength(0);
    expect(missing).toHaveLength(3);
  });
});

describe("gapWindows (arbitrary range — manual/bulk sends)", () => {
  it("trims a manual window to only the missing days within it", () => {
    // Admin picks Aug 1–7 for someone who already has Aug 3–7 → only 1–2 is sent.
    expect(gapWindows("2026-08-01", "2026-08-07", [{ from: d("2026-08-03"), to: d("2026-08-07") }])).toEqual([
      { from: "2026-08-01", to: "2026-08-02" },
    ]);
  });

  it("returns multiple sub-windows when a covered span sits inside the requested window", () => {
    // Requested 1–7, already has 3–4 → two gaps: 1–2 and 5–7.
    expect(gapWindows("2026-08-01", "2026-08-07", [{ from: d("2026-08-03"), to: d("2026-08-04") }])).toEqual([
      { from: "2026-08-01", to: "2026-08-02" },
      { from: "2026-08-05", to: "2026-08-07" },
    ]);
  });

  it("returns the whole window when nothing is covered", () => {
    expect(gapWindows("2026-08-01", "2026-08-07", [])).toEqual([{ from: "2026-08-01", to: "2026-08-07" }]);
  });

  it("returns [] when the window is fully covered", () => {
    expect(gapWindows("2026-08-01", "2026-08-07", [{ from: d("2026-07-30"), to: d("2026-08-10") }])).toEqual([]);
  });

  it("spans a month boundary correctly", () => {
    // 28 Jul–3 Aug, already has 30 Jul–1 Aug → gaps 28–29 Jul and 2–3 Aug.
    expect(gapWindows("2026-07-28", "2026-08-03", [{ from: d("2026-07-30"), to: d("2026-08-01") }])).toEqual([
      { from: "2026-07-28", to: "2026-07-29" },
      { from: "2026-08-02", to: "2026-08-03" },
    ]);
  });
});
