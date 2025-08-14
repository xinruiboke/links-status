# 友情链接状态检测工具

一个基于GitHub Actions的友情链接状态自动检测工具，定期检查链接的可访问性和响应时间，并生成美观的状态报告。

## ✨ 功能特性

- 🔍 **直接检测**：使用HTTP请求直接检测链接状态，无需依赖第三方API
- 🔄 **重试机制**：支持配置重试次数和间隔，提高检测可靠性
- ⚡ **并发处理**：支持批量并发检测，提高检测效率
- 📊 **详细报告**：生成包含延迟、状态码、异常次数、重试次数等详细信息的检测报告
- 🌐 **Web界面**：提供响应式Web界面展示检测结果
- 🤖 **自动运行**：通过GitHub Actions实现定时自动检测
- 📈 **异常统计**：记录并统计链接的异常次数，便于问题追踪
- 🕐 **时区适配**：检测结果使用上海时区显示
- ⚙️ **配置化**：所有参数通过config.yml配置文件管理

## 📁 项目结构

```
links-status-main/
├── check-links.js          # 主要的链接检测逻辑
├── config.yml              # 配置文件
├── package.json            # 项目依赖配置
├── README.md              # 项目说明文档
├── .github/workflows/      # GitHub Actions工作流
│   └── check-links.yml    # 自动检测工作流配置
└── output/                 # 静态文件模板
    ├── index.html         # 结果展示页面模板
    └── favicon.png        # 网站图标模板
```

**检测结果将自动部署到 `page` 分支，包含：**
- `status.json` - 主要检测结果
- `error-count.json` - 异常次数记录
- `index.html` - 可视化展示页面
- `favicon.png` - 网站图标

## 🚀 快速开始

### 本地运行

1. **克隆项目**
```bash
git clone https://github.com/your-username/links-status-main.git
cd links-status-main
```

2. **安装依赖**
```bash
npm install
```

3. **配置参数**
编辑 `config.yml` 文件，设置您的友情链接数据源和检测参数。

**注意**: 确保您的数据源API返回正确格式的JSON数据（详见下方"links.json 数据格式"说明）。

4. **运行检测**
```bash
npm run check
```

### GitHub Actions 自动运行

项目已配置GitHub Actions工作流，会：
- ⏰ 每6小时自动运行一次检测
- 🎯 支持手动触发检测
- 📝 自动提交更新结果到page分支
- 📊 生成可视化状态页面
- 🌐 可通过GitHub Pages访问检测结果

## ⚙️ 配置文件说明

### config.yml 配置项

```yaml
# 数据源配置
source:
  url: "https://your-api-endpoint/links.json"  # 友情链接数据源URL
  headers:                                     # 数据源请求头
    Accept: "application/json"
    User-Agent: "Your-Custom-User-Agent"
```

### links.json 数据格式

友情链接数据源需要返回以下JSON格式：

```json
{
  "friends": [
    [
      "网站名称",
      "https://example.com",
      "https://example.com/favicon.ico"
    ],
    [
      "网站名称2",
      "https://example2.com",
      "https://example2.com/favicon.ico"
    ]
  ]
}
```

**数据格式说明：**
- `friends`: 友情链接数组
- 每个链接项包含三个元素：
  1. **网站名称** (string): 显示名称
  2. **网站链接** (string): 完整的URL地址
  3. **网站图标** (string): favicon图标URL地址

```yaml
# 检测配置
detection:
  batch_size: 10                    # 并发批次大小
  batch_delay: 200                  # 批次间延迟（毫秒）
  timeout: 30000                    # 单个链接检测超时时间（毫秒）
  success_status_min: 200           # 成功状态码范围（最小值）
  success_status_max: 399           # 成功状态码范围（最大值）
  retry:                            # 重试配置
    max_attempts: 3                 # 最大重试次数
    delay: 1000                     # 重试间隔（毫秒）
    enabled: true                   # 是否启用重试机制

# 检测请求头配置
request_headers:
  User-Agent: "Your-Custom-User-Agent"
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  Accept-Language: "zh-CN,zh;q=0.9"
  # 其他自定义头部...

# 输出配置
output:
  directory: "./page"               # 输出目录（将部署到page分支）
  generate_html: true               # 是否生成HTML报告
  save_error_count: true            # 是否保存错误计数

# 时区配置
timezone:
  offset: 8                         # 时区偏移（小时）
  name: "Asia/Shanghai"             # 时区名称
```

