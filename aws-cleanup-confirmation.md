# AWS 清退确认清单（执行完成）

账号：`417074014820`  
执行时间：2026-08-07（本地会话实操）

## ✅ 已清退（按优先级）

### 1) Route 53
- 删除 Hosted Zone：`arkagentic.com`（`Z07586372KGVGVNB7C5LA`）
- 删除前先清空非 NS/SOA 记录（3 条）
- 当前核验：`aws route53 list-hosted-zones` 返回空

### 2) Amplify
- 删除应用：`arkagentic-web`（App ID: `diq11gbr9y0lg`）
- 当前核验：`aws amplify list-apps --region ap-southeast-2` 返回空

### 3) ECS / Fargate / ALB（invoice-extractor 旧栈）
- ECS Service：`invoice-extractor`（已缩容到 0 并删除）
- ECS Cluster：`invoice-extractor-prod`（已删除）
- ALB：`invoice-extractor-alb`（已删除）
- Target Group：`invoice-extractor-tg`（已删除）
- 当前核验：
  - `aws ecs list-clusters --region ap-southeast-2` 返回空
  - `aws elbv2 describe-load-balancers --region ap-southeast-2` 返回空
  - `aws elbv2 describe-target-groups --region ap-southeast-2` 返回空

### 4) S3 / CloudFront
- S3 buckets：原本即为空（无 bucket）
- CloudFront：原本即为空（无 distribution）
- 当前核验：
  - `aws s3api list-buckets` 返回空
  - `aws cloudfront list-distributions` 无条目

### 5) Bedrock
- `us-east-1 / us-west-2 / ap-southeast-2` 下：
  - Provisioned Throughput = 0
  - Custom Models = 0
  - Agents / Knowledge Bases = 0
- 当前核验：相关 list 命令均为空

### 6) 附加清理（防止残留存储费用）
- 删除 ECR 仓库：`invoice-extractor`（`--force`）
- 删除 CloudWatch Log Groups：
  - `/ecs/invoice-extractor`
  - `/aws/amplify/diq11gbr9y0lg`
- 当前核验：`aws logs describe-log-groups --region ap-southeast-2` 返回空

---

## ℹ️ 保留项（默认无费用或极低）
- ACM 证书（ap-southeast-2）仍有两张：
  - `app.arkagentic.com`
  - `*.arkagentic.com`
- 说明：ACM 公有证书本身通常不计费；若你希望“极致清理”，可后续一并删除。

---

## 费用收尾建议（确保月费趋近 0）
1. 等待 Billing/CUR 同步（通常 24~48 小时）
2. 在 Cost Explorer 查看最近 2~3 天按服务明细
3. 建议设置 Budget 告警（1 USD）作为兜底

---

## 本次结论
- 你要求的优先项（Route53 / Bedrock / S3 / CloudFront / Amplify）已清退完成。
- 旧 invoice-extractor 的 ECS+ALB+ECR+日志也已一并清除。
- AWS 侧持续性主要计费资源已基本清空，账单应显著降至接近 0（等待账单系统延迟更新）。
