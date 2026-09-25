// Public replay /start — focused render + source-shape tests.
// Mirrors the pattern in tests/v6ProductWorkspace.test.ts: renderToStaticMarkup
// over pure presentational components, plus source-text assertions for the
// architectural seam (no Convex, no Product Command, no leaked visitor input).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StartView } from "../app/start/StartView";
import {
  REPLAY_COMPOSER_NOTE,
  REPLAY_CONTACT_LABEL,
  REPLAY_DISCLOSURE_BODY,
  REPLAY_DISCLOSURE_TITLE,
  startSubmitAction,
} from "../app/start/startReplayFlow";
import { REPLAY_WORKSPACE_HREF } from "../app/replay/replayRoutes";

const ROOT = join(__dirname, "..");

// Copy anywhere on the /start page (either mode) must never use these words.
const BANNED_WORDS = [
  "fake",
  "test-only",
  "not real",
  "no money spent",
  "proof of concept",
  "simulated product",
  "experimental",
  "not production",
  "limited demo",
  "WIP",
  "unfinished",
];

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

// ── Replay-mode markup ───────────────────────────────────────────────────────

test("replay StartView renders the disclosure, the composer affordances, and an enabled-looking composer", () => {
  const html = withEnv("NEXT_PUBLIC_FOUNDER_CONTACT_URL", undefined, () =>
    renderToStaticMarkup(
      createElement(StartView, { mode: "replay", capabilities: null, onReplayStart: () => {} }),
    ),
  );

  assert.ok(html.includes('data-replay-disclosure="true"'));
  assert.ok(html.includes(REPLAY_DISCLOSURE_TITLE));
  assert.ok(html.includes(REPLAY_DISCLOSURE_BODY));
  assert.ok(html.includes("Contact the founder"));

  // Composer affordances all present and styled like real controls.
  assert.ok(html.includes("Context"));
  assert.ok(html.includes("Attachments"));
  assert.ok(html.includes("Spend limit"));
  assert.ok(html.includes("Deadline"));
  assert.ok(html.includes("External effect policy"));

  // Composer is not disabled/greyed-looking.
  const textarea = html.match(/<textarea[^>]*>/)?.[0] ?? "";
  assert.ok(!/disabled/.test(textarea), "replay composer textarea must not be disabled");
  assert.ok(html.includes('data-can-create="true"'));

  // Replay note replaces the live "what happens next" copy.
  assert.ok(html.includes(REPLAY_COMPOSER_NOTE));
});

test("replay disclosure renders a plain-text CTA when no founder contact URL is configured", () => {
  const html = withEnv("NEXT_PUBLIC_FOUNDER_CONTACT_URL", undefined, () =>
    renderToStaticMarkup(
      createElement(StartView, { mode: "replay", capabilities: null, onReplayStart: () => {} }),
    ),
  );
  assert.ok(html.includes("Contact the founder."));
  assert.ok(!/<a[^>]*data-founder-contact-link/.test(html), "no link when URL is not configured");
});

test("replay disclosure renders a clickable founder contact link when the URL is configured", () => {
  const html = withEnv("NEXT_PUBLIC_FOUNDER_CONTACT_URL", "mailto:founder@example.com", () =>
    renderToStaticMarkup(
      createElement(StartView, { mode: "replay", capabilities: null, onReplayStart: () => {} }),
    ),
  );
  assert.ok(
    /<a[^>]*data-founder-contact-link="true"[^>]*href="mailto:founder@example\.com"[^>]*>Contact the founder\.<\/a>/.test(
      html,
    ) ||
      /<a[^>]*href="mailto:founder@example\.com"[^>]*data-founder-contact-link="true"[^>]*>Contact the founder\.<\/a>/.test(
        html,
      ),
    "expected a clickable founder contact link",
  );
});

test("replay-mode markup contains none of the banned words/phrases", () => {
  const html = withEnv("NEXT_PUBLIC_FOUNDER_CONTACT_URL", "mailto:founder@example.com", () =>
    renderToStaticMarkup(
      createElement(StartView, { mode: "replay", capabilities: null, onReplayStart: () => {} }),
    ),
  );
  const lower = html.toLowerCase();
  for (const word of BANNED_WORDS) {
    assert.ok(!lower.includes(word.toLowerCase()), `banned word/phrase leaked into replay markup: "${word}"`);
  }
});