### 配置说明

#### 数据源配置
- `source.url`: 友情链接数据的API端点，需要返回指定格式的JSON数据
- `source.headers`: 获取数据源时的HTTP请求头
- **数据格式要求**: API必须返回包含`friends`数组的JSON，每个元素为`[名称, 链接, 图标]`格式

#### 检测配置
- `detection.batch_size`: 每批次处理的链接数量，建议10-20
- `detection.batch_delay`: 批次间的延迟时间，避免请求过于频繁
- `detection.timeout`: 单个链接的检测超时时间
- `detection.success_status_min/max`: 成功状态码的范围
- `detection.retry.max_attempts`: 最大重试次数（默认3次）
- `detection.retry.delay`: 重试间隔时间（毫秒）
- `detection.retry.enabled`: 是否启用重试机制

#### 请求头配置
- `request_headers`: 检测链接时使用的HTTP请求头
- 可以自定义User-Agent、Accept等头部信息

#### 输出配置
- `output.directory`: 结果文件的输出目录（将自动部署到page分支）
- `output.generate_html`: 是否生成HTML可视化页面
- `output.save_error_count`: 是否保存异常次数记录

## 🔧 检测机制

### 检测方式
- **直接HTTP检测**：对每个链接发送HTTP请求，检查响应状态码
- **重试机制**：支持配置重试次数和间隔，提高检测可靠性
- **并发控制**：根据配置的批次大小进行并发处理
- **超时设置**：单个链接检测超时时间可配置
- **状态判断**：HTTP状态码范围可配置（默认200-399）

### 异常处理
- **异常计数**：记录每个域名的连续异常次数
- **自动恢复**：当链接恢复正常时，自动重置异常计数
- **重试机制**：支持配置重试次数和间隔，提高检测成功率
- **错误日志**：详细记录检测过程中的错误信息和重试次数

## 📊 输出文件说明

### status.json
主要检测结果文件，包含：
```json
{
  "timestamp": "2024-01-01 12:00:00",
  "accessible_count": 15,
  "inaccessible_count": 2,
  "total_count": 17,
  "link_status": [
    {
      "name": "网站名称",
      "link": "https://example.com",
      "favicon": "https://example.com/favicon.ico",
      "latency": 0.85,
      "success": true,
      "status": 200,
      "error_count": 0,
      "attempts": 1
    },
    {
      "name": "重试成功的网站",
      "link": "https://example2.com",
      "favicon": "https://example2.com/favicon.ico",
      "latency": 1.2,
      "success": true,
      "status": 200,
      "error_count": 0,
      "attempts": 2
    }
  ]
}
```

### error-count.json
异常次数记录文件，用于追踪链接的稳定性。

### index.html
美观的Web界面，展示：
- 📈 实时检测统计
- 🔗 所有链接的状态列表
- ⏱️ 响应延迟信息
- 🚨 异常次数统计
- 📅 最后检测时间

## 🔄 GitHub Actions 配置

### 自动触发
工作流会在以下情况触发：
- 定时触发（每6小时）
- 手动触发（workflow_dispatch）
- 代码推送触发（push）

### 权限要求
确保GitHub仓库具有以下权限：
- `actions: write` - 运行Actions
- `contents: write` - 提交检测结果到page分支
- `pages: write` - 部署GitHub Pages（可选）

### GitHub Pages设置
1. 在仓库设置中启用GitHub Pages
2. 选择"Deploy from a branch"
3. 选择"page"分支作为源分支
4. 保存设置后即可通过 `https://your-username.github.io/your-repo-name` 访问检测结果

## 📝 注意事项

1. **配置文件**：确保config.yml文件格式正确，YAML语法无误
2. **API限制**：确保数据源API稳定可靠
3. **网络环境**：GitHub Actions运行在云端，网络环境可能影响检测结果
4. **频率控制**：通过配置调整检测频率，避免对目标网站造成压力
5. **错误处理**：检测失败时会记录详细错误信息，便于问题排查

## 🤝 贡献指南

欢迎提交Issue和Pull Request来改进这个项目！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

---

⭐ 如果这个项目对你有帮助，请给它一个星标！ 