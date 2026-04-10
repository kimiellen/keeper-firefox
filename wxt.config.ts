import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  vite: () => ({
    plugins: [vue()],
  }),
  manifest: {
    name: 'Keeper',
    version: '0.26.04',
    description: '密码管理器',
    browser_specific_settings: {
      gecko: {
        id: 'keeper@firefox.kimiellen.github.io',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
          optional: []
        }
      }
    },
    permissions: [
      'storage',
      'activeTab',
      'tabs',
      'notifications',
      '<all_urls>'
    ],
    icons: {
      '32': 'icons/icon-32.png',
      '64': 'icons/icon-64.png',
      '128': 'icons/icon-128.png'
    },
    sidebar_action: {
      default_title: 'Keeper',
      default_panel: 'sidepanel.html',
      default_icon: {
        '16': 'icons/toolbar-16.png',
        '32': 'icons/toolbar-32.png',
        '48': 'icons/toolbar-48.png'
      }
    },
    commands: {
      toggle_sidebar: {
        suggested_key: {
          default: 'Alt+Period'
        },
        description: '切换 Keeper 侧边栏'
      },
      fill_credentials: {
        suggested_key: {
          default: 'Alt+P'
        },
        description: '填充账号密码'
      }
    }
  },
  browser: 'firefox'
});
