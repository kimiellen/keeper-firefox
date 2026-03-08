import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  vite: () => ({
    plugins: [vue()],
  }),
  manifest: {
    name: 'Keeper',
    version: '1.0.0',
    description: '密码管理器',
    browser_specific_settings: {
      gecko: {
        id: 'keeper@firefox.kimiellen.github.io',
        strict_min_version: '87.0'
      }
    },
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'contextMenus',
      'tabs',
      'webRequest',
      'webRequestBlocking',
      '<all_urls>'
    ],
    sidebar_action: {
      default_title: 'Keeper',
      default_panel: 'sidepanel.html',
      default_icon: {
        '16': '/icons/16.png',
        '32': '/icons/32.png',
        '48': '/icons/48.png'
      }
    }
  },
  browser: 'firefox'
});
