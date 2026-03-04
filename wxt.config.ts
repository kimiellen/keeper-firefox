import { defineConfig } from 'wxt';
import vue from '@wxt-dev/module-vue';

export default defineConfig({
  modules: [vue],
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
      'scripting'
    ]
  },
  browser: 'firefox'
});
