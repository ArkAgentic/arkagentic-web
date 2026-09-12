# ArkAgentic 企业邮箱白名单与投递稳定性配置手册

> 目标：确保 `@arkagentic.com` 邮箱在注册 OpenAI/Anthropic/GCP/Azure/Moonshot/DeepSeek/DashScope/GLM 时，不被网关拦截、不被灰名单延迟、验证码能稳定送达。

## 0. 当前域名 DNS 快速检查（已实测）

- `A arkagentic.com`：存在（`20.247.218.59`）
- `MX arkagentic.com`：**未查到公开记录**
- `TXT _dmarc.arkagentic.com`：**未查到公开记录**

这通常会显著增加收信异常概率（尤其是验证码邮件）。

---

## 1. P0（必须先做）

## 1.1 为 `arkagentic.com` 补齐标准收信 DNS

按你实际邮件服务商（Google Workspace / Microsoft 365 / 腾讯企业邮 / 阿里企业邮）设置：

1) **MX 记录（必需）**
- 指向你邮箱服务商官方 MX（不要仅依赖 A 记录兜底）

2) **SPF（建议）**
- 根域 TXT 示例（按服务商替换）：
```txt
v=spf1 include:_spf.google.com ~all
```
或
```txt
v=spf1 include:spf.protection.outlook.com ~all
```

3) **DKIM（强烈建议）**
- 在邮箱服务商后台开启 DKIM 并发布对应 TXT

4) **DMARC（强烈建议）**
- 先用监控模式：
```txt
v=DMARC1; p=none; rua=mailto:postmaster@arkagentic.com; fo=1; adkim=r; aspf=r
```
- 稳定后再升级到 `p=quarantine` / `p=reject`

---

## 1.2 网关白名单策略（反垃圾/反钓鱼）

**原则：优先按“认证通过（SPF/DKIM/DMARC）+ 发件域”放行，不要只按显示名称。**

建议先配置以下白名单域（用于注册/验证码/账单通知）：

- OpenAI: `openai.com`
- Anthropic: `anthropic.com`, `claude.com`
- Google/GCP: `google.com`, `googlemail.com`, `cloud.google.com`
- Microsoft/Azure: `microsoft.com`, `azure.com`, `microsoftonline.com`
- Moonshot/Kimi: `moonshot.cn`, `kimi.com`
- DeepSeek: `deepseek.com`
- DashScope/阿里云: `aliyun.com`, `alibabacloud.com`, `dashscope.aliyun.com`
- GLM/智谱: `bigmodel.cn`, `zhipuai.cn`

> 注意：实际发件域可能是服务商邮件基础设施子域，建议在网关里启用“隔离邮件可见 + 可一键放行并加入白名单”。

---

## 1.3 关闭或放宽这些高误杀规则（至少针对上述域）

- URL 重写后拦截（Safe Links）
- 附件沙箱延迟投递（验证码邮件通常无附件，可直接放行）
- 灰名单（Greylisting）
- 严格地理封锁（US/EU 发件 IP）
- 新域名冷启动拦截（First-seen sender block）

---

## 2. 各主流企业邮箱后台的落地位置

## 2.1 Google Workspace
- Admin Console -> Apps -> Google Workspace -> Gmail -> Spam, phishing and malware
- 配置：
  - Approved senders domains（允许域）
  - Bypass spam for messages from senders in approved lists
  - Quarantine digest 开启（便于人工放行）

## 2.2 Microsoft 365 / Defender
- Microsoft Defender portal -> Email & collaboration -> Policies & rules
- 配置：
  - Tenant Allow/Block List（Allowed domains/senders）
  - Anti-spam inbound policy（降低目标域 SCL）
  - Safe Links/Safe Attachments 对目标域设置例外

## 2.3 腾讯企业邮箱 / 阿里企业邮箱（同类）
- 反垃圾设置 -> 白名单（域名白名单）
- 海外邮件策略 -> 对目标域放行
- 隔离区 -> 管理员每天巡检并释放验证码邮件

---

## 3. 验证方案（配置后 10 分钟内执行）

1) 用 `charles.zhang@arkagentic.com` 在 OpenAI 触发一次验证码
2) 记录从触发到收件的时间（目标 < 60 秒）
3) 若失败，去隔离区检索 `openai` 关键字并释放
4) 导出该邮件原始头（message headers），检查：
- SPF=pass
- DKIM=pass
- DMARC=pass/none
5) 把实际发件域加入白名单细化规则

---

## 4. 与本项目上线直接相关的建议

- 建议新增两个运维邮箱：
  - `postmaster@arkagentic.com`
  - `security@arkagentic.com`
- 所有平台账号启用 2FA，并将恢复邮箱指向企业组邮箱
- 邮件网关策略变更纳入上线变更单，避免后续误改回退

---

## 5. 一次性检查命令（给运维）

```bash
# DNS 检查

dig +short MX arkagentic.com
dig +short TXT arkagentic.com
dig +short TXT _dmarc.arkagentic.com

# 预期：MX / SPF / DMARC 均有记录
```

---

## 6. 执行完成判定（Done）

- [ ] `arkagentic.com` 已有 MX
- [ ] SPF 已发布
- [ ] DKIM 已开启并生效
- [ ] DMARC 已发布（至少 p=none）
- [ ] 白名单域已配置
- [ ] OpenAI 验证码 3 次连续送达（<60 秒）
- [ ] Anthropic/GCP 验证邮件各 1 次送达

