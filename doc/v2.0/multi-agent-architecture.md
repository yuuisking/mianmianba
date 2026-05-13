# 面面吧多 Agent 技术架构设计（V1.0）

## 1. 文档目的

本文档描述面面吧未来的多 Agent 技术架构、核心服务边界、数据模型、工作流编排、评估校准机制，以及如何把“面试产品”升级为“高壁垒面试能力系统”。

本文档特别结合了以下实际观察：

- 报告已经出现“多 Agent 评审团”的产品表达。
- 全流程模式已经具备 `planId / stageId / roundId` 等结构。
- 网络层存在：
  - `api/v2/interview-plans`
  - `api/v2/interview-experience-tasks`
  - `api/parse`
  - `api/messages`
  - `api/sessions`
  - `api/v2/review/issues/*`
- 产品已具备流程化、结构化、可演进为多 Agent 编排系统的基础。

---

## 2. 总体结论

面面吧如果想做到“别人能抄界面，但抄不走能力”，技术上不能继续停留在：

- 一个大模型
- 一堆 Prompt
- 一次性生成报告

必须升级为：

- 多 Agent 协同
- 规则与评分标准共同驱动
- 可检索、可记忆、可回放、可校准
- 数据闭环持续反哺模型与策略
- 增量评估与增量报告
- 流式反馈与低等待感知

---

## 3. 架构原则

## 3.1 不能让一个大模型包打一切

单模型负责：

- 出题
- 追问
- 判分
- 总结
- 计划

会出现以下问题：

- 风格不稳定
- 自证正确
- 同一答案前后评分漂移
- 报告无法解释
- 追问与评分互相污染

## 3.2 正确原则

每个 Agent 只负责单一、可验证的任务，并输出结构化结果。

## 3.3 核心设计目标

- 可解释
- 可回放
- 可校准
- 可进化
- 可观测
- 可控成本
- 可增量输出
- 低首反馈延迟

## 3.4 面试间交互约束

- 不引入“思考时间按钮”或“澄清按钮”作为标准面试交互。
- 面试时长天然包含思考成本，系统不额外赠送停表时间。
- 当用户长时间未输入时，系统应主动提示用户开始给出思路，而不是无限等待。
- 等待阶段必须可见，用户要知道系统正在分析什么、生成什么。

---

## 4. 系统总体架构

```text
用户输入
  -> 会话编排层
    -> 岗位建模 Agent
    -> 面试策略 Agent
    -> 证据抽取 Agent
    -> 维度评审 Agent 集群
    -> 交叉质询 Agent
    -> 教练 Agent
    -> 计划 Agent
    -> 检索层 / 案例库 / 知识库
    -> 记忆层 / 成长档案
    -> 流式反馈层 / 增量报告层
  -> 结构化存储
  -> 报告生成层
  -> 行动回流层
```

---

## 5. Agent 角色设计

## 5.1 Role / JD Parser Agent

### 职责

- 解析岗位、公司、级别、JD、简历
- 输出岗位能力图谱
- 识别优先能力维度

### 输入

- 目标岗位
- 目标公司
- JD 文本
- 简历文本

### 输出

- role_profile
- level_profile
- company_style_profile
- capability_weights
- likely_rounds

### 价值

这是所有“岗位化”能力的源头，决定后续问什么、怎么判。

---

## 5.2 Interview Strategist Agent

### 职责

- 决定本轮面试/训练应该问什么
- 决定追问顺序和深度
- 控制轮次节奏

### 输入

- 岗位画像
- 用户历史薄弱点
- 当前计划阶段
- 当前轮次目标

### 输出

- question_plan
- followup_policy
- stop_condition
- stage_goal

### 价值

让系统不再是随机追问，而是有明确策略的“面试编排器”。

---

## 5.3 Evidence Extractor Agent

### 职责

- 将回答切片
- 提取证据片段
- 标注哪些片段可能支持哪些维度

### 输入

- question
- answer_text
- current_dimension_targets

### 输出

- evidence_spans
- weak_spans
- uncertain_spans
- candidate_dimension_links

### 价值

这是报告证据化的基础，没有它，就只有“总结”，没有“证据”。

---

## 5.4 Dimension Judge Agents

每个维度一个独立 Judge，不共享彼此结论。

### 建议初始 Judge

- Structure Judge：结构化表达
- Evidence Judge：证据充分性与量化指标
- Depth Judge：技术深度与原理
- Diagnosis Judge：问题拆解与定位
- Tradeoff Judge：方案权衡
- Role Match Judge：岗位匹配度
- Authenticity Judge：真实性与实战感
- Communication Judge：表达稳定性与清晰度

### 输入

- question
- answer
- evidence_spans
- role_profile

### 输出

- score
- confidence
- reasons
- citations
- challenge_points

### 价值

解决“一个模型既当老师又当裁判”的问题。

---

## 5.5 Cross-Examiner Agent

### 职责

- 找出回答中的漏洞
- 识别伪高分回答
- 给下一轮追问制造“压强”

### 擅长识别的问题

- 结构完整但没做过
- 概念对但不能落地
- 指标丰富但缺业务判断
- 讲方案但没有边界

### 输出

- contradiction_points
- missing_details
- next_followup_candidates

### 价值

这是区分“会背”和“会做”的关键 Agent。

---

## 5.6 Coach Agent

### 职责

- 把评审结果转成用户能执行的建议
- 生成改写版本
- 推荐下一步动作

### 输出

- rewrite_suggestion
- practice_action
- learning_recommendation
- same_question_retry_prompt

### 价值

把系统从“评分器”变成“教练”。

---

## 5.7 Planner Agent

### 职责

- 将多轮报告转成结构化训练计划
- 给出连续训练动作序列

### 输出

- plan_items
- priorities
- estimated_time
- success_criteria

### 价值

这是留存和闭环运营的核心。

---

## 5.8 Retrieval Agent

### 职责

- 从知识库、题库、案例库、历史样本中检索最相关材料

### 检索对象

- 岗位题目图谱
- 公开面经样本
- 高分案例
- 低分反例
- 学习内容卡片
- 过往用户相似问题

### 价值

降低模型“现编”风险，提升稳定性和专业性。

---

## 5.9 Calibration Agent

### 职责

- 监控各 Judge 漂移
- 统一分数尺度
- 对低一致性结果做重审或降置信输出

### 输出

- calibrated_scores
- disagreement_report
- final_confidence

### 价值

没有校准，就没有稳定可信度。

---

## 5.10 Trust Agent

### 职责

- 当证据不足时，明确返回“不足以判断”
- 控制系统不要伪造高置信结论

### 输出

- abstain / low_confidence / ask_for_more

### 价值

这是系统建立信任的关键守门员。

---

## 5.11 模块化 Agent 团总原则

上面的 Agent 角色是“能力原子”，真正落到系统里，不应该只按单个 Agent 理解，而应该按“模块级 Agent 团”来设计。

也就是说：

- 阶段面试是一个 Agent 团
- 全流程面试是一个 Agent 团
- 专项训练是一个 Agent 团
- 复盘中心是一个 Agent 团
- 成长档案是一个 Agent 团
- 知识中心建设是一个 Agent 团
- 面经采集整理审核是一个 Agent 团
- Offer Ready 是一个 Agent 团

这些 Agent 团应：

- 有独立 service
- 有独立数据边界
- 有独立指标
- 有独立策略版本
- 互相通过结构化接口通信，而不是共享内部推理状态

### 为什么必须这么做

如果所有模块都共用同一套 Agent 逻辑、同一套状态、同一套上下文，很容易出现：

- 一个模块的策略变更影响其他模块
- 评审逻辑串味
- 数据口径混乱
- 难以回放和定位错误

### 正确方式

- 共享通用能力内核
- 模块上层各自编排
- service 之间只交换结构化结果

---

## 6. Agent 工作流

## 6.1 首次建模工作流

```text
用户输入岗位/公司/JD/简历
  -> Role/JD Parser Agent
  -> Retrieval Agent 检索岗位画像、公开面经、题型权重
  -> Interview Strategist Agent 生成初始问题树
  -> 存储 plan / stage / round 初始化记录
```

## 6.2 单轮问答工作流

```text
用户回答
  -> Evidence Extractor Agent
  -> 多个 Dimension Judge 并行评分
  -> Cross-Examiner Agent 找漏洞
  -> Calibration Agent 汇总校准
  -> Trust Agent 判断是否能高置信给结论
  -> Interview Strategist Agent 决定下一问
  -> Coach Agent 生成本轮即时建议
  -> 增量报告层更新摘要、问题、候选动作
  -> 结构化结果入库
```

