import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'build',
  modules: ['@wxt-dev/module-react'],
  // We declare Firefox's data_collection_permissions explicitly below
  // (required: ['none'] — Vibela is local-first and collects nothing), so the
  // build-time reminder about the Nov 2025 AMO requirement is just noise.
  suppressWarnings: { firefoxDataCollection: true },
  manifest: ({ browser }) => ({
    name: 'Vibela',
    description: 'Developer overlay for collecting visual UI notes for LLM handoff.',
    version: '0.1.0',
    // unlimitedStorage lifts chrome.storage.local off its 10MB cap: annotation
    // drafts embed full-viewport PNG data URLs, which overrun the default quota
    // once several screenshots are captured (Resource::kQuotaBytes exceeded).
    permissions: ['activeTab', 'storage', 'unlimitedStorage', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Toggle Vibela overlay',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
      },
    },
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    web_accessible_resources: [
      {
        resources: ['icons/*.png'],
        matches: ['<all_urls>'],
      },
    ],
    // Firefox-only settings. Chrome ignores browser_specific_settings, but we
    // gate it on `browser` anyway to keep the Chrome manifest minimal.
    //   id          — stable add-on id, required for AMO signing / permanent install.
    //   strict_min_version 115 — first Firefox with chrome.storage.session (used by background.ts).
    //   data_collection_permissions: none — Vibela is local-first; no data leaves the machine.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'vibela@vibela.app',
          strict_min_version: '115.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
