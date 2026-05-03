"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "ai" | "user";
  content: string[];
  time: string;
  tag: string;
};

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "text";
  const topic = searchParams.get("topic") || "";
  const desc = searchParams.get("desc") || "";

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<"面试官思考中" | "进一步检索资料中">("面试官思考中");
  const [questionCount, setQuestionCount] = useState(1);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [showLimitAlert, setShowLimitAlert] = useState(false);
  const [limitAlertMessage, setLimitAlertMessage] = useState("");

  // Refs for TTS & Abort (Barge-in)
  const abortControllerRef = useRef<AbortController | null>(null);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const isInterruptedRef = useRef<boolean>(false);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Voice Mode States
  const [micStatus, setMicStatus] = useState<"idle" | "requesting" | "recording" | "processing" | "denied" | "error">("idle");
  const [micErrorMsg, setMicErrorMsg] = useState("");
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const isTypingRef = useRef(isTyping);
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Initialize profile and first message
  useEffect(() => {
    const storedProfile = sessionStorage.getItem("parsedProfileData");
    if (storedProfile) {
      const parsed = JSON.parse(storedProfile);
      setProfile(parsed);
      
      const targetRole = parsed.targetLevel || "前端开发工程师";
      const focus = parsed.focus || "综合面试";
      
      let initialMsg: Message;
      if (mode === "targeted") {
        initialMsg = {
          role: "ai",
          content: [
            `你好！我是你的专项训练辅导官。本次我们针对【${topic}】进行定点突破。`,
            `目前的训练目标是：${desc}`,
            "准备好开始了吗？我们直接进入正题吧。"
          ],
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          tag: ""
        };
      } else {
        initialMsg = {
          role: "ai",
          content: [
            `你好！欢迎参加今天的面试，我是你的 AI 面试官。本次面试的重点是【${focus}】。我看到你设定的目标是【${targetRole}】。`,
            "为了让我们有个好的开始，能先简单做个自我介绍吗？包括你的核心技术栈和一段最自豪的工作经历。"
          ],
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          tag: ""
        };
      }
      setMessages([initialMsg]);
      
      if (mode === "voice" || mode === "video") {
        ttsAbortControllerRef.current = new AbortController();
        setNeedsInteraction(true);
      }
    } else {
      // Fallback if no profile
      let initialMsg: Message;
      if (mode === "targeted") {
        initialMsg = {
          role: "ai",
          content: [
            `你好！我是你的专项训练辅导官。本次我们针对【${topic}】进行定点突破。`,
            `目前的训练目标是：${desc}`,
            "准备好开始了吗？我们直接进入正题吧。"
          ],
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          tag: ""
        };
      } else {
        initialMsg = {
          role: "ai",
          content: [
            "你好！欢迎参加今天的面试，我是你的 AI 面试官。",
            "能先简单做个自我介绍吗？"
          ],
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          tag: ""
        };
      }
      setMessages([initialMsg]);

      if (mode === "voice" || mode === "video") {
        ttsAbortControllerRef.current = new AbortController();
        setNeedsInteraction(true);
      }
    }
  }, []);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [messages, isTyping, mode]);

  const fetchTTS = async (text: string, signal?: AbortSignal) => {
    if (!text.trim()) return null;
    console.log("[Voice] Fetching TTS for text:", text.substring(0, 20) + "...");
    try {
      const res = await fetch("/api/speech/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal
      });
      if (!res.ok) {
        console.error("[Voice] TTS fetch failed with status:", res.status);
        return null;
      }
      const blob = await res.blob();
      console.log("[Voice] TTS fetched successfully, blob size:", blob.size);
      return URL.createObjectURL(blob);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error("TTS fetch error", e);
      }
      return null;
    }
  };

  const playNextAudio = () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    
    console.log("[Voice] Playing next audio from queue, remaining in queue:", audioQueueRef.current.length);
    isPlayingRef.current = true;
    setIsPlaying(true);
    const audioUrl = audioQueueRef.current.shift()!;
    
    const audio = new Audio(audioUrl);
    currentAudioRef.current = audio;
    
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      isPlayingRef.current = false;
      setIsPlaying(false);
      currentAudioRef.current = null;
      if (!isInterruptedRef.current) {
        playNextAudio();
      }
    };
    
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      isPlayingRef.current = false;
      setIsPlaying(false);
      currentAudioRef.current = null;
      if (!isInterruptedRef.current) {
        playNextAudio();
      }
    };
    
    audio.play().catch(e => {
      console.error("Audio play failed (autoplay blocked?):", e);
      URL.revokeObjectURL(audioUrl);
      isPlayingRef.current = false;
      setIsPlaying(false);
      currentAudioRef.current = null;
      if (!isInterruptedRef.current) {
        playNextAudio();
      }
    });
  };

  const queueTTS = async (text: string) => {
    if ((mode !== "voice" && mode !== "video") || isInterruptedRef.current) return;
    const signal = ttsAbortControllerRef.current?.signal;
    const audioUrl = await fetchTTS(text, signal);
    
    if (audioUrl && !isInterruptedRef.current && (!signal || !signal.aborted)) {
      audioQueueRef.current.push(audioUrl);
      playNextAudio();
    }
  };

  const interruptAI = () => {
    isInterruptedRef.current = true;
    
    // Abort ongoing requests
    abortControllerRef.current?.abort();
    ttsAbortControllerRef.current?.abort();
    
    // Stop playback
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    
    // Clear queue
    audioQueueRef.current.forEach(url => URL.revokeObjectURL(url));
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    
    setIsTyping(false);
    setIsThinking(false);
    
    // Mark last AI message as interrupted
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg.role === "ai") {
        const lastIdx = lastMsg.content.length - 1;
        if (!lastMsg.content[lastIdx].includes("[已打断]")) {
          lastMsg.content[lastIdx] = lastMsg.content[lastIdx] + " [已打断]";
        }
      }
      return newMessages;
    });
  };

  const sendMessage = async (text: string, overrideTag?: string) => {
    if (!text.trim() || isTyping) return;
    
    // Reset interrupt flag and initialize controllers
    isInterruptedRef.current = false;
    abortControllerRef.current = new AbortController();
    ttsAbortControllerRef.current = new AbortController();

    const userMsg: Message = {
      role: "user",
      content: text.split("\n"),
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      tag: overrideTag || ""
    };
    
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsTyping(true);
    setThinkingStatus("面试官思考中");
    setIsThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages, profile, mode, topic, desc }),
        signal: abortControllerRef.current.signal
      });
      
      if (res.ok) {
        // Wait until we process the stream to set isTyping false
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        
        const aiMsg: Message = {
          role: "ai",
          content: [""],
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          tag: ""
        };
        
        setMessages(prev => [...prev, aiMsg]);
        
        let processedTextLength = 0;
        let fullText = "";

        if (reader) {
          try {
            let isFirstRealToken = true;
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                setIsThinking(false);
                const remainingText = fullText.slice(processedTextLength).trim();
                if (remainingText && !isInterruptedRef.current) {
                  queueTTS(remainingText);
                }
                break;
              }
              
              const textChunk = decoder.decode(value, { stream: true });
              
              // Handle server-side status commands
              if (textChunk.includes('__STATUS_SEARCHING__')) {
                setThinkingStatus("进一步检索资料中");
                continue;
              } else if (textChunk.includes('__STATUS_GENERATING__')) {
                // Ignore the control string itself
                continue;
              }
              
              if (isFirstRealToken && textChunk.trim() !== '') {
                isFirstRealToken = false;
                setIsThinking(false);
              }
              
              fullText += textChunk;
              
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                newMessages[lastIndex] = {
                  ...newMessages[lastIndex],
                  content: fullText.split("\n")
                };
                return newMessages;
              });
              
              if (mode === "voice") {
                let unprocessedText = fullText.slice(processedTextLength);
                while (true) {
                  const match = unprocessedText.match(/([。！？\n]|([.!?](?=\s|$)))/);
                  if (match && match.index !== undefined) {
                    const splitIndex = match.index + match[0].length;
                    const sentence = unprocessedText.slice(0, splitIndex).trim();
                    if (sentence && !isInterruptedRef.current) {
                      queueTTS(sentence);
                    }
                    processedTextLength += splitIndex;
                    unprocessedText = fullText.slice(processedTextLength);
                  } else {
                    break;
                  }
                }
              }
            }
          } catch (e: any) {
            if (e.name === 'AbortError') {
              console.log('LLM stream aborted by barge-in');
            } else {
              throw e;
            }
          }
        }
        
        setQuestionCount(prev => prev + 1);
      } else {
        if (res.status === 403) {
          const errorData = await res.json();
          setLimitAlertMessage(errorData.error || "您已达到每日面试次数上限。");
          setShowLimitAlert(true);
          setMessages(messages);
        } else {
          console.error("Failed to get AI response");
          setMessages(messages);
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Failed to send message", error);
        setMessages(messages);
      }
    } finally {
      setIsThinking(false);
      if (!isInterruptedRef.current) {
        setIsTyping(false);
      }
    }
  };

  const handleSend = () => sendMessage(input);

  const handleSkip = () => {
    sendMessage("这道题我不太清楚，我们可以跳过吗？", "跳过本题");
  };

  const handleIdk = () => {
    sendMessage("这个问题我不太了解，能给我一些提示或者换个问题吗？", "我不知道");
  };

  const isComposingRef = useRef(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) {
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const initAudioContext = () => {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        setAudioContext(ctx);
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
      }
    } else if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  };

  const recorderCtxRef = useRef<AudioContext | null>(null);
  const recorderSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const utteranceChunksRef = useRef<Int16Array[]>([]);
  const utteranceLastVoiceAtRef = useRef<number>(0);
  const utteranceHasVoiceRef = useRef(false);
  const utteranceStartAtRef = useRef<number>(0);
  const micStatusRef = useRef(micStatus);

  useEffect(() => {
    micStatusRef.current = micStatus;
  }, [micStatus]);

  const pcmFloatTo16 = (float32: Float32Array) => {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };

  const concatInt16 = (chunks: Int16Array[]) => {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Int16Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  };

  const arrayBufferToBase64 = (buffer: ArrayBufferLike) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  const submitPCMToASR = async (pcm16: Int16Array) => {
    console.log("[Voice] Submitting PCM to ASR, length:", pcm16.length);
    if (pcm16.length < 16000 * 0.2) {
      console.log("[Voice] PCM too short, ignoring");
      setMicStatus("error");
      setMicErrorMsg("声音太短或太轻，请重试。");
      setTimeout(() => setMicStatus("recording"), 2000);
      return;
    }

    try {
      const audioBase64 = arrayBufferToBase64(pcm16.buffer);
      const res = await fetch("/api/speech/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, format: "raw" }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "语音识别失败");
      }

      const data = await res.json();
      const text = data.text;
      console.log("[Voice] ASR returned text:", text);
      if (!text || text.trim() === "") {
        setMicStatus("error");
        setMicErrorMsg("未识别到清晰的声音，请靠近麦克风重试。");
        setTimeout(() => setMicStatus("recording"), 2000);
        return;
      }

      await sendMessage(text);
    } catch (error: any) {
      console.error("ASR Error:", error);
      setMicStatus("error");
      setMicErrorMsg(error.message || "语音识别失败，请检查网络或重试。");
      setTimeout(() => setMicStatus("recording"), 2000);
    }
  };

  const stopCall = () => {
    recorderProcessorRef.current?.disconnect();
    recorderSourceRef.current?.disconnect();
    recorderProcessorRef.current = null;
    recorderSourceRef.current = null;

    if (recorderCtxRef.current) {
      recorderCtxRef.current.close();
      recorderCtxRef.current = null;
    }

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    utteranceChunksRef.current = [];
    utteranceHasVoiceRef.current = false;
    utteranceLastVoiceAtRef.current = 0;
    utteranceStartAtRef.current = 0;
  };

  const startCall = async (initialText?: string) => {
    initAudioContext();
    if (isTyping || isPlayingRef.current) {
      interruptAI();
    }

    try {
      setMicStatus("requesting");
      setMicErrorMsg("");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: mode === "video" ? true : false
      });
      streamRef.current = stream;
      if (mode === "video" && videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      if (initialText) {
        queueTTS(initialText);
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 16000 });
      recorderCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      recorderSourceRef.current = source;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      recorderProcessorRef.current = processor;

      source.connect(processor);
      processor.connect(ctx.destination);

      utteranceChunksRef.current = [];
      utteranceHasVoiceRef.current = false;
      utteranceLastVoiceAtRef.current = 0;
      utteranceStartAtRef.current = 0;

      processor.onaudioprocess = (e) => {
        e.outputBuffer.getChannelData(0).fill(0);

        if (micStatusRef.current !== "recording") return;
        
        const inputData = e.inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const now = performance.now();

        const isVoice = rms > 0.002;
        // console.log("Current RMS:", rms.toFixed(5)); // Uncomment to debug mic level
        
        if (isVoice) {
          if (!utteranceHasVoiceRef.current) {
            console.log("[Voice] Voice detected! RMS:", rms.toFixed(4));
          }
          if (!utteranceHasVoiceRef.current && (isTypingRef.current || isPlayingRef.current)) {
            interruptAI();
          }
          utteranceHasVoiceRef.current = true;
          utteranceLastVoiceAtRef.current = now;
          if (utteranceStartAtRef.current === 0) {
            utteranceStartAtRef.current = now;
          }
        }

        if (utteranceHasVoiceRef.current) {
          const pcm16 = pcmFloatTo16(inputData);
          utteranceChunksRef.current.push(pcm16);
        }

        const silenceTime = now - utteranceLastVoiceAtRef.current;
        const duration = now - utteranceStartAtRef.current;

        if (utteranceHasVoiceRef.current && utteranceLastVoiceAtRef.current > 0 && 
            (silenceTime > 800 || duration > 10000)) {
          const pcm = concatInt16(utteranceChunksRef.current);
          utteranceChunksRef.current = [];
          utteranceHasVoiceRef.current = false;
          utteranceLastVoiceAtRef.current = 0;
          utteranceStartAtRef.current = 0;

          setMicStatus("processing");
          submitPCMToASR(pcm).finally(() => {
            if (micStatusRef.current === "processing") {
              setMicStatus("recording");
            }
          });
        }
      };

      setMicStatus("recording");
    } catch (err: any) {
      console.error("Microphone access error:", err);
      setMicStatus("denied");
      stopCall();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicErrorMsg(mode === "video" ? "摄像头或麦克风权限被拒绝，请在浏览器设置中允许访问。" : "麦克风权限被拒绝，请在浏览器设置中允许访问。");
      } else {
        setMicErrorMsg(mode === "video" ? "无法访问摄像头或麦克风，请检查设备连接。" : "无法访问麦克风，请检查设备连接。");
      }
    }
  };

  const toggleCall = async () => {
    if (micStatus === "recording" || micStatus === "processing") {
      stopCall();
      setMicStatus("idle");
      return;
    }
    await startCall();
  };

  const handleEnd = () => {
    // Optionally save the interview data to sessionStorage here before redirecting
    sessionStorage.setItem("interviewHistory", JSON.stringify({
      messages,
      elapsedTime,
      questionCount
    }));
    router.push("/report");
  };

  return (
    <section id="view-interview" className="view active" style={{ paddingTop: 0, paddingBottom: 0 }}>
      {/* Modal / Alert for Daily Limit */}
      {showLimitAlert && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(20, 20, 19, 0.4)",
          backdropFilter: "blur(2px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          animation: "fadeIn 0.2s ease"
        }}>
          <div style={{
            backgroundColor: "var(--bg-surface)",
            padding: "2.5rem",
            borderRadius: "12px",
            width: "90%",
            maxWidth: "440px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
            border: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem"
          }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontFamily: "var(--font-heading)", color: "var(--text-dark)", fontSize: "1.25rem" }}>
                提示
              </h3>
              <p style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)", margin: 0, fontSize: "0.95rem", lineHeight: 1.6 }}>
                {limitAlertMessage}
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button 
                onClick={() => setShowLimitAlert(false)}
                style={{
                  padding: "0.6rem 1.5rem",
                  backgroundColor: "var(--accent-orange)",
                  border: "1px solid var(--accent-orange)",
                  borderRadius: "20px",
                  color: "white",
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  transition: "var(--transition)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--accent-orange-hover)";
                  e.currentTarget.style.borderColor = "var(--accent-orange-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--accent-orange)";
                  e.currentTarget.style.borderColor = "var(--accent-orange)";
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text Mode Room */}
      {(mode === "text" || mode === "targeted") && (
        <div id="room-text" className="chat-container" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 70px)", backgroundColor: "var(--bg-main)", position: "relative", border: "none", boxShadow: "none", borderRadius: 0, maxWidth: "100%" }}>
          
          {/* Header */}
          <div style={{ padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "var(--bg-main)", zIndex: 10, position: "sticky", top: 0 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem", fontFamily: "var(--font-heading)" }}>
                {mode === "targeted" ? `专项训练 (${topic || '未知'})` : "项目深挖轮 (文字模式)"}
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-ui)", marginTop: "0.25rem" }}>当前进度：第 {questionCount} 题 / 共 5 题</div>
            </div>
            <div style={{ color: "var(--accent-orange)", fontWeight: 500, fontFamily: "var(--font-ui)", backgroundColor: "rgba(217, 119, 87, 0.1)", padding: "0.4rem 1rem", borderRadius: "20px", fontSize: "0.9rem" }}>
              已用时 {formatTime(elapsedTime)}
            </div>
          </div>

          {/* Chat History */}
          <div className="chat-history" id="chat-history" ref={chatHistoryRef} style={{ flex: 1, overflowY: "auto", padding: "2rem 0 1rem 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: "800px", padding: "0 1.5rem", display: "flex", flexDirection: "column", gap: "2.5rem" }}>
              {messages.filter(msg => msg.role === 'user' || msg.content.join('').trim() !== '' || !isThinking).map((msg, idx) => (
                <div key={idx} style={{ display: "flex", width: "100%", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "ai" ? (
                    <div style={{ display: "flex", gap: "1rem", maxWidth: "90%" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.25rem", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-dark)", fontFamily: "var(--font-ui)" }}>AI</span>
                      </div>
                      <div style={{ paddingTop: "0.4rem" }}>
                        {msg.tag && <span style={{ display: "inline-block", padding: "0.2rem 0.6rem", backgroundColor: "rgba(217, 119, 87, 0.1)", color: "var(--accent-orange)", borderRadius: "4px", fontSize: "0.8rem", marginBottom: "0.75rem", fontWeight: 500 }}>{msg.tag}</span>}
                        <div style={{ fontFamily: "var(--font-body)", fontSize: "1.05rem", lineHeight: 1.75, color: "var(--text-dark)" }} className="markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content.join('\n\n')}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "85%" }}>
                      <div style={{ backgroundColor: "var(--bg-subtle)", padding: "1rem 1.25rem", borderRadius: "20px 20px 4px 20px", border: "1px solid var(--border-color)", fontFamily: "var(--font-body)", fontSize: "1.05rem", lineHeight: 1.6, color: "var(--text-dark)", boxShadow: "0 2px 10px rgba(0,0,0,0.02)" }}>
                        {msg.tag && <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 500 }}>[{msg.tag}]</span>}
                        {msg.content.map((p, i) => <p key={i} style={{ marginBottom: i === msg.content.length - 1 ? 0 : "0.5rem" }}>{p}</p>)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isThinking && (
                <div style={{ display: "flex", width: "100%", justifyContent: "flex-start" }}>
                  <div style={{ display: "flex", gap: "1rem", maxWidth: "90%" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.25rem", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-dark)", fontFamily: "var(--font-ui)" }}>AI</span>
                    </div>
                    <div style={{ paddingTop: "0.6rem", display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.95rem" }}>
                      {thinkingStatus}
                      <div style={{ display: "flex", gap: "4px" }}>
                        <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--text-muted)", animation: "blink 1.4s infinite both" }}></div>
                        <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--text-muted)", animation: "blink 1.4s infinite both 0.2s" }}></div>
                        <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--text-muted)", animation: "blink 1.4s infinite both 0.4s" }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Input Area */}
          <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "1rem 1.5rem 2rem 1.5rem", position: "relative", zIndex: 10 }}>
            {/* Gradient mask for smooth scroll fade */}
            <div style={{ position: "absolute", top: "-40px", left: 0, right: 0, height: "40px", background: "linear-gradient(to bottom, transparent, var(--bg-main))", pointerEvents: "none" }}></div>
            {/* Solid background behind the input */}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "var(--bg-main)", zIndex: -1 }}></div>
            
            <div style={{ width: "100%", maxWidth: "800px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)", borderRadius: "24px", padding: "1rem 1.25rem", boxShadow: "0 8px 30px rgba(0,0,0,0.06)", transition: "var(--transition)", display: "flex", flexDirection: "column", gap: "0.75rem" }} onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent-orange)"} onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}>
              <textarea
                ref={textareaRef}
                placeholder="给 AI 面试官发送消息... (按 Enter 发送，Shift+Enter 换行)"
                style={{ width: "100%", border: "none", outline: "none", resize: "none", minHeight: "48px", maxHeight: "200px", fontFamily: "var(--font-ui)", fontSize: "1rem", color: "var(--text-dark)", backgroundColor: "transparent", lineHeight: 1.5, padding: "0 0.25rem" }}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { setTimeout(() => { isComposingRef.current = false; }, 300); }}
                disabled={isTyping}
                rows={1}
              ></textarea>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button onClick={handleSkip} disabled={isTyping} style={{ padding: "0.4rem 0.8rem", backgroundColor: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "16px", fontSize: "0.85rem", color: "var(--text-dark)", cursor: isTyping ? "not-allowed" : "pointer", fontFamily: "var(--font-ui)", transition: "var(--transition)" }} onMouseEnter={(e) => !isTyping && (e.currentTarget.style.backgroundColor = "var(--border-color)")} onMouseLeave={(e) => !isTyping && (e.currentTarget.style.backgroundColor = "var(--bg-main)")}>
                    跳过本题
                  </button>
                  <button onClick={handleIdk} disabled={isTyping} style={{ padding: "0.4rem 0.8rem", backgroundColor: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "16px", fontSize: "0.85rem", color: "var(--text-dark)", cursor: isTyping ? "not-allowed" : "pointer", fontFamily: "var(--font-ui)", transition: "var(--transition)" }} onMouseEnter={(e) => !isTyping && (e.currentTarget.style.backgroundColor = "var(--border-color)")} onMouseLeave={(e) => !isTyping && (e.currentTarget.style.backgroundColor = "var(--bg-main)")}>
                    我不知道
                  </button>
                </div>
                
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <button onClick={handleEnd} style={{ padding: "0.4rem 1rem", backgroundColor: "transparent", border: "none", fontSize: "0.9rem", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-ui)", transition: "var(--transition)", fontWeight: 500 }} onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-orange)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}>
                    结束并生成报告
                  </button>
                  
                  <button 
                    onClick={handleSend} 
                    disabled={isTyping || !input.trim()}
                    style={{ 
                      width: "36px", height: "36px", borderRadius: "50%", 
                      backgroundColor: input.trim() && !isTyping ? "var(--accent-blue)" : "var(--border-strong)", 
                      color: "white", border: "none", display: "flex", alignItems: "center", justifyContent: "center", 
                      cursor: input.trim() && !isTyping ? "pointer" : "not-allowed", transition: "var(--transition)" 
                    }}
                    onMouseEnter={(e) => input.trim() && !isTyping && (e.currentTarget.style.backgroundColor = "#5a8bba")}
                    onMouseLeave={(e) => input.trim() && !isTyping && (e.currentTarget.style.backgroundColor = "var(--accent-blue)")}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voice Mode Room */}
      {(mode === "voice" || mode === "video") && (
        <div
          id="room-voice"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            backgroundColor: "#faf9f5",
            color: "#141413",
            fontFamily: "'Lora', Georgia, serif",
            position: "relative",
          }}
        >
          <style>{`
            .brand-heading { font-family: 'Poppins', Arial, sans-serif; font-weight: 600; }
            .brand-accent-orange { color: #d97757; }
            .brand-accent-blue { color: #6a9bcc; }
            .brand-accent-green { color: #788c5d; }
            .pulse-ring {
              animation: pulsate 2s ease-out infinite;
            }
            @keyframes pulsate {
              0% { transform: scale(1); opacity: 0.8; }
              100% { transform: scale(1.5); opacity: 0; }
            }
            @keyframes subtle-bounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-10px); }
            }
          `}</style>
          
          {needsInteraction && (
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(250, 249, 245, 0.9)", backdropFilter: "blur(5px)"
            }}>
              <button 
                onClick={() => {
                  setNeedsInteraction(false);
                  initAudioContext();
                  startCall(messages.length > 0 ? messages[0].content.join(" ") : "你好，我准备好了");
                }}
                style={{
                  padding: "1rem 2.5rem", borderRadius: "30px", background: "#d97757",
                  color: "white", border: "none", fontSize: "1.2rem", fontWeight: 600,
                  cursor: "pointer", boxShadow: "0 10px 30px rgba(217, 119, 87, 0.3)",
                  fontFamily: "'Poppins', sans-serif"
                }}
              >
                点击开始面试连接
              </button>
            </div>
          )}
          
          <div style={{ textAlign: "center", width: "100%", maxWidth: "700px", padding: "0 20px", display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "space-between", paddingTop: "8vh", paddingBottom: "8vh", filter: needsInteraction ? "blur(4px)" : "none" }}>
            
            <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", position: "absolute", top: "2rem", left: 0, right: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", background: "rgba(255,255,255,0.7)", padding: "0.5rem 1.5rem", borderRadius: "30px", boxShadow: "0 2px 10px rgba(0,0,0,0.03)" }}>
                <div className="brand-heading" style={{ fontSize: "1.1rem", color: "#141413" }}>{mode === "video" ? "AI 视频面试" : "AI 语音面试"}</div>
                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#b0aea5" }}></div>
                <div style={{ color: "#d97757", fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}>{formatTime(elapsedTime)}</div>
              </div>
            </div>

            {mode === "video" && (
              <div style={{
                position: "absolute",
                bottom: "3rem",
                right: "2rem",
                width: "200px",
                height: "266px",
                borderRadius: "16px",
                overflow: "hidden",
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                backgroundColor: "#141413",
                zIndex: 10
              }}>
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  muted 
                  style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                />
              </div>
            )}
            
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%" }}>
              <div style={{ 
                position: "relative", width: "160px", height: "160px", display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "3rem"
              }}>
                {(isPlaying || micStatus === "recording") && (
                  <>
                    <div className="pulse-ring" style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", border: isPlaying ? "2px solid #6a9bcc" : "2px solid #788c5d", opacity: 0.5 }}></div>
                    <div className="pulse-ring" style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", border: isPlaying ? "2px solid #6a9bcc" : "2px solid #788c5d", opacity: 0.3, animationDelay: "1s" }}></div>
                  </>
                )}
                
                <div style={{ 
                  width: "120px", height: "120px", borderRadius: "50%", 
                  background: isPlaying ? "linear-gradient(135deg, #6a9bcc, #8eb4db)" : (micStatus === "recording" ? "linear-gradient(135deg, #788c5d, #9eb086)" : "linear-gradient(135deg, #e8e6dc, #b0aea5)"),
                  boxShadow: isPlaying ? "0 10px 30px rgba(106, 155, 204, 0.4)" : (micStatus === "recording" ? "0 10px 30px rgba(120, 140, 93, 0.4)" : "0 10px 30px rgba(0,0,0,0.05)"),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.5s ease", zIndex: 2,
                  animation: isPlaying ? "subtle-bounce 3s ease-in-out infinite" : "none"
                }}>
                  {isPlaying ? (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                  ) : (micStatus === "recording" ? (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                  ) : (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  ))}
                </div>
              </div>

              <div style={{ width: "100%", maxWidth: "600px", minHeight: "120px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: "0.9rem", color: "#b0aea5", marginBottom: "1rem", fontFamily: "'Poppins', sans-serif", textTransform: "uppercase", letterSpacing: "1px" }}>
                  {isPlaying ? "AI 面试官" : (micStatus === "recording" ? "请讲话..." : (micStatus === "processing" ? "思考中..." : "准备中..."))}
                </div>
                <div style={{ 
                  fontSize: "1.35rem", lineHeight: 1.6, color: "#141413", textAlign: "center",
                  transition: "opacity 0.3s ease", opacity: (micStatus === "processing" || isTyping) && !isPlaying ? 0.5 : 1
                }}>
                  {messages.length > 0 && messages[messages.length - 1].role === 'ai' 
                    ? messages[messages.length - 1].content.join(' ') 
                    : (micStatus === "recording" ? "..." : "正在连接语音...")}
                </div>
              </div>
            </div>

            {micStatus === "denied" && (
              <div style={{ color: "#d97757", padding: "1rem", background: "rgba(217, 119, 87, 0.1)", borderRadius: "8px", marginBottom: "2rem" }}>
                {micErrorMsg}
              </div>
            )}
            {micStatus === "error" && (
              <div style={{ color: "#d97757", padding: "1rem", background: "rgba(217, 119, 87, 0.1)", borderRadius: "8px", marginBottom: "2rem" }}>
                {micErrorMsg}
              </div>
            )}

            <div style={{ paddingBottom: "2rem" }}>
              <button 
                title="挂断"
                onClick={handleEnd}
                style={{ 
                  width: "72px", height: "72px", borderRadius: "50%", 
                  background: "#d97757", color: "white", border: "none", 
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", 
                  boxShadow: "0 8px 20px rgba(217, 119, 87, 0.3)", transition: "transform 0.2s ease, background 0.2s ease" 
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.05)";
                  e.currentTarget.style.backgroundColor = "#c26547";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.backgroundColor = "#d97757";
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
              </button>
            </div>
            
          </div>
        </div>
      )}

    </section>
  );
}

export default function Interview() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InterviewContent />
    </Suspense>
  );
}