## 6.3 报告生成工作流

```text
轮次结束
  -> 聚合多轮 evidence / scores / followups
  -> Planner Agent 生成后续训练计划
  -> Coach Agent 生成用户可执行建议
  -> 报告模板层渲染
```

## 6.3.1 增量报告工作流

```text
每轮回答结束
  -> 写入轮次结构化结果
  -> 更新当前维度变化
  -> 预计算表现亮点 / 风险 / 下一步动作
  -> 缓存到 session_report_state

用户结束面试
  -> 立即返回骨架报告
  -> 持续补齐细粒度评审与证据引用
```

### 增量报告原则

- 报告不应完全依赖“结束后一次性大生成”。
- 中间态评估应在面试过程中异步完成。
- 最终报告由“预计算中间结果 + 最终聚合”组成。

## 6.3.2 流式反馈工作流

```text
用户发送回答
  -> 会话层立即确认收到
  -> Interview Strategist / Cross-Examiner 开始准备下一问
  -> 前端展示分析状态
  -> 首个可见反馈尽快返回
  -> 后续长文本继续补全
```

### 流式反馈原则

- 目标不是必须“逐字输出”，而是缩短首反馈时间。
- 可以使用 SSE、WebSocket 或分段响应，只要用户能及时感知系统仍在工作。
- 技术实现应服务于感知速度，而不是为了流式而流式。

## 6.4 全流程面试工作流

```text
创建 Interview Plan
  -> Stage 生成（HR / 一面 / 二面 / 终面）
  -> 每个 Stage 绑定目标能力和题型策略
  -> 每轮完成后生成 Round Review
  -> 通过策略决定下一 Stage
  -> 汇总形成 Final Review
```

---

## 7. 模块级 Agent 团设计

## 7.1 阶段面试评审团

### 目标

负责单场阶段面试中的出题、追问、判分、即时建议和阶段报告。

### 团队组成

- Role / JD Parser Agent
- Interview Strategist Agent
- Evidence Extractor Agent
- Dimension Judge Agents
- Cross-Examiner Agent
- Coach Agent
- Trust Agent

### 输入

- user_profile
- role_profile
- jd
- resume
- current_question
- current_answer

### 输出

- next_question
- round_scores
- evidence_spans
- coach_feedback
- round_summary

### 数据流转例子

```text
用户回答“React 性能优化如何落地”
  -> Evidence Extractor 抽取“LCP / INP / 长任务 / 虚拟列表”等证据
  -> Depth Judge 判断技术深度
  -> Structure Judge 判断表达结构
  -> Cross-Examiner 判断是否只是背概念
  -> Coach 生成“同题重答建议”
  -> Interview Strategist 决定下一问：继续深挖项目场景
```

### 详细业务例子

用户目标岗位是“美团前端工程师”，当前进行的是一场单独的“一面模拟”。

面试官给出问题：

`你刚才提到做过首页性能优化，具体你怎么定位问题、怎么落地、结果怎么证明？`

用户回答：

`我们先看 Lighthouse 分数，然后做了一些缓存，也做了图片懒加载，最后性能提升还不错。`

这时阶段面试评审团不会只判断“回答对不对”，而是会拆成几个独立判断动作：

- `Evidence Extractor Agent` 判断这段回答里是否真的出现了可验证证据，例如具体指标、排查路径、实验方式、上线结果。
- `Dimension Judge Agents` 分别判断技术深度、结构化表达、结果导向、项目真实性。
- `Cross-Examiner Agent` 识别这是不是“概念堆砌型回答”，如果回答里只有名词没有过程，就触发深挖。
- `Coach Agent` 不直接替用户回答，而是指出“缺少起点指标、瓶颈定位路径、优化优先级和收益验证”。
- `Interview Strategist Agent` 根据当前缺口，决定下一问应该深挖“真实项目过程”，而不是换题。

### 输入样本

```json
{
  "session_type": "stage_interview",
  "target_company": "美团",
  "target_role": "前端工程师",
  "stage_type": "first_round",
  "question": {
    "question_id": "q_101",
    "text": "你刚才提到做过首页性能优化，具体你怎么定位问题、怎么落地、结果怎么证明？",
    "target_dimensions": ["technical_depth", "evidence", "structure", "authenticity"]
  },
  "answer": {
    "answer_id": "a_101",
    "text": "我们先看 Lighthouse 分数，然后做了一些缓存，也做了图片懒加载，最后性能提升还不错。"
  },
  "user_profile": {
    "work_years": 3,
    "resume_project_tags": ["首页改版", "性能优化", "React"]
  }
}
```

### 结构化输出样本

```json
{
  "round_scores": {
    "technical_depth": 6.4,
    "evidence": 4.8,
    "structure": 5.9,
    "authenticity": 6.1
  },
  "evidence_spans": [
    {
      "text": "看 Lighthouse 分数",
      "dimension": "evidence",
      "confidence": 0.72,
      "problem": "只有笼统指标，没有起始值和结果值"
    },
    {
      "text": "做了一些缓存，也做了图片懒加载",
      "dimension": "technical_depth",
      "confidence": 0.81,
      "problem": "没有说明为什么先做这些动作"
    }
  ],
  "coach_feedback": [
    "先说排查路径，再说优化动作，最后说结果验证。",
    "至少补上一个真实指标，例如 LCP 从多少降到多少。",
    "说明你如何判断瓶颈在图片、缓存还是长任务。"
  ],
  "next_question": "如果让你重新做一次，你会先看哪些指标，怎么确定瓶颈优先级？",
  "round_summary": "候选人知道常见优化手段，但证据不足，缺少完整诊断与验证闭环。"
}
```

### 详细流转拆解

- `Role / JD Parser Agent` 先确认这道题对该岗位最重要的是“真实项目深度”，不是八股记忆。
- `Evidence Extractor Agent` 把回答拆成证据片段，标记哪些句子可用于最终报告，哪些只是空泛描述。
- `Dimension Judge Agents` 不共享彼此打分过程，只输出各自维度判断，避免一个维度污染另一个维度。
- `Cross-Examiner Agent` 发现回答中缺少“指标起点-定位方法-收益证明”三段式链路，于是要求下一问继续深挖。
- `Coach Agent` 产出的内容会进入用户可见反馈，也会沉淀到后续专项训练任务。
- `Trust Agent` 如果发现证据极少但分数异常偏高，会触发校准，避免单个 Judge 误判。

### 对应 service

- `stage_interview_service`

### 对应数据边界

- stage_interview_sessions
- stage_interview_questions
- stage_interview_answers
- stage_interview_scores
- stage_interview_evidences

---

## 7.2 全流程面试评审团

### 目标

负责从公司流程生成、阶段编排、轮次推进，到阶段结果和流程总结。

### 团队组成

- Company Process Parser Agent
- Experience Retrieval Agent
- Plan Builder Agent
- Stage Strategist Agent
- Interviewer Persona Builder Agent
- Main Interviewer Agent
- Panelist Interviewer Agents
- Panel Vote Aggregator Agent
- Stage Gatekeeper Agent
- Round Orchestrator Agent
- Round Review Aggregator Agent
- Final Flow Reviewer Agent
- Risk Predictor Agent

### 输入

- target_company
- target_role
- target_level
- jd
- resume
- public_experience_data

### 输出

- interview_plan
- stages
- rounds
- interviewer_lineup
- panel_votes
- stage_pass_decision
- stage_goals
- pass_conditions
- flow_risk_report

### 数据流转例子

```text
用户发起“字节跳动前端开发工程师全流程”
  -> Experience Retrieval Agent 拉取字节前端公开面经
  -> Company Process Parser Agent 识别常见流程：一面/二面/业务面
  -> Plan Builder Agent 生成 plan、stage、round
  -> Interviewer Persona Builder Agent 生成“团队主干 1 / 团队主干 2 / 主管 / leader / HR”面试官阵列
  -> Stage Strategist 为一面绑定“项目深挖 + 性能与工程化”
  -> Panelist Interviewer Agents 在本轮结束后分别投票
  -> Panel Vote Aggregator Agent 汇总票数
  -> Stage Gatekeeper Agent 判断是否过半晋级
  -> Round Review Aggregator 在每轮结束后写阶段结论
  -> Risk Predictor 生成“最可能卡在二面系统设计”
```

### 详细业务例子

这里的 `Plan Builder Agent` 可以直接理解为“生产面试流程的 Agent”，但它生产的不是死板模板，而是“结合公司、岗位、级别、部门方向、公开面经模式、用户履历”动态生成的流程计划。

例如用户选择：

