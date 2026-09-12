# ArkAgentic Knowledge Base

## 1) API 接入教程（Setup）

### Base URL
- 生产环境：`https://gateway.arkagentic.com/v1`

### 认证
- 在控制台创建 API Key（前缀建议：`ark_`）
- 调用时通过 `Authorization: Bearer <YOUR_API_KEY>` 传递

### Python（OpenAI SDK）
```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://gateway.arkagentic.com/v1",
)

resp = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "你好，介绍一下 ArkAgentic API。"},
    ],
    temperature=0.7,
)

print(resp.choices[0].message.content)
```

### Node.js（OpenAI SDK）
```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ARKAGENTIC_API_KEY,
  baseURL: "https://gateway.arkagentic.com/v1",
});

const resp = await client.chat.completions.create({
  model: "qwen-plus",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "给我一个 API 接入示例" }
  ],
  stream: false,
});

console.log(resp.choices[0].message.content);
```

### 流式输出（Streaming）
- 设置 `stream=true`
- 服务端返回 SSE 数据流
- 建议前端/网关超时 >= 300s

---

## 2) 国内算力出海模型对比（DeepSeek / Qwen / Kimi / GLM）

> 说明：以下为工程选型维度，不同渠道价格和可用性会动态变化。

### DeepSeek（DeepSeek Chat / Reasoner）
- 优势：性价比高、中文能力强、代码与推理表现稳定
- 场景：通用对话、研发 Copilot、自动化代理链路
- 风险点：高峰期可能出现排队或波动，建议做多通道容灾

### Qwen（阿里通义）
- 优势：中文多场景覆盖较广，工具调用生态丰富
- 场景：企业知识问答、工作流自动化、长上下文应用
- 风险点：不同型号能力差异较大，需按任务分层路由

### Kimi（月之暗面）
- 优势：长上下文能力较突出，文档理解体验较好
- 场景：长文档摘要、报告生成、检索增强问答（RAG）
- 风险点：并发压力下需重点监控首 token 延迟

### GLM（智谱）
- 优势：通用中文任务稳定，API 生态完善
- 场景：企业客服、内容生成、分类抽取任务
- 风险点：同样建议配置熔断与降级策略

### 路由策略建议
1. 按任务分组路由：
   - 代码/推理：DeepSeek Reasoner 优先
   - 通用中文：Qwen / GLM
   - 超长上下文：Kimi
2. 失败自动重试：同组模型重试 1 次，再跨组切换
3. 成本优先时：按实时单价与成功率动态加权

---

## 3) 网络延迟与可用性规则

### 延迟监控指标
- TTFB（首字节）
- TTFT（首 token）
- TPOT（每 token 输出时延）
- P95 / P99 总响应耗时

### 建议阈值（可按业务调整）
- P95 TTFT > 3s：触发降级或切换通道
- 5xx 比例 > 2%（5 分钟窗口）：触发熔断
- 超时比例 > 3%：进入限流保护

### 网络优化建议
- API Gateway 与上游尽量同区部署
- 开启连接复用（HTTP keep-alive）
- 流式请求设置合理 read timeout（>=300s）

---

## 4) 计费规则（建议模板）

### 计费单位
- 输入 Token + 输出 Token
- 可设置不同模型倍率（multiplier）

### 账户与扣费
1. 请求前预检余额
2. 请求成功后按实际 token 结算
3. 流式中断时按已消费 token 部分扣费

### 风控与限频
- 用户级、Key 级、IP 级三层 Rate Limit
- Redis 维护短期计数与幂等请求键
- 余额不足时返回明确错误码与提示文案

---

## 5) RAG 客服系统加载建议

### 文档入库流程
1. Markdown/PDF 清洗切分（chunk 500~1000 tokens）
2. 生成向量写入 pgvector
3. 记录 `source`, `title`, `section`, `updated_at`

### 检索策略
- Top-K 向量召回 + rerank
- 加入时间衰减与业务权重
- 输出答案必须附引用片段（source trace）

### 运营策略
- 建立 FAQ 命中榜与无答案日志
- 每周回灌未命中问题到知识库
- 对高风险问题（价格、法务）使用模板化回复
