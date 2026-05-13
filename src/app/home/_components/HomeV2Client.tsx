"use client";

import Link from "next/link";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type {
  V2HomeDashboardSnapshot,
} from "@/lib/interview-v2/domain";

type HomeModuleCard = {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  tone: "orange" | "blue" | "green" | "purple";
  icon: "interview" | "practice" | "learning" | "review";
};

type DashboardResponse = {
  data?: V2HomeDashboardSnapshot;
  error?: string;
};

type ShowcaseSlide = {
  key: string;
  ribbon: string;
  title: string;
  description: string;
  mediaSrc: string;
};

const moduleCards: HomeModuleCard[] = [
  {
    title: "模拟面试",
    description: "真实面试环境，AI 面试官全流程模拟，精准评估。",
    href: "/setup",
    actionLabel: "立即开始",
    tone: "orange",
    icon: "interview",
  },
  {
    title: "专项训练",
    description: "针对薄弱点专项突破，快速提升技术与表达能力。",
    href: "/practice",
    actionLabel: "去训练",
    tone: "blue",
    icon: "practice",
  },
  {
    title: "学习中心",
    description: "系统化学习知识点与面试方法，从基础到进阶。",
    href: "/learning",
    actionLabel: "去学习",
    tone: "green",
    icon: "learning",
  },
  {
    title: "复盘中心",
    description: "查看训练结果与复盘分析，持续迭代提升。",
    href: "/review",
    actionLabel: "去复盘",
    tone: "purple",
    icon: "review",
  },
];

/**
 * 构建首页轮播导览数据，仅保留真实业务流程页，不再放首页截图。
 * @returns {ShowcaseSlide[]} 轮播配置列表。
 */
function buildShowcaseSlides(): ShowcaseSlide[] {
  return [
    {
      key: "interview",
      ribbon: "阶段面试 / 全流程面试",
      title: "从发起面试进入真实模拟",
      description: "展示阶段面试与全流程面试配置、确认和进入面试间的真实操作路径。",
      mediaSrc: "/showcase/interview-flow.gif",
    },
    {
      key: "practice",
      ribbon: "专项训练",
      title: "围绕薄弱点做专项突破",
      description: "把复盘结论回流到专项训练，用更聚焦的方式快速补齐短板。",
      mediaSrc: "/showcase/practice-flow.gif",
    },
    {
      key: "learning",
      ribbon: "学习中心",
      title: "先补基础，再回到训练验证",
      description: "通过学习中心补基础知识，再回到专项训练或模拟面试验证掌握情况。",
      mediaSrc: "/showcase/learning-flow.gif",
    },
    {
      key: "review",
      ribbon: "复盘中心",
      title: "让复盘结论直接变成下一步动作",
      description: "复盘中心统一汇总样本、诊断问题，并把建议直接回流到后续训练。",
      mediaSrc: "/showcase/review-flow.gif",
    },
  ];
}

/**
 * 为未登录用户构造首页空态快照，保证首页结构完整但不伪造真实进度。
 * @returns {V2HomeDashboardSnapshot} 匿名用户首页展示数据。
 */
function buildAnonymousSnapshot(): V2HomeDashboardSnapshot {
  return {
    metrics: [
      {
        key: "learningProgress",
        label: "学习推进",
        value: "--",
        helper: "登录后统计学习中心已推进的真实主题数",
        trend: "neutral",
      },
      {
        key: "practiceActions",
        label: "专项训练",
        value: "--",
        helper: "登录后统计近7天专项训练真实动作",
        trend: "neutral",
      },
      {
        key: "interviewActions",
        label: "模拟面试",
        value: "--",
        helper: "登录后统计近7天模拟面试真实记录",
        trend: "neutral",
      },
      {
        key: "reviewClosure",
        label: "复盘闭环",
        value: "--",
        helper: "登录后统计复盘后回到学习或训练的补强动作",
        trend: "neutral",
      },
    ],
    continueTraining: {
      title: "登录后继续训练",
      subtitle: "登录后会直接告诉你当前最适合继续推进的训练动作。",
      progressPercent: null,
      progressLabel: "登录后显示真实训练进度",
      nextStepLabel: "下一步：先完成一条真实学习或训练动作",
      actionLabel: "登录后继续",
      actionPath: "/login",
    },
    weaknesses: [
      {
        name: "登录后生成薄弱点画像",
        hint: "登录后会根据你的真实学习、训练和模拟表现，生成当前最值得优先补强的问题。",
        progressPercent: null,
        progressLabel: "登录后显示真实修复进度",
        impactLabel: "当前缺少真实样本",
        severity: "low",
        actionLabel: "登录后开始",
        actionPath: "/login",
      },
    ],
    progressSummary:
      "登录后会展示你的真实学习、训练和模拟进展。",
    weaknessSummary:
      "登录后会展示当前最需要优先补强的问题。",
  };
}