- 目标公司：字节跳动
- 目标岗位：前端开发工程师
- 目标级别：3 年经验
- 目标部门偏好：电商业务

系统不会只返回一个“全流程面试”按钮，而会先生成一个完整 `plan`：

- 这一条 `plan` 代表“这次备战字节前端电商方向的完整招聘流程”
- `stage` 代表流程里的阶段，例如一面、二面、主管面、HR 面
- `round` 代表每个阶段内真实发生的一轮问答与评审

如果公开面经显示该方向常见模式是：

- 一面重点看项目真实性、性能优化、工程化
- 二面重点看系统设计、跨团队协作、复杂问题拆解
- 主管面重点看业务判断和 owner 意识
- HR 面重点看动机、稳定性、沟通风险

那么 `Plan Builder Agent` 生成的就不是固定 `1 面 -> 2 面 -> HR 面` 三步，而是可能生成：

- `stage_1`: 技术初筛面
- `stage_2`: 深度技术面
- `stage_3`: 业务主管面
- `stage_4`: HR 决策面

并且每个 `stage` 下还会附带：

- 阶段目标
- 阶段通过条件
- 重点能力维度
- 推荐题型组合
- 需要从上一阶段继承的风险点
- 当前主面试官画像
- 本轮评审团配置
- 过轮投票规则

### 新增原则：全流程面试不是“单 Agent 连续问”，而是“预置面试官链路 + 评审团投票推进”

如果整条全流程都只是同一个 Agent 在问，哪怕有 `stage` 和 `round`，用户感知上仍然像“同一个人换着题目问我”。

更真实也更有壁垒的做法是：

- 每一轮预置不同面试官角色。
- 每种角色有不同关注点、追问风格、容忍度和否决点。
- 每一轮结束后不是直接给一个分数，而是进入评审团投票。
- 只有票数过半，本轮才通过并进入下一轮。

### 预置面试官链路建议

以常见技术岗全流程为例，可以默认预置：

- `团队主干 1 Agent`
  - 一面主面试官。
  - 关注项目真实性、基础能力、细节是否讲透。
- `团队主干 2 Agent`
  - 二面主面试官。
  - 关注复杂问题、系统设计、技术取舍。
- `团队主管 Agent`
  - 主管面主面试官。
  - 关注业务理解、协作推进、owner 意识。
- `团队 Leader Agent`
  - 高阶面或 leader 面主面试官。
  - 关注方向判断、影响力、复杂项目抽象能力。
- `HR Agent`
  - HR 面主面试官。
  - 关注动机、稳定性、职业逻辑、沟通风险。

注意，这里的“主干 1 / 主干 2 / 主管 / leader / HR”不是写死名字，而是预置角色模板。`Plan Builder Agent` 会根据公司、岗位、年限、部门方向决定一条流程里是否启用全部角色，还是只启用其中几种。

### 每个面试官角色的提问风格模板

#### 团队主干 1

- 角色定位：一线执行型主面试官
- 提问风格：细节深挖、连续追问、验证真实性
- 常问问题：
  - 这个项目你具体负责哪一段？
  - 这个指标为什么会变差？
  - 你当时第一步是怎么定位的？
- 重点观察：
  - 项目真实性
  - 基础能力是否扎实
  - 是否能把做过的事情讲透

#### 团队主干 2

- 角色定位：进阶技术主面试官
- 提问风格：复杂问题拆解、方案取舍、边界追问
- 常问问题：
  - 如果流量再放大 10 倍，你的方案还能成立吗？
  - 为什么用这个方案，不用另一个方案？
  - 你的系统瓶颈在哪里？
- 重点观察：
  - 系统设计能力
  - 复杂场景应对能力
  - 方案权衡是否成熟

#### 团队主管

- 角色定位：业务与协作主面试官
- 提问风格：业务上下文、跨团队协作、结果责任
- 常问问题：
  - 这个项目为什么值得做？
  - 你和产品、测试、后端是怎么协作推进的？
  - 当目标冲突时你如何决策？
- 重点观察：
  - 业务理解
  - owner 意识
  - 协作与推进能力

#### 团队 Leader

- 角色定位：方向判断型主面试官
- 提问风格：抽象总结、方向判断、影响力追问
- 常问问题：
  - 如果让你重来一次，你会换掉什么策略？
  - 你怎么看未来一年这个方向最重要的问题？
  - 你如何影响团队而不是只完成自己任务？
- 重点观察：
  - 方向感
  - 影响力
  - 对复杂项目的抽象能力

#### HR

- 角色定位：稳定性与匹配度主面试官
- 提问风格：动机澄清、职业逻辑、沟通风险识别
- 常问问题：
  - 为什么想来这家公司？
  - 为什么离开上一家公司？
  - 你希望下一份工作获得什么？
- 重点观察：
  - 求职动机
  - 稳定性
  - 职业叙事是否一致

### 输入样本

```json
{
  "user_id": "u_9001",
  "target_company": "字节跳动",
  "target_role": "前端开发工程师",
  "target_level": "P5_like",
  "target_department": "电商业务",
  "resume_summary": {
    "years": 3,
    "projects": ["交易首页改版", "营销活动平台", "性能治理专项"]
  },
  "jd_signals": [
    "复杂前端系统建设",
    "性能优化",
    "工程化体系",
    "业务协同"
  ],
  "public_experience_data": {
    "sample_count": 126,
    "common_stages": ["一面", "二面", "主管面", "leader面", "HR面"],
    "stage_topics": {
      "一面": ["项目深挖", "性能优化", "工程化"],
      "二面": ["系统设计", "复杂场景拆解", "跨团队协作"],
      "主管面": ["业务理解", "owner意识", "优先级判断"],
      "leader面": ["方向判断", "复杂项目抽象", "影响力"],
      "HR面": ["动机", "稳定性", "沟通"]
    }
  },
  "panel_policy": {
    "default_panel_size": 5,
    "pass_rule": "strict_majority"
  }
}
```

### 结构化输出样本

```json
{
  "interview_plan": {
    "plan_id": "plan_bt_fe_001",
    "plan_name": "字节跳动前端开发工程师全流程模拟",
    "company": "字节跳动",
    "role": "前端开发工程师",
    "department_hint": "电商业务",
    "plan_goal": "模拟真实招聘流程并找出最可能挂点",
    "predicted_difficulty": "high"
  },
  "stages": [
    {
      "stage_id": "s1",
      "stage_type": "first_round",
      "stage_name": "技术初筛面",
      "focus_dimensions": ["project_depth", "performance", "engineering"],
      "pass_conditions": ["核心项目可讲透", "能说明性能优化闭环"],
      "inherit_risks_to_next_stage": ["如果项目证据不足，二面系统设计可信度会下降"],
      "main_interviewer_role": "团队主干1",
      "panel_policy": {
        "panel_size": 5,
        "pass_threshold": 3
      }
    },
    {
      "stage_id": "s2",
      "stage_type": "second_round",
      "stage_name": "深度技术面",
      "focus_dimensions": ["system_design", "tradeoff", "complex_problem_solving"],
      "pass_conditions": ["能做前端架构拆解", "能解释方案取舍"],
      "inherit_risks_to_next_stage": ["系统设计不稳会影响主管面对 owner 判断"],
      "main_interviewer_role": "团队主干2",
      "panel_policy": {
        "panel_size": 5,
        "pass_threshold": 3
      }
    },
    {
      "stage_id": "s3",
      "stage_type": "manager_round",
      "stage_name": "业务主管面",
      "focus_dimensions": ["business_alignment", "ownership", "collaboration"],
      "pass_conditions": ["能说明业务价值", "能处理跨团队冲突"],
      "main_interviewer_role": "团队主管",
      "panel_policy": {
        "panel_size": 3,
        "pass_threshold": 2
      }
    },
    {
      "stage_id": "s4",
      "stage_type": "leader_round",
      "stage_name": "团队 Leader 面",
      "focus_dimensions": ["direction", "influence", "complex_project_abstraction"],
      "pass_conditions": ["能说明方向判断", "能体现影响力与复杂项目抽象能力"],
      "main_interviewer_role": "团队Leader",
      "panel_policy": {
        "panel_size": 3,
        "pass_threshold": 2
      }
    },
    {
      "stage_id": "s5",
      "stage_type": "hr_round",
      "stage_name": "HR 决策面",
      "focus_dimensions": ["motivation", "career_logic", "communication"],
      "pass_conditions": ["求职动机清晰", "离职原因稳定"],
      "main_interviewer_role": "HR",
      "panel_policy": {
        "panel_size": 3,
        "pass_threshold": 2
      }
    }
  ],
  "rounds": [
    {
      "round_id": "r1",
      "stage_id": "s1",
      "round_goal": "验证项目真实性与性能治理经验",
      "recommended_question_types": ["项目深挖", "指标追问", "方案取舍"],
      "interviewer_role": "团队主干1"
    },
    {
      "round_id": "r2",
      "stage_id": "s2",
      "round_goal": "验证系统设计与复杂场景拆解",
      "recommended_question_types": ["架构设计", "边界场景", "故障应对"],
      "interviewer_role": "团队主干2"
    },
    {
      "round_id": "r3",
      "stage_id": "s4",
      "round_goal": "验证方向判断与复杂项目影响力",
      "recommended_question_types": ["方向选择", "复杂项目抽象", "影响力追问"],
      "interviewer_role": "团队Leader"
    }
  ],
  "interviewer_lineup": [
    {
      "stage_id": "s1",
      "main_interviewer": {
        "role": "团队主干1",
        "style": "细节深挖",
        "focus": ["项目真实性", "技术细节", "执行深度"]
      },
      "panel_reviewers": [
        "技术深度评审",
        "表达结构评审",
        "项目真实性评审",
        "权衡能力评审",
        "风险校准评审"
      ]
    }
  ],
  "panel_votes": {
    "stage_id": "s1",
    "votes": [
      {"reviewer": "技术深度评审", "vote": "pass", "reason": "项目细节基本可信"},
      {"reviewer": "表达结构评审", "vote": "pass", "reason": "回答结构完整"},
      {"reviewer": "项目真实性评审", "vote": "fail", "reason": "部分关键动作归因不够清晰"},
      {"reviewer": "权衡能力评审", "vote": "pass", "reason": "能说明优化取舍"},
      {"reviewer": "风险校准评审", "vote": "fail", "reason": "证据强度不够稳定"}
    ],
    "result": {
      "pass_votes": 3,
      "fail_votes": 2,
      "passed": true,
      "decision_rule": "5票中至少3票通过"
    }
  },
  "stage_pass_decision": {
    "stage_id": "s1",
    "status": "borderline_pass",
    "next_stage_id": "s2",
    "plus_points": ["结构完整", "性能优化取舍基本成立"],
    "improvement_points": ["项目真实性归因不够清晰", "证据强度不够稳定"],
    "before_next_stage_actions": ["进入项目举证专项训练"]
  },
  "flow_risk_report": {
    "highest_risk_stage": "s2",
    "risk_reason": "用户履历中系统设计暴露不足，公开面经显示二面高频深挖该能力"
  }
}
```

