# 友情链接状态检测工具

这是一个自动检测友情链接状态的工具，可以在GitHub Actions中运行，定期检查链接的可访问性和响应时间。

## 功能特性

- 🔍 自动检测友情链接状态
- ⚡ 支持并发检测，提高效率
- 📊 生成详细的检测报告
- 🌐 支持小小API和直接检测两种方式
- 📱 响应式Web界面展示结果
- 🤖 GitHub Actions自动运行

## 文件结构

```
├── check-links.js          # 主要的链接检测逻辑
├── package.json            # 项目依赖配置
├── .github/workflows/      # GitHub Actions工作流
│   └── check-links.yml    # 自动检测工作流
├── output/                 # 输出文件夹
│   ├── index.html         # 结果展示页面
│   ├── status.json        # 主要检测结果
│   ├── status-cf.json     # CF检测状态
│   └── status-xiaoxiao.json # 小小API检测状态
└── README.md              # 项目说明
```

## 安装和运行

### 本地运行

1. 安装依赖：
```bash
npm install
```

2. 运行检测：
```bash
npm run check
```

### GitHub Actions

项目配置了GitHub Actions工作流，会：
- 每6小时自动运行一次
- 支持手动触发
- 自动提交更新结果到仓库

## 检测方式

1. **小小API检测**：使用 `https://v2.xxapi.cn/api/status` 进行快速检测
2. **直接检测**：对于API检测失败的链接，进行直接HTTP请求检测

## 输出文件说明

- `status.json`：包含所有链接的检测结果、统计信息
- `status-cf.json`：直接检测的详细状态信息
- `status-xiaoxiao.json`：小小API检测的详细状态信息
- `index.html`：美观的Web界面展示检测结果

## 配置说明

可以在 `check-links.js` 中修改以下配置：

- `SOURCE_URL`：友情链接数据源地址
- `batchSize`：并发检测的批次大小
- 检测间隔和超时设置

## 注意事项

- 确保GitHub仓库有适当的权限来运行Actions
- 检测结果会自动提交到仓库，请确保工作流有推送权限
- 建议在个人仓库或组织仓库中运行，避免在fork的仓库中运行

## 许可证

MIT License 