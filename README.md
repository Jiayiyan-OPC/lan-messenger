# LAN Messenger

局域网即时通讯工具，基于 Tauri 2 + Vue 3 + TypeScript 构建，支持 Windows/macOS/Linux 三端。

## 技术栈

- **前端**: Vue 3 + TypeScript + Vite + Pinia + Vue Router
- **后端**: Tauri 2 (Rust)
- **协议**: MessagePack 编解码
- **发现**: UDP 广播设备发现
- **存储**: SQLite

## 项目结构

```
lan-messenger/
├── frontend/           # Vue 3 前端 + Tauri 壳
│   ├── src/           # Vue 源码
│   ├── src-tauri/     # Tauri Rust 后端
│   └── ...
└── README.md
```

## 开发

### 前置条件

- Node.js >= 18
- Rust >= 1.77
- 系统依赖 (Linux): `build-essential`, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`

### 启动开发

```bash
cd frontend
npm install
npm run tauri dev
```

### 构建

```bash
cd frontend
npm run tauri build
```

## License

MIT