### 详细流转拆解

- `Experience Retrieval Agent` 先从面经网络取出“这家公司、这个岗位、这个部门方向”的历史模式，不直接碰用户会话数据。
- `Company Process Parser Agent` 负责识别真实流程结构，例如有些团队是“两轮技术 + 主管 + HR”，有些则是“三轮技术 + HR”。
- `Plan Builder Agent` 把公司流程模式、岗位要求、用户履历弱项合成一条具体 `plan`，这一步就是“生产面试流程”。
- `Interviewer Persona Builder Agent` 为每个 `stage` 绑定主面试官角色与风格，例如“团队主干 1 偏项目细节深挖”，“团队主管偏业务与协作判断”。
- `Stage Strategist Agent` 为每个 `stage` 写清楚阶段目标、题型策略、重点维度、通过条件和投票规则。
- `Main Interviewer Agent` 负责本轮实际发问，它代表当前轮次最主要的面试官人格。
- `Panelist Interviewer Agents` 不负责主问答推进，而是在回答结束后从不同视角独立评审和投票。
- `Panel Vote Aggregator Agent` 负责汇总 `3 人评审团` 或 `5 人评审团` 的票数，并沉淀内部通过依据与薄弱点。
- `Stage Gatekeeper Agent` 根据过半规则决定“通过 / 淘汰 / 待补强后重试”，它是流程推进的闸门。
- `Round Orchestrator Agent` 在真正执行时，负责把某个阶段拆成一轮轮可执行问答，而不是一次性把整套流程全问完。
- `Round Review Aggregator Agent` 每轮结束就写阶段中间结论，这样后续阶段可以继承前面暴露的问题，也可以解释为什么本轮虽然过了但仍需补强。
- `Final Flow Reviewer Agent` 在整条流程结束后，输出“卡点主要在哪一关、为什么、补强顺序是什么”。
- `Risk Predictor Agent` 的作用不是简单打分，而是预测“最可能在哪一面挂掉”，这对用户的感知价值很高。

### 每类评审票的判定标准

#### 技术深度票

- 投通过：
  - 能解释原理，不只是背概念
  - 能说明关键技术动作与结果关系
- 投不通过：
  - 只有术语，没有机制解释
  - 一旦深入追问就失真

#### 表达结构票

- 投通过：
  - 回答有稳定骨架
  - 面试官能快速抓住背景、动作、结果
- 投不通过：
  - 叙事跳跃
  - 重点不明确
  - 追问后结构崩掉

#### 项目真实性票

- 投通过：
  - 能说清自己负责的部分
  - 关键动作、关键决策、关键结果对得上
- 投不通过：
  - 经常使用“我们做了”但说不清自己做了什么
  - 指标、过程、归因明显含糊

#### 权衡能力票

- 投通过：
  - 能说明为何选 A 不选 B
  - 能识别成本、收益、风险与约束
- 投不通过：
  - 只给结果，不给决策依据
  - 不会比较替代方案

#### 风险校准票

- 投通过：
  - 关键结论都有足够证据支撑
  - 整体表现稳定，没有明显虚高
- 投不通过：
  - 单项分数偏高但证据薄弱
  - 回答波动大，可信度不足

### 投票机制设计建议

#### 1. 评审团人数

- 普通轮次可使用 `3 人评审团`
- 关键技术轮或关键决策轮可使用 `5 人评审团`

#### 2. 投票规则

- `3 人评审团` 至少 `2` 票通过才晋级
- `5 人评审团` 至少 `3` 票通过才晋级
- 未过半则本轮失败，不进入下一轮

#### 3. 票型来源

每张票都应来自不同视角，而不是多个 Agent 重复做同一件事。示例：

- 技术深度票
- 表达结构票
- 项目真实性票
- 权衡能力票
- 风险校准票

#### 4. 险过场景

如果票数刚好险过，例如 `3:2`，系统内部应额外记录：

- 哪两票投了反对
- 反对理由是什么
- 是否要求进入下一轮前先做补强动作

### 过轮 / 挂轮 / 带争议晋级 状态机

内部状态机可以保留 3 种结果：

- `passed`
  - 明确通过，进入下一轮
- `failed`
  - 本轮未通过，进入复盘与补强
- `borderline_pass`
  - 票数过半但存在明显薄弱点，允许进入下一轮，但系统强制写入补强动作

```text
stage_running
  -> panel_voting
  -> if pass_votes >= threshold and weak_points not severe
       => passed
  -> if pass_votes >= threshold but weak_points severe
       => borderline_pass
  -> if pass_votes < threshold
       => failed
```

### 前端页面如何展示投票与结果

你说得对，理论上用户前台不应该感受到“争议”这个词本身，否则会把系统搞得太像后台风控界面。

更好的方式是：

- 内部保留 `passed / failed / borderline_pass` 三种状态，服务于后续流程控制。
- 前端只展示两种用户结果：
  - `本轮通过`
  - `本轮未通过`
- 无论通过还是未通过，都给两类信息：
  - `加一项`
  - `优化点`

### 前端展示示例

#### 用户通过时

- 标题：`本轮通过，进入下一轮`
- 加一项：
  - 你的结构化表达稳定，性能优化取舍也说明得比较清楚。
- 优化点：
  - 项目真实性归因还不够强，进入下一轮前建议先补一次项目举证训练。

#### 用户未通过时

- 标题：`本轮未通过`
- 加一项：
  - 你的表达结构比上一次更稳定。
- 优化点：
  - 项目真实性和证据强度未达到通过线，建议先完成项目举证训练，再重新挑战本轮。

### 为什么前端不要展示复杂票型

- 用户真正关心的是“我过没过”。
- 用户第二关心的是“我哪里做得不错”。
- 用户第三关心的是“我下一步该改什么”。

因此前端不需要把 5 张票逐条暴露成复杂裁决页，而应该把投票结果压缩成：

- 结果
- 加一项
- 优化点
- 下一步动作

### 详细业务例子补充：一面结束后如何投票决定是否进入二面

用户完成“字节前端一面”，主面试官是 `团队主干 1 Agent`，问题主要围绕项目真实性、性能优化、工程化细节。

问答结束后，并不是主面试官自己宣布“你过了”，而是进入评审团：

