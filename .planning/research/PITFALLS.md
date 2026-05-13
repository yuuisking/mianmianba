# V2 Pitfalls Research

**Date:** 2026-05-13
**Scope:** 面面吧 V2 重设计常见失败路径

## Pitfall 1: 继续用页面驱动业务边界

- **Warning signs**: 问题先表现为按钮、路由、文案异常，但根因其实是状态和实体定义混乱。
- **Prevention**: Phase 1 必须先把统一实体、状态、事件和模块边界定下来。
- **Phase**: Phase 1

## Pitfall 2: 让一个模型同时负责追问、评分、总结和计划

- **Warning signs**: 问题风格漂移、评分前后不一致、报告无法解释、不同模块结论串味。
- **Prevention**: Phase 2 建立 Evidence -> Judge -> Calibration -> Trust 链路。
- **Phase**: Phase 2

## Pitfall 3: 全流程只是“多轮聊天”而不是真实流程

- **Warning signs**: 每轮都是同一个面试官口吻；用户只感觉题目变了，没有阶段推进感。
- **Prevention**: Phase 4 必须引入独立面试官角色、过轮规则、阶段目标和投票机制。
- **Phase**: Phase 4

## Pitfall 4: 算法题链路脱离主流程

- **Warning signs**: coding 页和 interview 页状态不一致；报告缺少算法题证据；题面引用脏上下文。
- **Prevention**: Phase 5 把算法题建成受状态机控制的独立阶段，并强制引用证据校验后的上下文。
- **Phase**: Phase 5

## Pitfall 5: 复盘中心只做展示，不做行动闭环

- **Warning signs**: 复盘有很多结论，但无法直接进入训练、学习或下一轮准备。
- **Prevention**: Phase 6 要让 issue、action、knowledge linkage 成为可执行对象。
- **Phase**: Phase 6

## Pitfall 6: 过早包装 readiness

- **Warning signs**: readiness 看起来很强，但没有足够历史样本、证据和阶段风险支撑。
- **Prevention**: Phase 7 才允许输出 readiness，并要求引用成长轨迹与阶段风险依据。
- **Phase**: Phase 7

## Pitfall 7: brownfield 迁移没有护栏

- **Warning signs**: 新链路上线后旧数据口径失真；线上恢复链、报告链、列表链互相打架。
- **Prevention**: 每个阶段都明确迁移对象、双写/兼容策略、切换条件和回滚条件。
- **Phase**: Phase 1-7
