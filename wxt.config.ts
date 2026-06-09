import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'build',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Vibela',
    description: 'Developer overlay for collecting visual UI notes for LLM handoff.',
    version: '0.1.0',
    // unlimitedStorage lifts chrome.storage.local off its 10MB cap: annotation
    // drafts embed full-viewport PNG data URLs, which overrun the default quota
    // once several screenshots are captured (Resource::kQuotaBytes exceeded).
    permissions: ['activeTab', 'storage', 'unlimitedStorage', 'scripting', 'downloads'],
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
  },
});
