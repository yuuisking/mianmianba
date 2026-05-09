import Link from "next/link";

const featureCards = [
  {
    title: "模拟面试",
    description: "围绕目标岗位完成从画像到问答的完整模拟，帮助你快速进入真实面试状态。",
    href: "/setup",
    eyebrow: "真实场景",
    tone: "orange"
  },
  {
    title: "专项训练",
    description: "针对知识点、项目表达和高频问法做定向强化，把弱项拆开练透。",
    href: "/practice",
    eyebrow: "定向强化",
    tone: "blue"
  },
  {
    title: "学习中心",
    description: "把知识点、题型和材料沉淀到同一处，方便持续学习和查漏补缺。",
    href: "/learning",
    eyebrow: "长期沉淀",
    tone: "green"
  },
  {
    title: "复盘中心",
    description: "查看面试结果、示例复盘和薄弱项趋势，形成持续迭代的学习闭环。",
    href: "/review",
    eyebrow: "持续迭代",
    tone: "orange"
  }
] as const;

/**
 * 渲染新的公开首页，承接品牌化前台导航与核心功能入口。
 * @returns 公开首页页面。
 */
export default function PublicHomePage() {
  return (
    <section className="home-shell">
      <div className="home-hero">
        <div className="home-hero__copy">
          <div className="home-hero__content">
            <div className="home-hero__headline">
              <span className="home-hero__intro">你好，追梦人</span>
              <h1>
                <span>这是把学习、训练和模拟面试放在一起的</span>
                <span>准备平台</span>
              </h1>
            </div>
            <div className="home-hero__aside">
              <p>
                从岗位画像、专项训练到知识沉淀和复盘查看，把准备面试最常用的几件事收在同一个地方，方便连续推进，不用来回切换
              </p>
              <div className="home-hero__meta" aria-label="首页能力概览">
                <span>岗位画像与模拟</span>
                <span>弱项拆解训练</span>
                <span>知识沉淀整理</span>
                <span>复盘闭环迭代</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="home-grid">
        {featureCards.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className={`home-feature home-feature--${item.tone}`}
            aria-label={`进入${item.title}`}
          >
            <span className="home-feature__eyebrow">{item.eyebrow}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <span className="home-feature__link">进入模块</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
