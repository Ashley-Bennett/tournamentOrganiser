import { describe, expect, it } from "vitest";
import { blockedNotificationHelp } from "./notificationHelp";

const ORIGIN = "https://matchamp.app";

const UA = {
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  firefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
};

describe("blockedNotificationHelp", () => {
  it.each([
    ["chromeDesktop", "Chrome"],
    ["chromeAndroid", "Chrome"],
    ["edge", "Edge"],
    ["samsung", "Samsung Internet"],
    ["firefox", "Firefox"],
    ["safariMac", "Safari"],
  ] as const)("names the browser for %s", (key, browser) => {
    expect(blockedNotificationHelp(UA[key], ORIGIN, false).browser).toBe(browser);
  });

  it("offers the settings page only where one exists for the site", () => {
    expect(blockedNotificationHelp(UA.chromeDesktop, ORIGIN, false).settingsUrl).toBe(
      "chrome://settings/content/siteDetails?site=https%3A%2F%2Fmatchamp.app",
    );
    expect(blockedNotificationHelp(UA.edge, ORIGIN, false).settingsUrl).toMatch(
      /^edge:\/\//,
    );
    expect(blockedNotificationHelp(UA.chromeAndroid, ORIGIN, false).settingsUrl).toBeUndefined();
    expect(blockedNotificationHelp(UA.firefox, ORIGIN, false).settingsUrl).toBeUndefined();
  });

  it("sends an installed app to the phone's settings, not the browser's", () => {
    expect(blockedNotificationHelp(UA.iphone, ORIGIN, true).steps[0]).toMatch(
      /Settings app/,
    );
    expect(blockedNotificationHelp(UA.chromeAndroid, ORIGIN, true).steps[0]).toMatch(
      /App info/,
    );
  });

  it("falls back to generic steps for an unknown browser", () => {
    expect(blockedNotificationHelp("SomethingElse/1.0", ORIGIN, false).browser).toBe(
      "your browser",
    );
  });
});
