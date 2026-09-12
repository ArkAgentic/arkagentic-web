# Provider Rollout Tracker (P0-1 Popular First)

> 策略：先把 8 家主流通道逐一打通，做到 **可调用 + 可计费 + 可审计**，再扩展长尾模型。

## 执行顺序（固定）

1. OpenAI
2. Anthropic
3. Google Gemini
4. Azure OpenAI
5. Moonshot (Kimi)
6. DeepSeek
7. Qwen (DashScope)
8. GLM (Zhipu)

## 当前状态看板

| Provider | 注册状态 | 凭据到位 | Key Vault | Registry接入 | 线上调用验收 | 计费入库验收 | 状态 |
|---|---|---|---|---|---|---|---|
| OpenAI | 已完成 | 已提供 | 已完成 | 已完成 | 已通过 | 已通过 | COMPLETED |
| Anthropic | 待开始 | 待提供 | 待执行 | 待执行 | 待执行 | 待执行 | PENDING |
| Gemini | 待开始 | 待提供 | 待执行 | 待执行 | 待执行 | 待执行 | PENDING |
| Azure OpenAI | 待开始 | 待提供 | 待执行 | 待执行 | 待执行 | 待执行 | PENDING |
| Moonshot | 待开始 | 待提供 | 待执行 | 待执行 | 待执行 | 待执行 | PENDING |
| DeepSeek | 待开始 | 待提供 | 待执行 | 待执行 | 待执行 | 待执行 | PENDING |
| DashScope(Qwen) | 待开始 | 待提供 | 待执行 | 待执行 | 待执行 | 待执行 | PENDING |
| GLM | 待开始 | 待提供 | 待执行 | 待执行 | 待执行 | 待执行 | PENDING |

---

## 每家统一验收标准（必须全部通过）

1. **配置到位**：密钥仅存 Key Vault；Container Apps 通过 secretRef 引用；无明文泄露。
2. **网关调用成功**：通过 `POST /v1/chat/completions` 返回 200 且有可解析响应体。
3. **计费成功**：数据库 `usage_logs` 与余额扣减一致（含模型单价）。
4. **错误规范**：无 key / 错 key / 上游故障时，错误码与错误文案可诊断。

---

## 你需要提供的信息（按家）

### 1) OpenAI
- 注册入口：https://platform.openai.com/signup
- 你需提供：
  - `OPENAI_API_KEY`

### 2) Anthropic
- 控制台：https://console.anthropic.com/
- 你需提供：
  - `ANTHROPIC_API_KEY`

### 3) Google Gemini
- 开通入口：https://cloud.google.com/free
- 你需提供（二选一）：
  - `GOOGLE_API_KEY`
  - 或 GCP Service Account 方案（JSON/Workload Identity）

### 4) Azure OpenAI
- Azure 入口：https://portal.azure.com/
- 你需提供：
  - `AZURE_OPENAI_API_KEY`
  - `AZURE_OPENAI_ENDPOINT`
  - deployment 名称（例如 gpt-4o-prod）

### 5) Moonshot (Kimi)
- 入口：https://platform.moonshot.cn/
- 你需提供：
  - `MOONSHOT_API_KEY`

### 6) DeepSeek
- 入口：https://platform.deepseek.com/
- 你需提供：
  - `DEEPSEEK_API_KEY`

### 7) DashScope (Qwen)
- 入口：https://dashscope.aliyun.com/
- 你需提供：
  - `DASHSCOPE_API_KEY`

### 8) GLM (Zhipu)
- 入口：https://open.bigmodel.cn/
- 你需提供：
  - `ZHIPU_API_KEY`

---

## 本轮执行约束

- 先完成以上 8 家，再扩展更多 provider。
- 每完成 1 家就做一次完整回执：
  - 变更文件
  - 部署命令
  - 线上验证命令
  - 计费入库证据
- 未通过计费验收，不进入下一家。
