# ArkAgentic 商业化上线完善闭环清单（非最小版）

> 目标：把“国内算力出海 / 大模型中转站”从可运行状态，推进到可正式推广、可签约、可审计、可持续运营。

## 当前状态快照（基于最新实测）

- ✅ Azure 7 Workloads 拆分已完成（Milestone 4 结构达成）
- ✅ PostgreSQL 持久化、Redis 限流、Key Vault + MI 框架已接入
- ✅ 多语言站点主链路基本可用
- ✅ Azure Foundry ARM 自动同步已上线：`npm run sync:models` + `POST /api/admin/models/sync`
- ✅ 首次真实同步已完成：24 个 `Succeeded` 部署成功 Upsert，停用数 0
- ✅ Admin 只读模型健康探针已上线：`GET /api/admin/models/health`
- ✅ 并发硬化主链路已落地：Undici + Redis 并发锁 + Queue + Smart Fallback
- ⚠️ 告警体系缺失（Metrics Alerts / Activity Alerts 为空）
- ⚠️ Admin 控制面板需要持续化验收矩阵与发布门禁

---

## P0（上线阻塞，必须全部完成）

### P0-1 模型通道打通（Popular First，尽可能多）

#### 目标
先打通最常用模型，再扩充，确保“可售卖 API”而非演示。

#### 优先级顺序（建议）
1. OpenAI（GPT-4o / GPT-4.1 / o4-mini）
2. Anthropic（Claude Sonnet 系列）
3. Google Gemini（1.5/2.x）
4. Azure OpenAI（企业客户常用）
5. Moonshot（Kimi）
6. DeepSeek（V3/R1）
7. Qwen（阿里云百炼 / DashScope）
8. GLM（智谱）

#### 你需要配合准备（逐家）
- OpenAI：
  - 注册/登录平台，完成账单绑定
  - 提供：`OPENAI_API_KEY`
- Anthropic：
  - 注册 Console，完成账单或额度开通
  - 提供：`ANTHROPIC_API_KEY`
- Google Gemini：
  - Google Cloud 项目、启用 Vertex/Gemini API、开通计费
  - 提供：`GOOGLE_API_KEY` 或 GCP 服务账号方案
- Azure OpenAI：
  - 订阅内创建 AOAI 资源 + 部署名
  - 提供：`AZURE_OPENAI_API_KEY`、`AZURE_OPENAI_ENDPOINT`、deployment names
- Moonshot：
  - 开通账户与额度
  - 提供：`MOONSHOT_API_KEY`
- DeepSeek：
  - 开通账户与额度
  - 提供：`DEEPSEEK_API_KEY`
- Qwen（DashScope）：
  - 阿里云账户、开通 DashScope
  - 提供：`DASHSCOPE_API_KEY`
- GLM：
  - 开通智谱 API
  - 提供：`ZHIPU_API_KEY`

#### 我来执行
- 统一接入 `model-registry`（provider / endpoint / model / 计费）
- Key Vault 写入 secret，ACA 仅用 secretRef（不落明文）
- 每个模型做 `curl` 实测（成功响应 + usage + 扣费落库）
- 输出《模型可用性矩阵》：状态、延迟、成功率、单位成本、销售价

#### 验收标准
- 每个已接入模型都能通过网关成功调用
- 不支持模型返回 400
- 失败有统一错误码规范
- 计费按模型单价准确扣费并入库

---

### P0-2 认证与会话安全正式化（去 mock）

#### 目标
移除所有 `mock-signature`，完成可审计 JWT 安全链路。

#### 我来执行
- 替换 callback/login/signup 的 mock JWT 逻辑
- 使用 `JWT_SIGNING_KEY` 真签发 + 真校验（服务端）
- 统一 token 过期、刷新、注销策略
- 增加签名错误/过期/篡改测试

#### 验收标准
- 代码中不存在 `.mock-signature` 生产路径
- 未登录/过期/篡改 token 均被正确拦截
- 认证日志可追溯（含 userId/ip/ua/requestId）

---

### P0-3 控制台去 mock 回退（真实数据唯一来源）

#### 目标
控制台所有关键数据来自真实后端，不允许演示数据混入。

