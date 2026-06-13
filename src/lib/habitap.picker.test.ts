import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { assertEventWindowAccepted, type EventWindow } from "@/lib/habitap";

// Exercises the read-back guard added for the date-picker format risk, against a
// throwaway fixture form — no Habitap portal or credentials needed. The live
// format confirmation still needs one real invitee; this only proves that a
// rejected (blanked) picker fails loudly instead of saving an empty window.

const WIN: EventWindow = {
  fromDate: "09 Jun 2026",
  fromTime: "8:00 AM",
  toDate: "15 Jun 2026",
  toTime: "11:00 PM",
};

const FIELDS = ["from", "fromTime", "to", "toTime"] as const;
const formHtml = (values: Partial<Record<(typeof FIELDS)[number], string>> = {}) =>
  FIELDS.map((f) => `<input id="${f}" value="${values[f] ?? ""}">`).join("");

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser?.close();
});

describe("assertEventWindowAccepted", () => {
  it("passes when every picker kept its value", async () => {
    await page.setContent(
      formHtml({ from: WIN.fromDate, fromTime: WIN.fromTime, to: WIN.toDate, toTime: WIN.toTime }),
    );
    await expect(assertEventWindowAccepted(page, WIN)).resolves.toBeUndefined();
  });

  it("throws, naming the rejected fields, when dates come back blank", async () => {
    // #from and #to empty — the format-rejection failure mode.
    await page.setContent(formHtml({ fromTime: WIN.fromTime, toTime: WIN.toTime }));
    await expect(assertEventWindowAccepted(page, WIN)).rejects.toThrow(/#from, #to/);
  });

  it("detects a picker that wipes the field on blur", async () => {
    // Faithful to the real failure: the field accepts text, then its own JS
    // clears it because the format did not match.
    await page.setContent(`
      ${formHtml({ fromTime: WIN.fromTime, to: WIN.toDate, toTime: WIN.toTime })}
      <script>
        document.querySelector("#from")
          .addEventListener("blur", (e) => { e.target.value = ""; });
      </script>
    `);
    await page.evaluate((v) => {
      const el = document.querySelector<HTMLInputElement>("#from")!;
      el.value = v;
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    }, WIN.fromDate);
    await expect(assertEventWindowAccepted(page, WIN)).rejects.toThrow(/pickers left blank/);
  });
});