- `技术深度评审 Agent`
- `表达结构评审 Agent`
- `项目真实性评审 Agent`
- `权衡能力评审 Agent`
- `风险校准评审 Agent`

五个评审各自独立看本轮回答证据后给票：

- 技术深度：通过
- 表达结构：通过
- 项目真实性：不通过
- 权衡能力：通过
- 风险校准：不通过

最终结果：

- 通过票 `3`
- 不通过票 `2`
- 已过半，因此允许进入二面

但 `Stage Gatekeeper Agent` 在内部会把这次晋级记成 `borderline_pass`，并同步给二面：

- 加一项：结构清晰、取舍表达基本过线
- 优化点：项目真实性不足、证据稳定性偏弱
- 二面需要优先验证：系统设计是否也存在“说得像做得少”的问题

### 对应 service

- `full_flow_interview_service`

### 对应数据边界

- interview_plans
- interview_plan_stages
- interview_plan_rounds
- interview_stage_interviewers
- interview_panel_votes
- interview_stage_decisions
- interview_process_templates
- interview_process_predictions

---

## 7.3 专项训练评审团

### 目标

围绕单一薄弱点进行连续纠偏、同题重答、改写和能力验证。

### 团队组成

- Weakness Focus Agent
- Drill Strategist Agent
- Rewrite Coach Agent
- Retry Comparator Agent
- Practice Judge Agents
- Practice Planner Agent

### 输入

- issue_id
- target_dimension
- previous_evidence
- current_answer

### 输出

- rewrite
- retry_prompt
- delta_report
- next_drill

### 数据流转例子

```text
用户当前问题是“结构化表达（STAR）”
  -> Weakness Focus Agent 聚焦该维度
  -> Drill Strategist Agent 生成同题重答训练
  -> Rewrite Coach Agent 给出 STAR 改写
  -> 用户再次作答
  -> Retry Comparator Agent 比较前后差异
  -> Practice Judge Agents 写入提升量
```

### 详细业务例子

用户在多次面试中都出现同一个问题：回答项目经历时没有结构，常常想到哪里说到哪里，导致面试官听不出重点。

专项训练评审团不会给用户泛泛建议“请使用 STAR”，而是会把这个问题拆成一个连续纠偏链路：

- 先识别这个弱项是否稳定存在。
- 再把弱项压缩成一个可训练单元，例如“项目题回答必须包含背景、目标、动作、结果”。
- 然后要求用户对同一道题进行重答，而不是直接换新题。
- 最后对比前后差异，判断是真提升还是只是表面变长。

### 输入样本

```json
{
  "issue_id": "issue_star_01",
  "target_dimension": "structured_expression",
  "source_question": "讲一个你主导推进并最终拿到结果的项目。",
  "previous_answer": "我做过一个活动平台，主要负责前端开发，后来做了很多优化，最后效果也挺好的。",
  "previous_evidence": [
    "缺少项目背景",
    "缺少个人动作",
    "缺少结果指标"
  ],
  "training_goal": "让回答具备 STAR 骨架并能说出个人贡献"
}
```

### 结构化输出样本

```json
{
  "rewrite": {
    "framework": "STAR",
    "draft": "当时活动平台在大促前经常出现搭建效率低、线上问题多的情况。我的任务是把页面搭建效率提升并降低发布事故。我主导做了组件模板化、预发校验和埋点回查机制，推动运营模板使用规范上线。最终页面搭建时间从平均 2 小时降到 40 分钟，活动发布后的回滚率下降了 35%。"
  },
  "retry_prompt": "请你不用照读，按背景、任务、动作、结果四段重新讲一遍，并强调你本人做了什么。",
  "delta_report": {
    "before_score": 4.9,
    "after_score": 7.2,
    "improvements": ["结构完整", "个人动作清晰", "结果可量化"],
    "remaining_gaps": ["缺少一个具体权衡点"]
  },
  "next_drill": "继续做一次追问训练：如果资源不够，你当时为什么优先做模板化而不是先重构底层？"
}
```

### 详细流转拆解

- `Weakness Focus Agent` 负责确认这是不是一个稳定弱项，而不是单次失误。
- `Drill Strategist Agent` 决定训练方式，如果问题是结构混乱，就先做“同题重答”；如果问题是内容空泛，就先做“证据补强”。
- `Rewrite Coach Agent` 会生成一版高质量参考表达，但不会把这版内容直接当成最终结果，而是作为训练脚手架。
- `Retry Comparator Agent` 对比前后两次回答时，不只比较长度，而是比较结构完整度、证据密度和个人贡献度。
- `Practice Judge Agents` 最终把提升量写回训练记录，这些结果后续会被复盘中心和成长档案继续使用。

### 对应 service

- `practice_training_service`

### 对应数据边界

- practice_sessions
- practice_rounds
- practice_comparisons
- practice_rewrites
- practice_improvements

---

## 7.4 复盘中心评审团

### 目标

从多场训练、模拟、全流程结果中聚合问题，识别稳定弱项与关键风险，并生成行动建议。

### 团队组成

- Issue Aggregator Agent
- Stability Analyzer Agent
- Impact Scorer Agent
- Evidence Grouper Agent
- Action Recommender Agent

### 输入

- historical_scores
- historical_evidences
- historical_reports
- user_goal

### 输出

- issue_list
- stability_type
- impact_score
- recommended_actions

### 数据流转例子

```text
用户最近 5 场面试都在“证据充分性”维度偏低
  -> Issue Aggregator Agent 合并同类问题
  -> Stability Analyzer Agent 判断为稳定弱项
  -> Impact Scorer Agent 判断其对目标岗位影响高
  -> Action Recommender Agent 推荐“项目举证专项训练 + 高分案例学习”
```

### 详细业务例子

用户最近参加了：

- 2 场阶段面试模拟
- 1 条全流程面试
- 3 次专项训练

系统发现不同场景里都反复出现同一种问题：用户说了很多项目动作，但很少能给出“为什么这样做、数据怎么证明、结果如何验证”。

复盘中心评审团的作用不是简单列出低分项，而是把多个来源的问题聚合成真正值得行动的“复盘问题单”。

### 输入样本

```json
{
  "historical_scores": [
    {"session_id": "s1", "dimension": "evidence", "score": 4.7},
    {"session_id": "s2", "dimension": "evidence", "score": 5.0},
    {"session_id": "s3", "dimension": "evidence", "score": 4.9}
  ],
  "historical_evidences": [
    "回答中只有动作，没有结果验证",
    "项目收益没有量化",
    "缺少方案选择依据"
  ],
  "historical_reports": [
    "一面模拟提示证据不足",
    "二面模拟提示真实性说服力不够",
    "全流程二面被标记为系统设计论证不充分"
  ],
  "user_goal": {
    "company": "阿里",
    "role": "前端工程师"
  }
}
```

### 结构化输出样本

```json
{
  "issue_list": [
    {
      "issue_id": "rev_201",
      "title": "证据充分性不足",
      "stability_type": "stable_weakness",
      "impact_score": 8.8,
      "supporting_signals": [
        "连续 5 次相关维度低于 5.5",
        "项目题和系统设计题都出现同类问题"
      ]
    }
  ],
  "recommended_actions": [
    "进入项目举证专项训练",
    "学习高分项目复盘案例 3 篇",
    "下一场面试强制使用‘动作-依据-结果’回答骨架"
  ]
}
```

### 详细流转拆解

- `Issue Aggregator Agent` 会把多个 session 中相似问题合并，避免报告里出现十几条重复建议。
- `Stability Analyzer Agent` 区分“稳定弱项”和“偶发波动”，因为两者对应的训练策略完全不同。
- `Impact Scorer Agent` 会参考目标岗位权重，例如面向高级岗时，“证据充分性不足”影响会更大。
- `Evidence Grouper Agent` 负责把问题背后的证据聚成可回放的证据包，方便用户看到系统为什么得出这个结论。
- `Action Recommender Agent` 产出的不是空话，而是可执行动作，会直接推送给专项训练与学习中心。

### 对应 service

- `review_center_service`

### 对应数据边界

- review_issues
- review_issue_evidences
- review_issue_actions
- review_issue_history

---

## 7.5 成长档案评审团

### 目标

持续构建用户成长轨迹，识别提升、波动、停滞和回退。

### 团队组成

- Growth Timeline Agent
- Dimension Trend Agent
- Improvement Verifier Agent
- Regression Detector Agent
- Narrative Generator Agent

### 输入

- historical_sessions
- dimension_scores
- review_issues
- practice_improvements

### 输出