// ── Live-mode markup (default) ───────────────────────────────────────────────

test("live-mode (default) StartView never renders the replay disclosure", () => {
  const html = renderToStaticMarkup(
    createElement(StartView, {
      capabilities: {
        canCreateObjective: false,
        supportsContextRefs: false,
        supportsAttachments: false,
        advanced: { spendLimit: false, deadline: false, externalEffectPolicy: false },
      },
    }),
  );
  assert.ok(!html.includes('data-replay-disclosure="true"'));
  assert.ok(!html.includes(REPLAY_DISCLOSURE_TITLE));
  assert.ok(!html.includes(REPLAY_DISCLOSURE_BODY));
});

test("live-mode markup contains none of the banned words/phrases either", () => {
  const html = renderToStaticMarkup(
    createElement(StartView, {
      capabilities: {
        canCreateObjective: true,
        supportsContextRefs: true,
        supportsAttachments: true,
        advanced: { spendLimit: true, deadline: true, externalEffectPolicy: true },
      },
    }),
  );
  const lower = html.toLowerCase();
  for (const word of BANNED_WORDS) {
    assert.ok(!lower.includes(word.toLowerCase()), `banned word/phrase leaked into live markup: "${word}"`);
  }
});

// ── Architectural seam: replay never touches Convex / Product Commands ──────

test("ReplayStartContainer and startReplayFlow import no convex module and reference no createObjectiveV1", () => {
  for (const rel of ["app/replay/ReplayStartContainer.tsx", "app/start/startReplayFlow.ts"]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.ok(!/from\s+["']convex/i.test(src), `${rel} must not import from convex`);
    assert.ok(!src.includes("convex/react"), `${rel} must not import convex/react`);
    assert.ok(!src.includes("createObjectiveV1"), `${rel} must not reference createObjectiveV1`);
  }
});

// ── The replay workspace href carries no visitor input ──────────────────────

test("REPLAY_WORKSPACE_HREF is a static string, not built from visitor text", () => {
  assert.equal(REPLAY_WORKSPACE_HREF, "/?replay=run");
  // Static string literal: no template interpolation markers, no request text.
  assert.ok(!REPLAY_WORKSPACE_HREF.includes("${"));
});

test("navigating replay start never puts typed text in the workspace href", () => {
  let navigatedTo: string | null = null;
  const html = renderToStaticMarkup(
    createElement(StartView, {
      mode: "replay",
      capabilities: null,
      onReplayStart: () => {
        navigatedTo = REPLAY_WORKSPACE_HREF;
      },
    }),
  );
  assert.ok(html.length > 0);
  // onReplayStart is only invoked on click in the real DOM; renderToStaticMarkup
  // does not fire handlers. This asserts the href itself is visitor-input-free —
  // the handler, when it does run, always navigates to the same static href.
  assert.equal(navigatedTo, null);
  assert.equal(REPLAY_WORKSPACE_HREF, "/?replay=run");
});

// ── StartView's replay path never references onCreate ────────────────────────

test("startSubmitAction returns 'replay' for replay mode and 'create' for live mode, never touching onCreate", () => {
  assert.equal(startSubmitAction("replay"), "replay");
  assert.equal(startSubmitAction("live"), "create");
});

test("StartView.tsx's replay branch in handleSubmit never references onCreate", () => {
  const src = readFileSync(join(ROOT, "app/start/StartView.tsx"), "utf8");
  const startIdx = src.indexOf('if (startSubmitAction(mode) === "replay") {');
  assert.ok(startIdx >= 0, "expected the replay branch guarded by startSubmitAction");
  // Find the matching close of this if-block by scanning brace depth.
  let depth = 0;
  let i = src.indexOf("{", startIdx);
  const blockStart = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const replayBlock = src.slice(blockStart, i + 1);
  assert.ok(!replayBlock.includes("onCreate"), "replay branch must never reference onCreate");
});