/**
 * 根据当前时间返回更有温度的首页问候语和陪伴提示。
 * @param {Date} now 当前时间。
 * @returns {{ greeting: string; icon: string; note: string; bubble: string }} 问候语配置。
 */
function buildGreetingByHour(now: Date): {
  greeting: string;
  icon: string;
  note: string;
  bubble: string;
} {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) {
    return {
      greeting: "早上好",
      icon: "☀️",
      note: "新的一天开始了，先把最重要的一轮训练拿下。",
      bubble: "晨间开练",
    };
  }
  if (hour >= 11 && hour < 14) {
    return {
      greeting: "中午好",
      icon: "☀️",
      note: "",
      bubble: "午间阳光",
    };
  }
  if (hour >= 14 && hour < 19) {
    return {
      greeting: "下午好",
      icon: "☀️",
      note: "下午适合推进一轮高质量训练，容易把弱项压实。",
      bubble: "进度在线",
    };
  }
  if (hour >= 19 && hour < 24) {
    return {
      greeting: "晚上好",
      icon: "🌛",
      note: "适合做一轮完整模拟，再把复盘和薄弱点补起来。",
      bubble: "今晚也稳住",
    };
  }

  return {
    greeting: "深夜好",
    icon: "🌙",
    note: "在忙也要记得休息，晚安前把最关键的一个问题想清楚就够了。",
    bubble: "夜深了先照顾自己",
  };
}

/**
 * 渲染首页模块卡片图标，避免出现没有语义的空白装饰圈。
 * @param {"interview" | "practice" | "learning" | "review"} icon 图标类型。
 * @returns {JSX.Element} 模块图标。
 */
function renderModuleIcon(
  icon: "interview" | "practice" | "learning" | "review"
): JSX.Element {
  switch (icon) {
    case "interview":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6.5h16v8H8l-4 4z" />
          <path d="M8 10h8" />
          <path d="M8 7.5h5" />
        </svg>
      );
    case "practice":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4h10" />
          <path d="M6 8h12" />
          <path d="M8 12h8" />
          <path d="M10 16h4" />
          <path d="M5 20h14" />
        </svg>
      );
    case "learning":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2z" />
          <path d="M6 8h8" />
          <path d="M6 11h10" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18V6" />
          <path d="M4 18h16" />
          <path d="m8 14 3-4 3 2 4-6" />
        </svg>
      );
  }
}

/**
 * 根据趋势类型输出适合首页标签的样式类名。
 * @param {"positive" | "neutral" | "negative"} trend 指标趋势。
 * @returns {string} 对应的样式类名。
 */
function getMetricBadgeClassName(trend: "positive" | "neutral" | "negative"): string {
  if (trend === "positive") {
    return "positive";
  }
  if (trend === "negative") {
    return "negative";
  }
  return "neutral";
}

/**
 * 将薄弱点严重程度转换为首页展示语义。
 * @param {"high" | "medium" | "low"} severity 薄弱点严重程度。
 * @returns {string} 页面展示文案。
 */
function formatSeverityLabel(severity: "high" | "medium" | "low"): string {
  if (severity === "high") {
    return "高优先级";
  }
  if (severity === "medium") {
    return "优先处理";
  }
  return "建议关注";
}

/**
 * 渲染 v2.0 首页客户端视图，并在登录状态下拉取真实操作台数据。
 * @returns {JSX.Element} v2.0 首页页面。
 */
