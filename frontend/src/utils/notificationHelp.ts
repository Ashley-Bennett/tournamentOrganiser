// ── "Notifications are blocked" — how to undo it, per browser ────────────────
// A page cannot open the browser's settings (chrome://, edge:// and about:
// links are refused), and cannot re-ask once the player has said no. All it
// can do is tell them where the switch is — so this works out which browser
// they are in and names the actual taps, rather than "check your settings".

export interface BlockedHelp {
  /** Shown as "In {browser}:" above the steps. */
  browser: string;
  steps: string[];
  /**
   * The browser's own settings page for this site, for browsers that have one.
   * Pages may not link to it, so it is offered to copy and paste instead.
   */
  settingsUrl?: string;
}

const COME_BACK = "Come back to this page. The switch unlocks by itself.";

export function blockedNotificationHelp(
  ua: string,
  origin: string,
  standalone: boolean,
): BlockedHelp {
  const ios = /iphone|ipad|ipod/i.test(ua);
  const android = /android/i.test(ua);
  const site = encodeURIComponent(origin);

  // Installed to the Home Screen: the permission belongs to the app now, and
  // lives in the phone's settings rather than the browser's.
  if (standalone && ios) {
    return {
      browser: "the MatchAmp app",
      steps: [
        "Open the Settings app on your iPhone or iPad.",
        "Tap Notifications, then MatchAmp.",
        "Turn on Allow Notifications.",
        COME_BACK,
      ],
    };
  }
  if (standalone && android) {
    return {
      browser: "the MatchAmp app",
      steps: [
        "Press and hold the MatchAmp icon on your home screen, then tap App info (ⓘ).",
        "Tap Notifications and turn them on.",
        COME_BACK,
      ],
    };
  }

  if (/SamsungBrowser/i.test(ua)) {
    return {
      browser: "Samsung Internet",
      steps: [
        "Tap the menu (☰), then Settings.",
        "Tap Sites and downloads, then Site permissions, then Notifications.",
        "Find MatchAmp and allow it.",
        COME_BACK,
      ],
    };
  }

  if (/Edg\//i.test(ua)) {
    return {
      browser: "Edge",
      steps: [
        "Click the padlock to the left of the web address.",
        "Open Permissions for this site.",
        "Set Notifications to Allow.",
        COME_BACK,
      ],
      settingsUrl: `edge://settings/content/siteDetails?site=${site}`,
    };
  }

  if (/Firefox|FxiOS/i.test(ua)) {
    return {
      browser: "Firefox",
      steps: [
        "Click the icon to the left of the web address.",
        "Next to “Send notifications: Blocked”, click the ✕ to clear it.",
        "Come back here and turn push on. Firefox will ask again, so choose Allow.",
      ],
    };
  }

  if (/Chrome|CriOS/i.test(ua)) {
    if (android) {
      return {
        browser: "Chrome",
        steps: [
          "Tap the icon to the left of the web address.",
          "Tap Permissions.",
          "Turn on Notifications.",
          COME_BACK,
        ],
      };
    }
    return {
      browser: "Chrome",
      steps: [
        "Click the icon to the left of the web address.",
        "Turn on Notifications. If you don't see it, click Site settings and set Notifications to Allow.",
        COME_BACK,
      ],
      settingsUrl: `chrome://settings/content/siteDetails?site=${site}`,
    };
  }

  if (/Safari/i.test(ua) && !ios) {
    return {
      browser: "Safari",
      steps: [
        "In the menu bar, choose Safari, then Settings.",
        "Open the Websites tab and choose Notifications on the left.",
        "Find MatchAmp and set it to Allow.",
        COME_BACK,
      ],
    };
  }

  return {
    browser: "your browser",
    steps: [
      "Open the site settings for MatchAmp. It's usually behind the icon to the left of the web address.",
      "Set Notifications to Allow.",
      COME_BACK,
    ],
  };
}