- growth_snapshots
- trend_lines
- repaired_issues
- unstable_dimensions
- growth_summary

### 数据流转例子

```text
用户连续三次“结构化表达”提升，但“技术深度”波动
  -> Dimension Trend Agent 画出维度变化线
  -> Improvement Verifier Agent 确认结构化提升真实存在
  -> Regression Detector Agent 标记技术深度不稳定
  -> Narrative Generator Agent 写成长摘要
```

### 详细业务例子

成长档案评审团关心的不是“这一次表现怎么样”，而是“这个人是不是在持续变强，哪些能力真的修复了，哪些只是偶然答得好”。

例如某用户最近一个月：

- 结构化表达从 4.8 提升到 7.1
- 项目真实性从 5.2 提升到 6.4
- 技术深度在 5.0 到 7.0 之间来回波动

那么成长档案不应该只写“你在进步”，而应该明确区分：

- 已稳定提升的能力
- 正在修复但还不稳定的能力
- 曾经提高但最近回退的能力

### 输入样本

```json
{
  "historical_sessions": ["stage_01", "stage_02", "practice_01", "fullflow_01"],
  "dimension_scores": {
    "structured_expression": [4.8, 5.6, 6.7, 7.1],
    "technical_depth": [6.4, 5.1, 6.9, 5.3],
    "authenticity": [5.2, 5.9, 6.1, 6.4]
  },
  "review_issues": [
    "结构化表达曾是稳定弱项",
    "技术深度存在波动"
  ],
  "practice_improvements": [
    "STAR 重答训练提升明显",
    "系统设计训练尚未稳定"
  ]
}
```

### 结构化输出样本

```json
{
  "growth_snapshots": [
    {
      "snapshot_date": "2026-05-11",
      "confirmed_improvements": ["structured_expression"],
      "unstable_dimensions": ["technical_depth"],
      "repaired_issues": ["结构化表达混乱"]
    }
  ],
  "trend_lines": {
    "structured_expression": "upward_stable",
    "technical_depth": "volatile",
    "authenticity": "slow_upward"
  },
  "growth_summary": "你已经不再是‘回答没结构’的问题，而是进入‘内容深度不稳定’阶段。下一阶段重点不是继续练表达框架，而是把技术细节讲透。"
}
```

### 详细流转拆解

- `Growth Timeline Agent` 负责把不同来源的 session 拼成连续成长时间线。
- `Dimension Trend Agent` 不只算平均分，还会判断趋势是稳定上升、波动上升还是明显回退。
- `Improvement Verifier Agent` 的作用很关键，它要防止系统把“一次偶然高分”误认为“能力修复完成”。
- `Regression Detector Agent` 会优先标记那些曾经提升但最近回退的维度，因为这类问题最容易让用户误判自己已经准备好了。
- `Narrative Generator Agent` 最终生成用户看得懂的成长叙事，而不是只有图表没有解释。

### 对应 service

- `growth_archive_service`

### 对应数据边界

- growth_snapshots
- growth_dimension_trends
- growth_issue_status
- growth_narratives

---

## 7.6 知识中心建设评审团

### 目标

负责生产高质量知识卡、案例、反例、追问树和学习路径，不只是检索内容。

### 团队组成

- Topic Miner Agent
- Source Curator Agent
- Knowledge Writer Agent
- Counterexample Builder Agent
- Case Polisher Agent
- Quality Reviewer Agent
- Linkage Mapper Agent

### 输入

- 高频薄弱点
- 岗位能力图谱
- 面经素材
- 高分/低分样本

### 输出

- knowledge_cards
- high_score_cases
- counterexamples
- followup_trees
- learning_paths

### 数据流转例子

```text
系统发现大量前端用户在“缓存与请求去重”上表现差
  -> Topic Miner Agent 抽出高频知识缺口
  -> Source Curator Agent 聚合内部案例与外部资料
  -> Knowledge Writer Agent 生产知识卡
  -> Counterexample Builder Agent 写常见错误答法
  -> Linkage Mapper Agent 将该知识点绑定到相关问题和训练动作
```

### 详细业务例子

知识中心建设评审团的目标不是做一个“搜索资料库”，而是把系统里真实高频缺口，转成可以直接补能力的学习资产。

例如系统在过去 500 场前端相关面试里发现：

- 很多用户会说“做缓存”“做请求去重”
- 但答不清楚浏览器缓存、业务缓存、请求级去重、并发控制之间的区别
- 面试官一追问“哪些场景不能缓存”“如何避免脏数据”就容易崩

这时候知识中心建设评审团应该生产的不是一篇泛泛文章，而是一套可直接服务面试训练的知识资产。

### 输入样本

```json
{
  "weak_topic": "缓存与请求去重",
  "role_scope": "frontend",
  "evidence_sources": [
    "高频低分题：你如何设计前端请求缓存？",
    "高频追问：哪些接口不能缓存？",
    "用户常见错误答法样本 42 条"
  ],
  "capability_graph_nodes": ["performance", "network", "tradeoff", "engineering"]
}
```

### 结构化输出样本

```json
{
  "knowledge_cards": [
    {
      "card_id": "kc_301",
      "title": "前端缓存与请求去重的区别",
      "core_points": [
        "缓存解决重复获取与响应复用",
        "请求去重解决并发同请求重复发起",
        "两者在一致性与时效性上的权衡不同"
      ]
    }
  ],
  "high_score_cases": [
    "高分回答示例：如何为商品详情页设计缓存策略"
  ],
  "counterexamples": [
    "错误答法：所有 GET 请求都可以直接缓存"
  ],
  "followup_trees": [
    "如果接口数据实时性高怎么办",
    "多 Tab 下如何处理缓存一致性"
  ],
  "learning_paths": [
    "先看基础概念卡 -> 再看高分案例 -> 再做专项训练 -> 再回到同题重答"
  ]
}
```

### 详细流转拆解

- `Topic Miner Agent` 从真实低分记录里抽题，而不是拍脑袋定选题。
- `Source Curator Agent` 会综合内部高分样本、低分反例、外部可靠资料，保证内容不是空泛总结。
- `Knowledge Writer Agent` 负责把知识写成“面试可复用”的结构，而不是百科式长文。
- `Counterexample Builder Agent` 很关键，因为用户往往最需要知道自己错在哪里，而不仅是知道正确答案。
- `Case Polisher Agent` 会把高分案例修成可学习的表达范式，服务后续专项训练。
- `Linkage Mapper Agent` 把知识卡绑定到具体题目、弱项和训练动作，形成闭环。

### 对应 service

- `knowledge_construction_service`

### 对应数据边界

- knowledge_topics
- knowledge_cards
- knowledge_cases
- knowledge_counterexamples
- knowledge_linkages

---

## 7.7 面经采集处理审核评审团

### 目标

负责采集、清洗、去重、结构化、打标签、审核公开面经，形成高质量面经网络。

### 团队组成

- Source Collector Agent
- Dedup Agent
- PII Cleaner Agent
- Structure Parser Agent
- Tagging Agent
- Quality Audit Agent
- Company Pattern Builder Agent

### 输入

- external_experience_sources
- user_contributed_experiences
- company metadata

### 输出

- cleaned_experience_records
- experience_tags
- company_process_patterns
- confidence_scores

### 数据流转例子

```text
系统采集到 20 条“字节前端一面”面经
  -> Source Collector Agent 拉取原始文本
  -> Dedup Agent 去重
  -> PII Cleaner Agent 脱敏
  -> Structure Parser Agent 解析轮次、题型、关键词
  -> Tagging Agent 打上“性能 / 工程化 / 项目深挖”
  -> Company Pattern Builder Agent 形成字节前端一面模式
```

### 详细业务例子

面经采集处理审核评审团不是简单把外部帖子抓进数据库，而是要把“杂乱文本”变成可用于流程生成、题目策略、公司画像的结构化资产。

例如系统从公开渠道拿到 20 条“字节前端一面”文本，其中会混杂：

- 重复转载内容
- 个人情绪表达
- 不完整的问题描述
- 敏感信息
- 不同部门和不同年份的样本

这一团 Agent 的作用，就是把这些原始文本加工成高可信的“公司流程模式”和“题目分布模式”。

### 输入样本

```json
{
  "external_experience_sources": [
    {
      "source_id": "src_01",
      "raw_text": "字节电商前端一面，先问项目，然后问性能优化，最后问工程化和缓存..."
    },
    {
      "source_id": "src_02",
      "raw_text": "面试官让我设计活动页面架构，还问了跨团队协作..."
    }
  ],
  "user_contributed_experiences": [
    "今年 4 月一面主要在问项目和性能指标"
  ],
  "company_metadata": {
    "company": "字节跳动",
    "role": "前端开发工程师"
  }
}
```

