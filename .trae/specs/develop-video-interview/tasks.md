# Tasks

- [x] Task 1: 扩展媒体请求以支持视频（`src/app/interview/page.tsx`）
  - 修改 `startCall` 函数：判断如果 `mode === "video"`，在 `getUserMedia` 的选项中添加 `{ video: true }`，同时保留原有的高级音频配置（降噪、回声消除等）。
- [x] Task 2: 更新 UI 以显示本地视频流
  - 添加一个新的 `useRef<HTMLVideoElement>(null)` 用于绑定本地视频流。
  - 在 `streamRef.current = stream` 之后，将 `stream` 赋值给 `<video>` 的 `srcObject`。
  - 在现有 UI 布局中加入一个 `<video>` 元素（设置为 `muted` 防止啸叫、`autoPlay` 和 `playsInline`），建议将其放置在界面的右下角或与 AI 头像形成左右结构，以保留现有的呼吸动画和字幕。
- [x] Task 3: 处理权限请求错误
  - 如果 `mode === "video"` 且 `getUserMedia` 失败，在控制台和页面上给出提示（如“未授权摄像头或麦克风”），而非原本的纯麦克风提示。
- [x] Task 4: 确保断开连接时正确清理视频轨道
  - 在 `stopCall` / `handleEnd` 函数中遍历并停止 (`track.stop()`) 所有视频轨道（`stream.getVideoTracks()`），确保关闭摄像头指示灯。
