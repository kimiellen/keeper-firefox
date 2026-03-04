# Keeper Firefox

Firefox 浏览器插件 - 密码管理器

## 技术栈

- WXT (浏览器扩展框架)
- Vue 3 + TypeScript
- Zustand (状态管理)
- Motion (动画)

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build

# 打包
npm run zip
```

## 安装插件

1. 打开 Firefox → 菜单 → 附加组件和主题
2. 点击齿轮图标 → 调试附加组件
3. 选择"临时加载附加组件"
4. 选择 dist_firefox 目录下的 manifest.json