### 结构化输出样本

```json
{
  "cleaned_experience_records": [
    {
      "record_id": "exp_clean_01",
      "stage": "一面",
      "department_hint": "电商",
      "question_topics": ["项目深挖", "性能优化", "工程化", "缓存策略"],
      "confidence": 0.86
    }
  ],
  "experience_tags": [
    "frontend",
    "performance",
    "engineering",
    "project_depth"
  ],
  "company_process_patterns": [
    {
      "company": "字节跳动",
      "role": "前端开发工程师",
      "predicted_stages": ["一面", "二面", "主管面", "HR面"],
      "first_round_focus": ["项目深挖", "性能优化", "工程化"]
    }
  ],
  "confidence_scores": {
    "dedup_quality": 0.93,
    "structure_parse_quality": 0.88,
    "overall_pattern_confidence": 0.84
  }
}
```

### 详细流转拆解

- `Source Collector Agent` 只负责采集，不做推断，避免原始数据层被污染。
- `Dedup Agent` 需要识别“表述不同但内容本质重复”的面经，减少模式误判。
- `PII Cleaner Agent` 必须在结构化前完成脱敏，否则后面所有使用链路都会带风险。
- `Structure Parser Agent` 把原始文本解析为轮次、题型、关键词、部门线索和时间线索。
- `Tagging Agent` 统一标签体系，保证后续检索和流程生成可以复用。
- `Quality Audit Agent` 对低置信数据打回，防止错误面经污染公司流程模板。
- `Company Pattern Builder Agent` 最终沉淀的是“模式资产”，它是全流程面试和知识中心的重要上游。

### 对应 service

- `experience_intelligence_service`

### 对应数据边界

- experience_raw_records
- experience_clean_records
- experience_tags
- experience_company_patterns
- experience_quality_reports

---

## 7.8 Offer Ready 评审团

### 目标

综合用户多场表现，判断当前 readiness、轮次风险、最短补强路径。

### 团队组成

- Readiness Estimator Agent
- Stage Risk Agent
- Gap Analyzer Agent
- Readiness Explainer Agent

### 输入

- role_profile
- company_profile
- growth_archive
- latest_reviews
- latest_practice_results

### 输出

- readiness_score
- stage_risks
- capability_gaps
- suggested_next_actions

### 数据流转例子

```text
用户目标是“腾讯后台开发工程师”
  -> Readiness Estimator Agent 估算总体 readiness
  -> Stage Risk Agent 计算一面/二面/终面风险
  -> Gap Analyzer Agent 找出最大能力差距
  -> Readiness Explainer Agent 输出“你最可能卡在系统设计与项目真实性”
```

### 详细业务例子

`Offer Ready` 不是一句“你准备好了没有”，而是一个最终决策层判断：如果用户明天真的去面目标公司，他最可能过哪几关、挂哪几关、最短补强路径是什么。

例如某用户目标是“腾讯后台开发工程师”，系统已经积累了：

- 近 10 场阶段面试
- 1 条完整全流程模拟
- 4 次专项训练
- 多条成长档案快照

这时 `Offer Ready` 评审团会综合判断：

- 总体 readiness 有多高
- 每个 stage 的挂点概率分别是多少
- 最大能力缺口来自哪里
- 如果只能再补 3 个动作，应该做什么最划算

### 输入样本

```json
{
  "role_profile": {
    "company": "腾讯",
    "role": "后台开发工程师",
    "core_dimensions": ["coding", "system_design", "project_depth", "communication"]
  },
  "company_profile": {
    "common_stages": ["一面", "二面", "主管面", "HR面"],
    "high_weight_dimensions_by_stage": {
      "一面": ["coding", "project_depth"],
      "二面": ["system_design", "tradeoff"],
      "主管面": ["ownership", "communication"]
    }
  },
  "growth_archive": {
    "stable_improvements": ["structured_expression"],
    "unstable_dimensions": ["system_design"]
  },
  "latest_reviews": [
    "项目真实性尚可，但系统设计细节不稳定",
    "编码题思路可以，但边界考虑一般"
  ],
  "latest_practice_results": [
    "系统设计专项训练提升有限",
    "项目举证训练已修复明显问题"
  ]
}
```

### 结构化输出样本

```json
{
  "readiness_score": 68,
  "stage_risks": [
    {
      "stage": "一面",
      "risk_level": "medium",
      "reason": "编码与项目题可过，但边界场景不够稳"
    },
    {
      "stage": "二面",
      "risk_level": "high",
      "reason": "系统设计波动大，权衡表达不稳定"
    },
    {
      "stage": "主管面",
      "risk_level": "medium",
      "reason": "owner 意识尚可，但复杂项目叙事偏弱"
    }
  ],
  "capability_gaps": [
    "系统设计方案拆解不稳定",
    "复杂技术决策的取舍说明不够完整"
  ],
  "suggested_next_actions": [
    "优先做系统设计专项训练 3 次",
    "针对二面高频题做一次同题重答",
    "补一轮复杂项目决策表达训练"
  ]
}
```

### 详细流转拆解

- `Readiness Estimator Agent` 负责给出总体 readiness，但这个分数只是入口，不是最终重点。
- `Stage Risk Agent` 会把 readiness 拆到每一面，帮助用户理解自己不是“整体不行”，而是“具体卡在第二面”。
- `Gap Analyzer Agent` 要把风险背后的核心能力差距说清楚，否则用户不知道该怎么补。
- `Readiness Explainer Agent` 最终把复杂判断翻译成用户能行动的结论，例如“不是继续广泛刷题，而是集中补系统设计取舍表达”。
- 这部分结果会反向驱动专项训练、全流程计划刷新和成长档案更新，因此它是一个决策中枢，而不只是展示页。

### 对应 service

- `offer_readiness_service`

### 对应数据边界

- readiness_snapshots
- readiness_stage_risks
- readiness_gap_reports
- readiness_action_recommendations

---

## 8. 为什么“全流程面试”是重要壁垒

从产品和技术双重视角，全流程模式是你最值得深挖的模块之一。

## 8.1 原因

- 它天然需要状态机，不是简单聊天。
- 它涉及计划、阶段、轮次、通过条件。
- 它能融合公开面经、岗位画像、公司风格。
- 它更接近真实招聘流程，用户感知价值更高。

## 8.2 未来演进方向

每个 Plan 应包含：

- 目标公司
- 目标岗位
- 流程模板
- 阶段集合
- 当前阶段
- 历史轮次
- 风险判断
- readiness 变化

每个 Stage 应包含：

- 阶段类型（HR / 一面 / 二面 / 终面）
- 重点维度
- 风格（压力 / 深挖 / 正常）
- 题型集合
- 通过阈值

---

## 9. 系统服务边界设计

## 9.1 用户与身份服务

- 用户账户
- 订阅状态
- 基础画像

## 9.2 会话与流程服务

- sessions
- interview_plans
- stages
- rounds
- message timelines
- inactivity detection
- answer drafting status

## 9.3 Agent 编排服务

- 调度各 Agent
- 控制串并行关系
- 记录执行链路
- 控制增量评审与增量报告

## 9.4 评估服务

- Evidence 抽取
- Judge 评分
- Calibration
- Trust 决策

## 9.5 检索服务

- 题库检索
- 案例检索
- 内容检索
- 相似样本检索

## 9.6 报告服务

- 报告聚合
- 报告渲染
- 报告版本化
- 报告中间态缓存
- 证据引用渲染

## 9.7 计划与行动服务

- action generation
- practice plans
- reminders
- progress tracking

## 9.8 埋点与分析服务

- 事件流
- 指标计算
- 训练效果分析
- Judge 漂移分析
- 等待体验分析
- 无回答超时分析
- 行动建议采纳分析

## 9.9 模块级 service 隔离原则

每个 Agent 团在后端都应有独立 service 边界，例如：

- `stage_interview_service`
- `full_flow_interview_service`
- `practice_training_service`
- `review_center_service`
- `growth_archive_service`
- `knowledge_construction_service`
- `experience_intelligence_service`
- `offer_readiness_service`

### 这些 service 之间如何通信

- 不直接共享内存状态
- 不直接读取对方内部中间推理结果
- 统一通过：
  - 结构化 API
  - 消息队列
  - 事件总线
  - 只读分析表

### 例子

- 面经采集处理审核评审团不会直接改写全流程面试计划表
- 它只输出：
  - company_process_patterns
  - tagged_experience_records
  - quality_confidence

然后由 `full_flow_interview_service` 决定是否采用

## 9.10 模块级库表隔离原则

