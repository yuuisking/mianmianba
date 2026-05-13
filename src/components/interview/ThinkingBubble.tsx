type ThinkingBubbleProps = {
  status: string;
  hint: string;
};

/**
 * 在消息流中渲染“面试官思考中”气泡，用轻量呼吸动画提升实时感。
 * @param props 当前状态文案与辅助提示。
 * @returns 思考气泡组件。
 */
export function ThinkingBubble(props: ThinkingBubbleProps) {
  return (
    <div className="thinking-bubble">
      <div className="thinking-bubble__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="thinking-bubble__content">
        <strong>{props.status}</strong>
        <span>{props.hint}</span>
      </div>
    </div>
  );
}
