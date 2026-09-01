# FC AI Image Workbench / FC内部AI生图工作台

[![Version](https://img.shields.io/badge/version-v1.0.0-blue.svg)](https://github.com/wode1187-del/FC-AI)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org/)

A powerful local AI image generation workbench with multi-model support, batch generation, and reference image editing.

一个功能强大的本地AI生图工作台，支持多模型、批量生成、参考图编辑。

---

## ✨ Features / 功能特性

### Core Features / 核心功能
- **Multi-model support** / 多模型支持: GPT-IMAGE-2, Gemini, Nano Banana, Qwen-Image, Seedream, and more
- **Custom API** / 自定义API: Support up to 2 custom OpenAI-compatible APIs
- **Text-to-Image** / 文生图: Generate images from text prompts
- **Image-to-Image** / 图生图: Use reference images for generation
- **Batch Generation** / 批量生成: Up to 50 tasks with configurable concurrency
- **Model Management** / 模型管理: Load, search, and enable models from API

### Generation Parameters / 生成参数
- **Resolution** / 分辨率: 1:1, 4:3, 3:4, 16:9, 9:16, 2K, 4K, and more
- **Quality** / 质量: Standard / High (model native high quality)
- **Count** / 张数: 1-20 images per request
- **Negative Prompt** / 负向提示词
- **AI Prompt Optimizer** / AI自动优化提示词: Independent API configuration

### Reference Image / 参考图功能
- Multi-image upload (up to 20) / 多图上传（最多20张）
- Drag and drop reordering / 拖拽排序
- Folder batch import / 文件夹批量导入
- Ctrl+V paste support / 支持粘贴
- Built-in image editor / 内置图片编辑器: Crop, rotate, flip, etc.
- "Use as reference" from results / 生成结果可"选为参考"

### UI Features / 界面特性
- Resizable columns / 列宽可拖拽调整
- Colorful gradient loading placeholders / 彩色渐变加载占位框
- Generation timer / 生成计时
- JPG/PNG download with "downloaded" indicator / JPG/PNG下载，已下载标记
- Dark/Light theme / 深色/浅色主题

---

## 🚀 Quick Start / 快速开始

### Prerequisites / 环境要求
- Node.js 18+ 
- Modern browser (Chrome, Edge, Firefox) / 现代浏览器

### Installation / 安装

```bash
# Clone the repository / 克隆仓库
git clone https://github.com/wode1187-del/FC-AI.git

# Navigate to project / 进入项目目录
cd FC-AI

# Install dependencies / 安装依赖
npm install
```

### Development / 开发模式

```bash
# Start development server / 启动开发服务器
npm run dev
```

The application will be available at http://localhost:5175

应用将在 http://localhost:5175 启动

### Build / 构建

```bash
# Build for production / 构建生产版本
npm run build

# Preview production build / 预览生产版本
npm run preview
```

### Windows Quick Start / Windows 一键启动
Double-click `一键启动.bat` to start the development server automatically.

双击 `一键启动.bat` 自动启动开发服务器。

---

## 📖 Usage / 使用说明

### 1. Configure API / 配置API
1. Click "API Configuration" / 点击"API配置"
2. Enter your API endpoint and API key / 输入API地址和密钥
3. Click "Load Models" / 点击"加载模型"
4. Search and select models, click "Enable" / 搜索并选择模型，点击"确定启用"

### 2. Generate Images / 生成图片
1. Enter prompt / 输入提示词
2. (Optional) Upload reference images / （可选）上传参考图
3. Select model, resolution, quality, count / 选择模型、分辨率、质量、张数
4. Click "Generate" / 点击"立即生成"

### 3. Batch Generation / 批量生成
1. Add multiple tasks / 添加多个任务
2. Configure parameters for each task / 为每个任务配置参数
3. Click "Batch Generate" / 点击"批量生成"

---

## 🛠 Tech Stack / 技术栈

- **React 18** - UI framework / UI框架
- **TypeScript** - Type safety / 类型安全
- **Vite** - Build tool / 构建工具
- **Tailwind CSS 4** - Styling / 样式
- **Radix UI** - UI components / UI组件
- **Lucide React** - Icons / 图标

---

## 📁 Project Structure / 项目结构

```
FC-AI/
├── src/
│   ├── components/          # React components / 组件
│   │   ├── LeftSidebar.tsx  # Left parameter panel / 左侧参数栏
│   │   ├── TaskTable.tsx    # Task and results table / 任务结果表格
│   │   ├── ImageEditor.tsx  # Reference image editor / 参考图编辑器
│   │   ├── ApiConfig.tsx    # API configuration / API配置
│   │   └── ui/              # UI components / UI组件
│   ├── context/             # State management / 状态管理
│   │   └── AppContext.tsx   # Global state / 全局状态
│   ├── App.tsx              # Main app / 主应用
│   ├── main.tsx             # Entry point / 入口
│   └── index.css            # Global styles / 全局样式
├── mock-packages/           # Mock packages / 模拟包
├── index.html               # HTML entry / HTML入口
├── package.json             # Project config / 项目配置
├── vite.config.ts           # Vite config / Vite配置
├── tailwind.config.js       # Tailwind config / Tailwind配置
├── tsconfig.json            # TypeScript config / TS配置
├── .gitignore               # Git ignore / Git忽略
├── 一键启动.bat              # Windows startup / Windows启动脚本
├── 使用说明.md              # Usage guide (Chinese) / 使用说明
├── 版本说明.md              # Changelog (Chinese) / 版本说明
└── README.md                # This file / 本文件
```

---

## 📄 License / 许可证

MIT License - see [LICENSE](LICENSE) for details.

MIT 许可证 - 详见 [LICENSE](LICENSE)

---

## 🤝 Contributing / 贡献

Contributions are welcome! Please feel free to submit a Pull Request.

欢迎贡献！请提交 Pull Request。

1. Fork the repository / Fork 仓库
2. Create your feature branch / 创建特性分支
3. Commit your changes / 提交修改
4. Push to the branch / 推送到分支
5. Open a Pull Request / 开启PR

---

## 📞 Support / 支持

If you encounter any issues, please open an issue on GitHub.

如遇到问题，请在 GitHub 上提交 Issue。

---

## ⭐ Acknowledgments / 致谢

Thanks to all the open-source projects that made this work possible.

感谢所有让这个项目成为可能的开源项目。