建议使用逻辑隔离，而不是把所有表堆在一个 schema 下。

### 推荐方式

- `interview_core.*`
- `practice_core.*`
- `review_core.*`
- `growth_core.*`
- `knowledge_core.*`
- `experience_core.*`
- `readiness_core.*`
- `analytics_core.*`

### 为什么要隔离

- 降低模块耦合
- 降低错误扩散
- 便于权限控制
- 便于单模块迁移和扩容
- 便于后续服务拆分

### 例子

如果“知识中心建设评审团”需要调整内容生产流程，不应该影响：

- interview_core 的问答链路
- review_core 的问题聚合
- readiness_core 的风险评分

因此它应该主要落在自己的 `knowledge_core` 里。

---

## 10. 数据模型设计

## 10.1 核心实体

### UserProfile

- user_id
- target_roles
- target_companies
- experience_level
- resume_versions
- readiness_score

### RoleProfile

- role_id
- role_name
- level
- capability_weights
- expected_question_types

### InterviewPlan

- plan_id
- user_id
- company
- role
- level
- mode
- plan_status
- current_stage_id

### InterviewStage

- stage_id
- plan_id
- stage_type
- stage_goal
- stage_status

### InterviewRound

- round_id
- stage_id
- round_index
- round_goal
- result

### StageInterviewerProfile

- stage_interviewer_id
- stage_id
- interviewer_role
- interviewer_style
- focus_dimensions
- veto_risks

### PanelVote

- vote_id
- stage_id
- reviewer_role
- vote_result
- vote_reason
- confidence

### StageDecision

- decision_id
- stage_id
- pass_votes
- fail_votes
- passed
- status
- plus_points
- improvement_points
- next_stage_id

### Question

- question_id
- round_id
- question_type
- target_dimensions
- prompt_version

### Answer

- answer_id
- question_id
- raw_text
- processed_text

### EvidenceSpan

- evidence_id
- answer_id
- start_offset
- end_offset
- linked_dimensions
- confidence

### DimensionScore

- score_id
- answer_id
- dimension
- raw_score
- calibrated_score
- confidence
- reasoning

### ReviewIssue

- issue_id
- user_id
- dimension
- severity
- stability
- impact_score

### PracticeAction

- action_id
- issue_id
- action_type
- title
- success_criteria
- progress

### LearningRecommendation

- recommendation_id
- issue_id
- content_id
- reason

### ReadinessSnapshot

- snapshot_id
- user_id
- role
- company
- readiness_score
- risk_by_stage

---

## 10.2 模块级实体建议

### interview_core

- interview_plans
- interview_plan_stages
- interview_plan_rounds
- interview_stage_interviewers
- interview_panel_votes
- interview_stage_decisions
- interview_questions
- interview_answers
- interview_evidences
- interview_scores

### practice_core

- practice_sessions
- practice_drills
- practice_rewrites
- practice_comparisons
- practice_improvements

### review_core

- review_issues
- review_issue_evidences
- review_issue_actions
- review_issue_histories

### growth_core

- growth_snapshots
- growth_dimension_trends
- growth_issue_status
- growth_narratives

### knowledge_core

- knowledge_topics
- knowledge_cards
- knowledge_cases
- knowledge_counterexamples
- knowledge_paths

### experience_core

- experience_raw_records
- experience_clean_records
- experience_tags
- experience_company_patterns
- experience_quality_audits

### readiness_core

- readiness_snapshots
- readiness_stage_risks
- readiness_gap_reports
- readiness_actions

## 10.3 必须落结构化而不是自然语言的字段

- 问题类型
- 目标维度
- 证据片段
- Judge 分数
- Judge 置信度
- 分歧结果
- 追问原因
- 问题稳定性
- 修复动作
- 同题重答提升量
- 首次输入延迟
- 每轮等待时长
- 增量报告状态
- 用户是否在提示后继续回答

如果这些只保留在自然语言报告里，系统就无法持续优化。

---

## 11. 检索层设计

## 11.1 知识库组成

- 岗位题目图谱
- 维度标准库
- 高分样本库
- 低分样本库
- 公开面经库
- 学习内容库

## 11.2 检索方法

- keyword 检索
- embedding 检索
- metadata filter
- rerank

## 11.3 检索原则

- 先限制岗位/级别/公司
- 再做语义召回
- 最后 rerank

---

## 12. 评估与校准体系

## 12.1 为什么必须有评估体系

没有评估体系，产品更新只是在“改 Prompt 碰运气”。

## 12.2 评测集组成

- 校招后端题
- 校招前端题
- 社招前端题
- 社招后端题
- 项目深挖题
- 行为面题
- 压力面题

每个题目应包含：

- 金标准高分答案
- 金标准低分答案
- 常见伪高分答案
- 应有维度分布

## 12.3 Judge 校准机制

- 离线跑固定样本集
- 计算各维度一致率
- 监控日常漂移
- 对高分歧样本做人审

## 12.4 Trust 机制

当出现以下情况时必须降置信：

- 证据片段过少
- Judge 分歧过大
- 历史样本不足
- 答案有效信息密度过低

---

## 13. 成本控制设计

## 13.1 大模型只用在高价值环节

应该让大模型主要负责：

- 追问策略
- 证据抽取
- Judge 推理
- 高质量教练建议

## 13.2 规则化替代

低价值环节尽量规则化：

- 会话状态推进
- plan/stage/round 状态机
- 一些阈值判断
- 常规模板渲染

## 13.3 缓存策略

- Role/JD parse 缓存
- 检索结果缓存
- 高相似 prompt 输出缓存
- 内容推荐缓存

---

## 14. 可观测性设计

## 14.1 每次 Agent 调用必须记录

- request_id
- agent_name
- model_name
- prompt_version
- input_hash
- output_hash
- latency
- token_cost
- confidence

## 14.1.1 每轮会话反馈必须记录

- answer_submitted_at
- first_feedback_at
- next_question_ready_at
- report_skeleton_ready_at
- report_final_ready_at
- user_first_input_at
- user_idle_prompt_count

这些字段用于衡量：

- 首反馈时间
- 追问生成耗时
- 用户长时间无回答行为
- 报告骨架和最终报告耗时

## 14.2 每次面试会话必须可回放

能看到：

- 哪个 Agent 给了什么结论
- 哪些 evidence 支撑了这个结论
- 为什么进入下一轮追问
- 为什么生成这个计划

---

## 15. 部署与演进形态

## 15.1 基础形态

- 会话逻辑与 Agent 编排可在同一应用内先拆层实现
- 耗时评估任务通过 queue / job 托管
- 所有结构化结果优先入库，不等待最终文案生成

## 15.2 服务化形态

- Agent 编排服务独立
- 检索服务独立
- 评估服务独立
- 报告服务独立
- 埋点与分析服务独立

## 15.3 平台化形态

- online inference 与 offline evaluation 双系统
- 支持多模型路由
- 支持策略实验平台
- 支持 judge 校准后台

---

## 16. 核心护城河如何落到技术里

## 16.1 不是 Prompt 护城河

Prompt 可以抄，甚至几天内就能抄出很像的产品体验。

## 16.2 真正护城河

- 结构化评估标准库
- 多 Agent 协同与校准体系
- 证据化数据资产
- 全流程 plan/stage/round 状态机
- 用户成长记忆与 readiness 引擎

## 16.3 技术上的最终壁垒

当系统做到以下状态时，竞争对手最难追：

- 问题不是现编，而是基于岗位图谱和历史数据编排
- 评分不是一句总结，而是多个 Judge 独立评审后校准
- 报告不是自然语言包装，而是结构化证据渲染
- 行动不是人工整理，而是从问题自动映射到训练处方
- 成长不是表面分数，而是持续更新的 readiness 曲线

---

## 17. 关键落地组件

- 证据抽取 Agent
- 结构化 Dimension Judge
- 增量报告层
- 流式反馈层
- round 级结构化存储
- 复盘问题与训练动作映射
- Calibration Agent
- 全流程 Stage / Round 看板
- 高分 / 低分案例检索
- 同题重答对比
- Readiness 引擎
- 项目真实性识别
- 公司流程模板系统
- 多模型路由优化

---

## 18. 总结

面面吧如果继续沿着“一个会聊天的大模型 + 更好看的页面 + 更完整的功能”走，迟早会进入激烈同质化竞争。

但如果沿着以下路线走：

- 多 Agent 评估
- 证据化报告
- 计划化训练
- 全流程状态机
- 成长与 readiness 系统

它就会从“AI 工具”升级成“面试能力基础设施”。

这不是一个小功能优化，而是产品形态升级。