export default function HomeV2Client(): JSX.Element {
  const { data: session, status } = useSession();
  const [dashboard, setDashboard] = useState<V2HomeDashboardSnapshot>(() =>
    buildAnonymousSnapshot()
  );
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const showcaseSlides = useMemo(() => buildShowcaseSlides(), []);
  const [activeShowcaseIndex, setActiveShowcaseIndex] = useState(0);

  /**
   * 拉取首页真实操作台数据，仅在已登录状态下触发。
   * @returns {Promise<void>} 加载完成后更新本地状态。
   */
  async function loadDashboard(): Promise<void> {
    setLoadingDashboard(true);
    try {
      const response = await fetch("/api/v2/home/dashboard", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`dashboard request failed: ${response.status}`);
      }

      const payload = (await response.json()) as DashboardResponse;
      if (payload.data) {
        setDashboard(payload.data);
      }
    } catch (error) {
      console.error("Failed to load v2 home dashboard", error);
      setDashboard(buildAnonymousSnapshot());
    } finally {
      setLoadingDashboard(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      void loadDashboard();
      return;
    }

    setDashboard(buildAnonymousSnapshot());
  }, [session?.user?.id, status]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveShowcaseIndex((current) => (current + 1) % showcaseSlides.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, [showcaseSlides.length]);

  const greetingName =
    session?.user?.nickname?.trim() ||
    session?.user?.name?.trim() ||
    session?.user?.email?.split("@")[0] ||
    "同学";
  const greetingMeta = buildGreetingByHour(new Date());
  const isAuthenticated = status === "authenticated" && Boolean(session?.user?.id);

  return (
    <section className="v2-home-shell">
      <div className="v2-home-hero card">
        <div className="v2-home-hero__copy">
          <div className="v2-home-hero__warmline">
            <span className="v2-home-hero__warmtag">
              {greetingMeta.icon} {greetingMeta.bubble}
            </span>
            {greetingMeta.note ? (
              <span className="v2-home-hero__warmnote">{greetingMeta.note}</span>
            ) : null}
          </div>
          <h1>
            {greetingMeta.greeting}，{greetingName} <span aria-hidden="true">👋🏻</span>
          </h1>
          <p className="v2-home-hero__sub">
            把学习、训练和模拟面试放在一起，科学成长，高效拿到心仪 Offer。
          </p>
          <div className="v2-home-hero__pills" aria-label="首页核心能力">
            <span className="v2-home-hero__bubble v2-home-hero__bubble--orange">
              真实面试场景
            </span>
            <span className="v2-home-hero__bubble v2-home-hero__bubble--blue">
              AI 智能陪练
            </span>
            <span className="v2-home-hero__bubble v2-home-hero__bubble--green">
              个性化提升方案
            </span>
          </div>
        </div>

        <div className="v2-home-showcase" aria-label="系统流程导览轮播">
          {showcaseSlides.map((slide, index) => {
            const previousIndex =
              (activeShowcaseIndex - 1 + showcaseSlides.length) % showcaseSlides.length;
            const nextIndex = (activeShowcaseIndex + 1) % showcaseSlides.length;

            let stateClassName = "is-hidden";
            if (index === activeShowcaseIndex) {
              stateClassName = "is-active";
            } else if (index === previousIndex) {
              stateClassName = "is-prev";
            } else if (index === nextIndex) {
              stateClassName = "is-next";
            }

            return (
              <article
                key={slide.key}
                className={`v2-home-showcase__slide ${stateClassName}`}
                aria-hidden={index !== activeShowcaseIndex}
              >
                <div className="v2-home-showcase__ribbon">{slide.ribbon}</div>
                <div className="v2-home-showcase__screen v2-home-showcase__screen--media">
                  <img
                    className="v2-home-showcase__image"
                    src={slide.mediaSrc}
                    alt={slide.title}
                  />
                </div>
                <div className="v2-home-showcase__caption">
                  <h3 className="v2-home-showcase__caption-title">{slide.title}</h3>
                  <p>{slide.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="v2-home-module-grid">
        {moduleCards.map((item) => (
          <article
            key={item.title}
            className={`v2-home-module-card v2-home-module-card--${item.tone} card`}
          >
            <div className="v2-home-module-card__icon" aria-hidden="true">
              {renderModuleIcon(item.icon)}
            </div>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <Link className="btn btn-outline" href={item.href}>
              {item.actionLabel}
            </Link>
          </article>
        ))}
      </div>

      <div className="v2-home-dashboard-grid">
        <article className="v2-home-dashboard-card card">
          <div className="v2-home-dashboard-card__header">
            <div>
              <h2>我的进度</h2>
              <p>{dashboard.progressSummary}</p>
            </div>
            {loadingDashboard ? <span className="v2-home-status-tag">同步中</span> : null}
          </div>

          <div className="v2-home-metric-grid">
            {dashboard.metrics.map((metric) => (
              <div key={metric.key} className="v2-home-metric-card">
                <div className="v2-home-metric-card__label">{metric.label}</div>
                <div className="v2-home-metric-card__value">{metric.value}</div>
                <div
                  className={`v2-home-metric-card__helper ${getMetricBadgeClassName(
                    metric.trend
                  )}`}
                >
                  {metric.helper}
                </div>
              </div>
            ))}
          </div>

          {dashboard.continueTraining ? (
            <div className="v2-home-continue-card">
              <div className="v2-home-continue-card__content">
                <h3>继续上次训练</h3>
                <strong>{dashboard.continueTraining.title}</strong>
                <p>{dashboard.continueTraining.subtitle}</p>
                {dashboard.continueTraining.progressPercent !== null ? (
                  <div className="v2-home-progress-block">
                    <div className="v2-home-progress-block__header">
                      <span>{dashboard.continueTraining.progressLabel}</span>
                      <b>{dashboard.continueTraining.progressPercent}%</b>
                    </div>
                    <div className="v2-home-progress-bar" aria-hidden="true">
                      <i style={{ width: `${dashboard.continueTraining.progressPercent}%` }} />
                    </div>
                  </div>
                ) : null}
                <div className="v2-home-continue-card__nextstep">
                  {dashboard.continueTraining.nextStepLabel}
                </div>
              </div>
              {isAuthenticated ? (
                <Link
                  className="btn btn-primary"
                  href={dashboard.continueTraining.actionPath ?? "/setup"}
                >
                  {dashboard.continueTraining.actionLabel}
                </Link>
              ) : (
                <button className="btn btn-primary" type="button" disabled>
                  {dashboard.continueTraining.actionLabel}
                </button>
              )}
            </div>
          ) : null}
        </article>

        <article className="v2-home-dashboard-card card">
          <div className="v2-home-dashboard-card__header">
            <div>
              <h2>当前薄弱点 Top 3</h2>
              <p>{dashboard.weaknessSummary}</p>
            </div>
          </div>

          <div className="v2-home-weakness-list">
            {dashboard.weaknesses.map((weakness) => {
              const content = (
                <>
                  <div className="v2-home-weakness-card__main">
                    <div className="v2-home-weakness-card__topline">
                      <strong>{weakness.name}</strong>
                      <span className={`pill ${weakness.severity === "high" ? "orange" : weakness.severity === "medium" ? "blue" : "green"}`}>
                        {formatSeverityLabel(weakness.severity)}
                      </span>
                    </div>
                    <p>{weakness.hint}</p>
                    {weakness.progressPercent !== null ? (
                      <div className="v2-home-progress-block">
                        <div className="v2-home-progress-block__header">
                          <span>{weakness.progressLabel}</span>
                          <b>{weakness.progressPercent}%</b>
                        </div>
                        <div className="v2-home-progress-bar" aria-hidden="true">
                          <i style={{ width: `${weakness.progressPercent}%` }} />
                        </div>
                      </div>
                    ) : null}
                    <div className="v2-home-weakness-card__meta">
                      <span>{weakness.impactLabel}</span>
                    </div>
                  </div>
                  <span className="v2-home-weakness-card__score">{weakness.actionLabel}</span>
                </>
              );

              return weakness.actionPath ? (
                <Link
                  key={weakness.name}
                  href={weakness.actionPath}
                  className="v2-home-weakness-card"
                >
                  {content}
                </Link>
              ) : (
                <div key={weakness.name} className="v2-home-weakness-card">
                  {content}
                </div>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
