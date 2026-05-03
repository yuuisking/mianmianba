# Video Interview Mode Spec

## Why
用户希望在平台上体验更真实的视频面试场景。正如用户所说，视频面试的核心逻辑（语音识别、大模型对话、语音合成）与语音面试完全相同，唯一的区别是在界面上多出一个用户的摄像头画面，以增加面试的临场感和压力感。

## What Changes
- 修改 `/interview` 页面中的媒体流请求（`getUserMedia`），当 `mode === "video"` 时，同时请求 `video: true` 和 `audio`。
- 在面试界面的 UI 中增加一个 `<video>` 元素，用于实时预览用户的本地摄像头画面（需设置 `muted` 防止回音）。
- 更新断开连接的逻辑，确保挂断电话或离开页面时，视频轨道（Video Track）能够被正确停止，释放摄像头权限（关闭摄像头指示灯）。
- 优化权限错误提示，区分“未授权麦克风”与“未授权摄像头”的情况。

## Impact
- Affected specs: 现有的语音面试核心逻辑不变，扩展了媒体采集的范围。
- Affected code: `src/app/interview/page.tsx`。

## ADDED Requirements
### Requirement: 视频画面预览
The system SHALL provide a local video preview when the interview mode is set to "video".

#### Scenario: 成功开启视频面试
- **WHEN** 用户进入 `mode=video` 的面试页面并点击连接
- **THEN** 浏览器请求摄像头和麦克风权限，授权后界面出现用户的实时画面，同时保持 AI 语音对话功能正常运行。

#### Scenario: 挂断或离开
- **WHEN** 用户点击挂断按钮或关闭/离开页面
- **THEN** 摄像头指示灯熄灭，本地视频流被释放。
