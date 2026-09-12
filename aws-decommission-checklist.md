# ArkAgentic AWS 资源清退 CheckList（DNS 切换到 Azure 后执行）

> 目标：完全停止 AWS 侧计费，避免遗留月费。

## 0. 切换前确认（必须）
- [ ] GoDaddy 域名 NS 已切到 Azure DNS：`ns1-04.azure-dns.com` / `ns2-04.azure-dns.net` / `ns3-04.azure-dns.org` / `ns4-04.azure-dns.info`
- [ ] `www.arkagentic.com` 与 `gateway.arkagentic.com` 已在 Azure 侧可访问
- [ ] 业务日志验证 24h 无 AWS 流量依赖

## 1. Route 53 / 域名相关
- [ ] 删除 Route 53 Public Hosted Zone（`arkagentic.com`）中非必要记录
- [ ] 若确认不再用 Route 53 托管：删除 Hosted Zone（注意先清空非 NS/SOA 记录）
- [ ] 关闭 Route 53 Health Checks（如有）

## 2. CloudFront
- [ ] 列出 Distribution，确认是否仍服务旧站/旧静态资源
- [ ] 将 Distribution 状态改为 Disabled
- [ ] 等待 Deployed 后删除 Distribution
- [ ] 删除关联的 Origin Access Identity / Origin Access Control（无依赖后）

## 3. S3（静态站点/归档桶）
- [ ] 导出并备份必要文件（已迁移的 invoice-extractor 可本地再归档一次）
- [ ] 清空对象（含版本化对象 + delete markers）
- [ ] 删除不再使用的 buckets（静态站点桶、日志桶）
- [ ] 关闭 S3 Transfer Acceleration（若开启）

## 4. Amplify（若曾用于前端托管）
- [ ] 删除 Amplify App 与所有 Branch deployments
- [ ] 删除自定义域绑定
- [ ] 删除 Build artifacts / cache

## 5. 计算与容器（若有）
- [ ] EC2 实例停止并最终 terminate
- [ ] EBS 卷、快照（Snapshot）清理
- [ ] ALB/NLB 删除
- [ ] ECS/EKS 集群与服务删除
- [ ] Elastic IP 释放

## 6. 数据与中间件（按需）
- [ ] RDS / Aurora 停止并删除（先做最终快照）
- [ ] ElastiCache 集群删除
- [ ] OpenSearch/DocumentDB/Redshift 评估并删除

## 7. AI / Bedrock / 训练与日志
- [ ] Bedrock 相关推理端点、知识库、Agent 资源删除（如有）
- [ ] SageMaker Endpoint / Notebook / Model / Endpoint Config 清理
- [ ] CloudWatch Logs 保留策略缩短或删除日志组

## 8. IAM 与安全
- [ ] 删除不再使用的 IAM User / Access Key / Role / Policy
- [ ] 删除 ACM 证书（无引用后）
- [ ] 删除 Secrets Manager / SSM Parameter Store 中废弃密钥

## 9. 网络与周边
- [ ] 删除无用 VPC、子网、NAT Gateway、IGW、路由表
- [ ] 删除 WAF、Shield 绑定（如有）
- [ ] 关闭 CloudTrail 多区域跟踪（如不再需要）

## 10. 成本闭环
- [ ] AWS Billing -> Cost Explorer 确认未来 7 天预测接近 0
- [ ] AWS Budgets 设置 1 USD 告警（兜底）
- [ ] 删除/停用无用订阅（Marketplace）

## 推荐执行命令（AWS CLI）
```bash
aws s3 ls
aws cloudfront list-distributions
aws route53 list-hosted-zones
aws amplify list-apps
aws ec2 describe-instances --filters Name=instance-state-name,Values=running,stopped
aws rds describe-db-instances
aws elasticache describe-cache-clusters
```

---
如需，我可以在你完成 NS 切换后，再给你一份“可直接执行的 AWS 一键清理命令脚本（分步骤、带保护确认）”。