#### 我来执行
- 关闭生产环境 mock fallback（overview/keys/billing/models/admin）
- 统一 API 错误展示（可观测、可排障）
- 增加“数据来源断言”检查

#### 验收标准
- 生产环境无 mock 数据渲染路径
- 控制台指标、账单、API keys 与 DB 一致

---

### P0-4 支付闭环上线（Stripe 真交易）

#### 目标
实现完整商业闭环：充值 -> webhook -> 入账 -> tier 变化 -> 可消费。

#### 你需要配合准备
- Stripe 账户正式模式（或先 staging）
- 提供/配置：
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- 在 Stripe Dashboard 配置 webhook endpoint

#### 我来执行
- 校验 checkout 参数与金额白名单
- webhook 签名校验与幂等处理
- 入账事务与账单记录一致性
- 回归测试（成功/取消/重放/签名错误）

#### 验收标准
- 一笔真实充值全链路成功
- 用户余额、pricing tier、交易记录一致
- webhook 重放不重复记账

---

### P0-5 Admin 控制面板正式测试与落地（新增）

#### 当前 admin 基准账号
- `charles.zhang@arkagentic.com`（已配置为 founder admin）

#### 我来执行（验收矩阵）
1. 匿名访问 `/console/admin` -> 307 到登录
2. 普通用户访问 `/console/admin` -> 307 到 `/console/overview`（或按策略 404）
3. 普通用户访问 `/api/admin/*` -> 拒绝（401/403/404，按策略固定）
4. admin 访问 `/console/admin` -> 200
5. 非 admin 界面不可见 Admin 导航项（DOM 级验证）
6. Admin Dashboard 指标与数据库一致性核对

#### 验收标准
- RBAC 行为稳定且可复现
- admin 能力可用，且对普通用户“静默隐藏”

---

### P0-6 生产可观测与告警（必须）

#### 我来执行
- 建立 Azure Monitor 告警（Metric + Activity）
  - API 5xx 比例
  - P95 延迟
  - 429 激增
  - 容器重启异常
  - PostgreSQL 连接/CPU/存储阈值
- 配置告警通知（Email/Teams/Webhook）
- 输出值班与故障分级SOP

#### 你需要配合准备
- 告警接收通道（邮箱组/Teams webhook）
- 值班负责人名单

#### 验收标准
- 每类告警可触发一次演练并收到通知
- 故障处置路径明确（谁、何时、怎么升级）

---

## P1（推广前强烈建议完成）

### P1-1 数据可靠性升级
- PostgreSQL HA 评估并启用（或明确容灾替代）
- 备份保留策略升级（>=14~30天）
- 定期恢复演练（RTO/RPO 记录）

### P1-2 合规与商业页面完善
- 隐私政策、服务条款、退款政策、可接受使用政策（AUP）
- 数据处理与跨境声明
- 企业采购资料（SLA、安全白皮书简版）

### P1-3 成本与毛利护栏
- 每模型成本监控 + 报警
- 单用户/单key/单模型日预算上限
- 异常消费自动熔断

### P1-4 SRE/发布规范
- 发布回滚手册
- 变更窗口制度
- 版本/迁移记录模板

---

## P2（规模化阶段）

- 多地域容灾与智能流量调度
- 企业 SSO（SAML/OIDC）
- 审计日志导出与BI看板
- 自助工单与客户状态页

---

## 执行方式（我们接下来按这个来）

我们采用“一项一验收”的推进方式：
1. 先做 P0-1（模型通道）
2. 每完成一个子项就回执：改动、命令、结果、截图/日志证据
3. 全部 P0 完成后再进入 P1

---

## 你现在需要先给我的第一批信息（为了马上开工 P0-1）

请先提供（有哪个先给哪个）：
- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- Google: `GOOGLE_API_KEY`（或告知走 GCP SA）
- Azure OpenAI: `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` + deployment names
- Moonshot: `MOONSHOT_API_KEY`
- DeepSeek: `DEEPSEEK_API_KEY`
- DashScope(Qwen): `DASHSCOPE_API_KEY`
- GLM: `ZHIPU_API_KEY`

> 你可以分批给。我会按“先 popular 先上线”的顺序边接入边验收。
