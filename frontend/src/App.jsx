import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const APP_NAME = "Omnimate";

const MODES = [
  { id: "general", label: "💬 General", description: "Normal conversation" },
  { id: "study", label: "📚 Study", description: "Learning & explanations" },
  { id: "coding", label: "💻 Coding", description: "Code help & debugging" },
  { id: "career", label: "💼 Career", description: "Resume & interview prep" },
  { id: "agent", label: "🧠 Agent", description: "Multi-step task mode" },
];

const MODE_WELCOME = {
  general: `Hello! 👋 I'm ${APP_NAME}. How can I help you today?`,
  study: `📚 Study Mode is on!\n\nI'm ${APP_NAME}. I can explain topics, help with homework, and create quizzes or flashcards.\n\nTry:\n- Explain photosynthesis\n- Make a quiz on Python loops\n- Make flashcards on Operating Systems`,
  coding: `💻 Coding Mode is on!\n\nI'm ${APP_NAME}. I can explain code, find bugs, and suggest better approaches.\n\nPaste your code or describe the problem.`,
  career: `💼 Career Mode is on!\n\nI'm ${APP_NAME}. I can analyze your resume, suggest improvements, and guide your career path.\n\nUpload your resume or type: Analyze my resume`,
  agent: `🧠 Agent Mode is on!\n\nI'm ${APP_NAME}. Give me a goal — I'll break it into steps, use tools if needed, and deliver a final result.\n\nTry:\n- Check Delhi weather and suggest a plan\n- Find nearby hospitals in Mumbai\n- Research latest AI news and summarize`,
};

const MODE_QUICK_ACTIONS = {
  general: [
    { label: "💡 Explain a topic", text: "Explain artificial intelligence in simple words" },
    { label: "📝 Summarize text", text: "Help me summarize a paragraph" },
    { label: "🔍 Search web", text: "Search the web for: " },
    { label: "🖼️ Explain image", text: "Explain this image in detail" },
    { label: "🌦️ Weather", text: "What is the weather in Delhi?" },
    { label: "🗺️ Nearby hospitals", text: "Nearby hospitals in Delhi" },
    { label: "🚗 Directions", text: "Directions from Delhi to Agra" },
  ],
  study: [
    { label: "📝 Make Quiz", text: "Make a quiz on this topic: " },
    { label: "🃏 Flashcards", text: "Make flashcards on this topic: " },
    { label: "📖 Explain topic", text: "Explain this topic step by step: " },
    { label: "🖼️ Explain diagram", text: "Explain this diagram step by step" },
  ],
  coding: [
    { label: "🐛 Find bugs", text: "Find bugs in this code:\n\n" },
    { label: "⚙️ Explain code", text: "Explain this code step by step:\n\n" },
    { label: "🧪 Test cases", text: "Write test cases for this code:\n\n" },
    { label: "🖼️ Explain screenshot", text: "Explain the code or error in this screenshot" },
  ],
  career: [
    { label: "📄 Analyze Resume", text: "Analyze my resume" },
    { label: "💼 Job roles", text: "Suggest suitable job roles for my profile" },
    { label: "🎤 Interview prep", text: "Give me interview questions for a software developer role" },
  ],
  agent: [
    { label: "🌦️ Weather plan", text: "Check Delhi weather and suggest what I should do today" },
    { label: "🗺️ Nearby + tips", text: "Find nearby hospitals in Mumbai and give safety tips" },
    { label: "📰 Research", text: "Research latest AI news and give a short summary with sources" },
  ],
};

const VOICE_OPTIONS = [
  { name: "Madhur", label: "Madhur — Hindi Male" },
  { name: "Swara", label: "Swara — Hindi Female" },
  { name: "Neerja", label: "Neerja — English (India)" },
  { name: "Prabhat", label: "Prabhat — English Male (India)" },
  { name: "Jenny", label: "Jenny — English Female (US)" },
  { name: "Guy", label: "Guy — English Male (US)" },
  { name: "Nanami", label: "Nanami — Japanese Female" },
  { name: "Keita", label: "Keita — Japanese Male" },
  { name: "Xiaoxiao", label: "Xiaoxiao — Chinese Female" },
  { name: "Yunxi", label: "Yunxi — Chinese Male" },
];

const BG_THEMES = [
  { id: "charcoal", label: "Charcoal" },
  { id: "black", label: "Black" },
  { id: "warm", label: "Warm Dark" },
  { id: "navy", label: "Soft Navy" },
  { id: "slate", label: "Slate" },
];

const normalizeAttachment = (attachment) => {
  if (!attachment) return null;
  const type = attachment.type || attachment.mime_type || "";
  const isImage = attachment.isImage ?? attachment.is_image ?? type.startsWith("image/");
  const savedUrl = attachment.url || attachment.attachment_url || attachment.image_url || null;
  let preview = null;
  if (savedUrl) {
    preview = savedUrl.startsWith("http")
      ? savedUrl
      : `${API_URL}${savedUrl.startsWith("/") ? "" : "/"}${savedUrl}`;
  }
  return { ...attachment, name: attachment.name || "Attachment", type, isImage, preview };
};

const normalizeMessage = (msg) => ({
  ...msg,
  attachment: normalizeAttachment(msg?.attachment),
});

const parseQuiz = (text) => {
  if (!text || !text.includes("===QUIZ_START===") || !text.includes("===QUIZ_END===")) return null;
  try {
    const quizBlock = text.split("===QUIZ_START===")[1].split("===QUIZ_END===")[0].trim();
    const questionBlocks = quizBlock.split(/Q\d+\./i).filter((q) => q.trim());
    const questions = questionBlocks.map((block, index) => {
      const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      const questionText = lines[0] || `Question ${index + 1}`;
      const options = [];
      let answer = "";
      let explanation = "";
      lines.forEach((line) => {
        if (/^[A-D]\)/.test(line)) options.push({ key: line[0], text: line.substring(2).trim() });
        else if (line.toUpperCase().startsWith("ANSWER:")) answer = line.split(":")[1].trim().toUpperCase().charAt(0);
        else if (line.toUpperCase().startsWith("EXPLANATION:")) explanation = line.split(":").slice(1).join(":").trim();
      });
      return { id: index, question: questionText, options, answer, explanation };
    });
    return questions.length > 0 ? questions : null;
  } catch {
    return null;
  }
};

const parseFlashcards = (text) => {
  if (!text || !text.includes("===FLASHCARD_START===") || !text.includes("===FLASHCARD_END===")) return null;
  try {
    const block = text.split("===FLASHCARD_START===")[1].split("===FLASHCARD_END===")[0].trim();
    const cardBlocks = block.split(/CARD\s*\d+/i).filter((c) => c.trim());
    const cards = cardBlocks.map((card, index) => {
      const lines = card.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      let front = "";
      let back = "";
      lines.forEach((line) => {
        if (line.toUpperCase().startsWith("FRONT:")) front = line.split(":").slice(1).join(":").trim();
        else if (line.toUpperCase().startsWith("BACK:")) back = line.split(":").slice(1).join(":").trim();
      });
      return { id: index, front: front || `Card ${index + 1}`, back: back || "No answer" };
    });
    return cards.length > 0 ? cards : null;
  } catch {
    return null;
  }
};

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", text: MODE_WELCOME.general }]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [historyVisible, setHistoryVisible] = useState(() => window.innerWidth > 700);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [isCallMode, setIsCallMode] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("Madhur");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [currentMode, setCurrentMode] = useState("general");
  const [quizAnswers, setQuizAnswers] = useState({});
  const [flippedCards, setFlippedCards] = useState({});
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [explainLevel, setExplainLevel] = useState("normal");
  const [studyStreak, setStudyStreak] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [bgTheme, setBgTheme] = useState(() => localStorage.getItem("bg_theme") || "charcoal");
  const [historyQuery, setHistoryQuery] = useState("");
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("auth_token") || "");
  const [authUser, setAuthUser] = useState(() => localStorage.getItem("auth_user") || "");
  const [authMode, setAuthMode] = useState("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const voiceRequestRef = useRef(0);
  const ttsCacheRef = useRef(new Map());
  const messagesEndRef = useRef(null);

  const filteredHistory = chatHistory.filter((item) =>
    (item.title || "").toLowerCase().includes(historyQuery.toLowerCase())
  );

  const authHeaders = () => (authToken ? { Authorization: `Bearer ${authToken}` } : {});

  const handleUnauthorized = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setAuthToken("");
    setAuthUser("");
    setChatHistory([]);
    setCurrentChatId(null);
    setAuthError("Session expired. Please login again.");
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const updateStudyStreak = () => {
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem("study_last_date");
    const currentStreak = Number(localStorage.getItem("study_streak") || 0);
    if (lastDate === today) {
      setStudyStreak(currentStreak || 1);
      return;
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const newStreak = lastDate === yesterday.toDateString() ? currentStreak + 1 : 1;
    localStorage.setItem("study_last_date", today);
    localStorage.setItem("study_streak", String(newStreak));
    setStudyStreak(newStreak);
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      stopVoice();
      if (selectedAttachment?.preview) URL.revokeObjectURL(selectedAttachment.preview);
      for (const url of ttsCacheRef.current.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
      ttsCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (authToken) loadChatHistory();
  }, [authToken]);

  useEffect(() => {
    setStudyStreak(Number(localStorage.getItem("study_streak") || 0));
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    document.body.classList.toggle("light-theme", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.body.setAttribute("data-bg", bgTheme);
    localStorage.setItem("bg_theme", bgTheme);
  }, [bgTheme]);

  const loadChatHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await fetch(`${API_URL}/chats`, { headers: { ...authHeaders() } });
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || "Could not load chat history.");
      setChatHistory(data.chats || []);
    } catch (error) {
      console.error("History loading error:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openFilePicker = (accept) => {
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
    setAttachmentMenuOpen(false);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const attachment = {
      file,
      name: file.name,
      type: file.type,
      isImage,
      preview: isImage ? URL.createObjectURL(file) : null,
    };
    if (selectedAttachment?.preview) URL.revokeObjectURL(selectedAttachment.preview);
    setSelectedAttachment(attachment);
    event.target.value = "";
  };

  const removeAttachment = () => {
    if (selectedAttachment?.preview) URL.revokeObjectURL(selectedAttachment.preview);
    setSelectedAttachment(null);
  };

  const stopVoice = () => {
    voiceRequestRef.current += 1;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
      try {
        audioRef.current.currentTime = 0;
      } catch {}
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      try {
        URL.revokeObjectURL(audioUrlRef.current);
      } catch {}
      audioUrlRef.current = null;
    }
    setSpeakingIndex(null);
    setVoiceLoading(false);
  };

  const removeEmojisForVoice = (text) =>
    text
      .replace(/[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*_~`#>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  const createTTSCacheKey = (text, voice) => `${voice}::${text}`;

  const speakWithGemini = async (text, index = null) => {
    if (!text?.trim()) return;
    stopVoice();
    const requestId = voiceRequestRef.current;
    const cleanText = removeEmojisForVoice(text);
    if (!cleanText) return;
    const cacheKey = createTTSCacheKey(cleanText, selectedVoice);

    if (!ttsCacheRef.current.has(cacheKey) && ttsCacheRef.current.size >= 20) {
      const oldestKey = ttsCacheRef.current.keys().next().value;
      const oldestUrl = ttsCacheRef.current.get(oldestKey);
      try {
        URL.revokeObjectURL(oldestUrl);
      } catch {}
      ttsCacheRef.current.delete(oldestKey);
    }

    try {
      setVoiceLoading(true);
      if (index !== null) setSpeakingIndex(index);
      let audioUrl = ttsCacheRef.current.get(cacheKey);
      if (!audioUrl) {
        const response = await fetch(`${API_URL}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText, voice: selectedVoice }),
        });
        if (requestId !== voiceRequestRef.current) return;
        if (!response.ok) {
          let errorMessage = "Could not generate AI voice.";
          try {
            const data = await response.json();
            errorMessage = data.detail || data.message || errorMessage;
          } catch {}
          throw new Error(errorMessage);
        }
        const audioBlob = await response.blob();
        if (requestId !== voiceRequestRef.current) return;
        if (!audioBlob.size) throw new Error("Empty audio received.");
        audioUrl = URL.createObjectURL(audioBlob);
        ttsCacheRef.current.set(cacheKey, audioUrl);
      }
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = audioUrl;
      audio.volume = 1;
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;
      audio.onended = () => {
        if (requestId !== voiceRequestRef.current) return;
        audioRef.current = null;
        setSpeakingIndex(null);
        setVoiceLoading(false);
      };
      audio.onerror = () => {
        if (requestId !== voiceRequestRef.current) return;
        audioRef.current = null;
        setSpeakingIndex(null);
        setVoiceLoading(false);
      };
      await audio.play();
    } catch (error) {
      if (requestId !== voiceRequestRef.current) return;
      console.error("TTS error:", error);
      setSpeakingIndex(null);
      setVoiceLoading(false);
      alert(error.message || "Could not play AI voice.");
    }
  };

  const handleModeChange = (modeId) => {
    if (loading) return;
    setCurrentMode(modeId);
    setQuizAnswers({});
    setFlippedCards({});
    setEditingIndex(null);
    setOpenMenu(null);
    setMessage("");
    setCurrentChatId(null);
    removeAttachment();
    stopVoice();
    if (modeId === "study") updateStudyStreak();
    setMessages([{ role: "assistant", text: MODE_WELCOME[modeId] || MODE_WELCOME.general }]);
  };

  const handleQuickAction = (text) => {
    if (loading) return;
    setMessage(text);
    setTimeout(() => {
      const textarea = document.querySelector(".input-area textarea");
      if (textarea) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = text.length;
      }
    }, 50);
  };

  const sendMessage = async (customMessage = null, autoSpeak = false) => {
    const textToSend = customMessage !== null ? customMessage.trim() : message.trim();
    if ((!textToSend && !selectedAttachment) || loading) return null;
    const userMessage = textToSend;
    const attachmentToSend = selectedAttachment;
    setSelectedAttachment(null);
    setAttachmentMenuOpen(false);
    setMessage("");
    setOpenMenu(null);
    setLoading(true);

    if (editingIndex !== null) {
      const updatedMessages = [...messages];
      updatedMessages[editingIndex] = { role: "user", text: userMessage };
      if (updatedMessages[editingIndex + 1]?.role === "assistant") updatedMessages.splice(editingIndex + 1, 1);
      setMessages(updatedMessages);
      setEditingIndex(null);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          text: userMessage,
          attachment: attachmentToSend
            ? {
                name: attachmentToSend.name,
                type: attachmentToSend.type,
                preview: attachmentToSend.preview,
                isImage: attachmentToSend.isImage,
              }
            : null,
        },
      ]);
    }

    try {
      const formData = new FormData();
      formData.append("message", userMessage);
      formData.append("mode", currentMode);
      formData.append("explain_level", explainLevel);
      const shouldSearch =
        webSearchEnabled ||
        textToSend.toLowerCase().startsWith("search the web for:") ||
        /\b(latest|today|current|news|who is the|prime minister)\b/i.test(textToSend);
      formData.append("web_search_enabled", shouldSearch ? "true" : "false");
      if (currentChatId !== null) formData.append("chat_id", String(currentChatId));

      if (attachmentToSend?.file) {
        const fileName = (attachmentToSend.name || "").toLowerCase();
        const fileType = attachmentToSend.type || "";
        const isDocument =
          fileType === "application/pdf" ||
          fileName.endsWith(".pdf") ||
          fileName.endsWith(".docx") ||
          fileName.endsWith(".txt") ||
          fileName.endsWith(".md") ||
          fileName.endsWith(".csv");
        if (isDocument) formData.append("file", attachmentToSend.file);
        else formData.append("image", attachmentToSend.file);
      }

      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: formData,
      });

      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Session expired. Please login again.");
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || "Something went wrong.");
      if (data.chat_id) setCurrentChatId(data.chat_id);

      if (data.attachment) {
        const savedAttachment = normalizeAttachment(data.attachment);
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "user") {
              updated[i] = { ...updated[i], attachment: savedAttachment };
              break;
            }
          }
          return updated;
        });
      }

      const aiResponse = data.assistant_response || data.message || "Sorry, I couldn't generate a response.";
      setMessages((prev) => [...prev, { role: "assistant", text: aiResponse }]);
      if (currentMode === "study") updateStudyStreak();
      if (autoSpeak) await speakWithGemini(aiResponse, null);
      await loadChatHistory();
      return aiResponse;
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: error.message || "Sorry, I couldn't connect to the AI service." },
      ]);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleQuizAnswer = (messageIndex, questionId, selectedKey) => {
    setQuizAnswers((prev) => {
      const messageAnswers = prev[messageIndex] || {};
      if (messageAnswers[questionId]) return prev;
      return { ...prev, [messageIndex]: { ...messageAnswers, [questionId]: selectedKey } };
    });
  };

  const handleFlipCard = (messageIndex, cardId) => {
    setFlippedCards((prev) => {
      const messageCards = prev[messageIndex] || {};
      return { ...prev, [messageIndex]: { ...messageCards, [cardId]: !messageCards[cardId] } };
    });
  };

  const copyMessage = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setOpenMenu(null);
      alert("Message copied!");
    } catch (error) {
      console.error("Copy error:", error);
    }
  };

  const editMessage = (index) => {
    if (loading || messages[index]?.role !== "user") return;
    setMessage(messages[index].text);
    setEditingIndex(index);
    setOpenMenu(null);
  };

  const regenerateMessage = async (index) => {
    if (loading || messages[index]?.role !== "assistant") return;
    const userIndex = index - 1;
    if (userIndex < 0 || messages[userIndex]?.role !== "user") return;
    const userMessage = messages[userIndex].text;
    setOpenMenu(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("message", userMessage);
      formData.append("mode", currentMode);
      formData.append("explain_level", explainLevel);
      if (currentChatId !== null) formData.append("chat_id", String(currentChatId));
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: formData,
      });
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Session expired. Please login again.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || "Could not regenerate.");
      if (data.chat_id) setCurrentChatId(data.chat_id);
      const newResponse = data.assistant_response || data.message || "Sorry, I couldn't generate a response.";
      setMessages((prev) => {
        const updated = [...prev];
        updated[index] = { role: "assistant", text: newResponse };
        return updated;
      });
      setQuizAnswers((prev) => {
        const updated = { ...prev };
        delete updated[index];
        return updated;
      });
      setFlippedCards((prev) => {
        const updated = { ...prev };
        delete updated[index];
        return updated;
      });
      await loadChatHistory();
    } catch (error) {
      console.error("Regenerate error:", error);
      setMessages((prev) => {
        const updated = [...prev];
        updated[index] = { role: "assistant", text: error.message || "Could not regenerate." };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteMessage = (index) => {
    if (loading) return;
    setMessages((prev) => {
      const updated = [...prev];
      if (updated[index]?.role === "user" && updated[index + 1]?.role === "assistant") updated.splice(index, 2);
      else updated.splice(index, 1);
      return updated;
    });
    setOpenMenu(null);
    if (speakingIndex === index) stopVoice();
    if (editingIndex === index) {
      setEditingIndex(null);
      setMessage("");
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setMessage("");
    setOpenMenu(null);
  };

  const startNewChat = async () => {
    if (loading) return;
    try {
      setLoading(true);
      stopVoice();
      const formData = new FormData();
      formData.append("title", "New Chat");
      const response = await fetch(`${API_URL}/new-chat`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: formData,
      });
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Session expired. Please login again.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || "Could not create new chat.");
      setCurrentChatId(data.chat_id);
      setMessages([{ role: "assistant", text: MODE_WELCOME[currentMode] || MODE_WELCOME.general }]);
      setMessage("");
      setEditingIndex(null);
      setOpenMenu(null);
      setQuizAnswers({});
      setFlippedCards({});
      removeAttachment();
      await loadChatHistory();
    } catch (error) {
      console.error("New chat error:", error);
      alert(error.message || "Could not start a new chat.");
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = async () => {
    if (loading || !currentChatId) return;
    try {
      setLoading(true);
      stopVoice();
      const response = await fetch(`${API_URL}/chats/${currentChatId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Session expired. Please login again.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || "Could not delete chat.");
      setCurrentChatId(null);
      setMessages([{ role: "assistant", text: MODE_WELCOME[currentMode] || MODE_WELCOME.general }]);
      setMessage("");
      setEditingIndex(null);
      setOpenMenu(null);
      setQuizAnswers({});
      setFlippedCards({});
      removeAttachment();
      await loadChatHistory();
    } catch (error) {
      console.error("Clear error:", error);
      alert(error.message || "Could not clear chat.");
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryChat = async (historyItem) => {
    if (loading) return;
    try {
      setHistoryLoading(true);
      stopVoice();
      const response = await fetch(`${API_URL}/chats/${historyItem.id}`, {
        headers: { ...authHeaders() },
      });
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Session expired. Please login again.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || "Could not load chat.");
      setCurrentChatId(historyItem.id);
      const chat = data.chat;
      if (chat?.messages?.length > 0) setMessages(chat.messages.map(normalizeMessage));
      else setMessages([{ role: "assistant", text: MODE_WELCOME[currentMode] || MODE_WELCOME.general }]);
      setMessage("");
      setEditingIndex(null);
      setOpenMenu(null);
      setQuizAnswers({});
      setFlippedCards({});
      removeAttachment();
    } catch (error) {
      console.error("Load chat error:", error);
      alert(error.message || "Could not load chat.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteHistory = async (historyId) => {
    if (loading) return;
    try {
      const response = await fetch(`${API_URL}/chats/${historyId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Session expired. Please login again.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || "Could not delete chat.");
      if (currentChatId === historyId) {
        stopVoice();
        setCurrentChatId(null);
        setMessages([{ role: "assistant", text: MODE_WELCOME[currentMode] || MODE_WELCOME.general }]);
        setQuizAnswers({});
        setFlippedCards({});
      }
      await loadChatHistory();
    } catch (error) {
      console.error("Delete history error:", error);
      alert(error.message || "Could not delete chat history.");
    }
  };

  const getRecognitionLanguage = () => {
    const lang = navigator.language?.toLowerCase() || "";
    return lang.startsWith("hi") ? "hi-IN" : "en-IN";
  };

  const startVoiceInput = () => {
    if (loading) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported. Please use Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.lang = getRecognitionLanguage();
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = async (event) => {
      if (!event.results?.[0]) return;
      const transcript = event.results[0][0].transcript.trim();
      if (!transcript) return;
      if (!isCallMode) {
        setMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
        return;
      }
      setMessage("");
      await sendMessage(transcript, true);
    };
    recognition.onerror = (event) => {
      console.error("Speech error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed") alert("Microphone permission blocked.");
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const speakMessage = (text, index) => {
    if (speakingIndex === index) {
      stopVoice();
      return;
    }
    speakWithGemini(text, index);
  };

  const toggleCallMode = () => {
    if (loading) return;
    const next = !isCallMode;
    setIsCallMode(next);
    if (!next) {
      stopVoice();
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleAuth = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Please enter username and password.");
      return;
    }
    try {
      setAuthLoading(true);
      setAuthError("");
      const formData = new FormData();
      formData.append("username", authUsername.trim());
      formData.append("password", authPassword.trim());
      const endpoint = authMode === "login" ? "/login" : "/register";
      const response = await fetch(`${API_URL}${endpoint}`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Authentication failed.");
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", data.username);
      setAuthToken(data.token);
      setAuthUser(data.username);
      setAuthPassword("");
    } catch (error) {
      setAuthError(error.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    if (!window.confirm("Logout?")) return;
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setAuthToken("");
    setAuthUser("");
    setChatHistory([]);
    setCurrentChatId(null);
    setMessages([{ role: "assistant", text: MODE_WELCOME.general }]);
    setSettingsOpen(false);
  };

  const renderMarkdown = (text) => (
    <ReactMarkdown
      components={{
        code({ className, children, ...props }) {
          const match = /language-([\w-]+)/.exec(className || "");
          const language = match ? match[1] : "text";
          return (
            <div className="code-block-wrapper">
              <SyntaxHighlighter
                style={oneDark}
                language={language}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: "18px",
                  borderRadius: "12px",
                  overflowX: "auto",
                  fontSize: "15px",
                  lineHeight: "1.65",
                }}
                {...props}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            </div>
          );
        },
        p: ({ children }) => <p className="markdown-paragraph">{children}</p>,
        h1: ({ children }) => <h1 className="markdown-heading">{children}</h1>,
        h2: ({ children }) => <h2 className="markdown-heading">{children}</h2>,
        h3: ({ children }) => <h3 className="markdown-heading">{children}</h3>,
        ul: ({ children }) => <ul className="markdown-list">{children}</ul>,
        ol: ({ children }) => <ol className="markdown-list">{children}</ol>,
        strong: ({ children }) => <strong className="markdown-bold">{children}</strong>,
      }}
    >
      {text}
    </ReactMarkdown>
  );

  const renderQuiz = (questions, messageIndex) => {
    const answers = quizAnswers[messageIndex] || {};
    const answeredCount = Object.keys(answers).length;
    const correctCount = questions.filter((q) => answers[q.id] === q.answer).length;
    const allAnswered = answeredCount === questions.length;
    return (
      <div className="quiz-container">
        {questions.map((q) => {
          const selected = answers[q.id];
          const isAnswered = Boolean(selected);
          const isCorrect = selected === q.answer;
          return (
            <div key={q.id} className="quiz-question">
              <div className="quiz-question-text">
                <strong>Q{q.id + 1}.</strong> {q.question}
              </div>
              <div className="quiz-options">
                {q.options.map((opt) => {
                  let optionClass = "quiz-option";
                  if (isAnswered) {
                    if (opt.key === q.answer) optionClass += " correct";
                    else if (opt.key === selected) optionClass += " wrong";
                    else optionClass += " disabled";
                  }
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={optionClass}
                      disabled={isAnswered}
                      onClick={() => handleQuizAnswer(messageIndex, q.id, opt.key)}
                    >
                      <span className="quiz-option-key">{opt.key})</span>
                      <span>{opt.text}</span>
                    </button>
                  );
                })}
              </div>
              {isAnswered && (
                <div className={`quiz-feedback ${isCorrect ? "correct" : "wrong"}`}>
                  <div className="quiz-result">
                    {isCorrect ? "✅ Correct!" : `❌ Wrong! Correct answer: ${q.answer}`}
                  </div>
                  {q.explanation && (
                    <div className="quiz-explanation">
                      <strong>Explanation:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="quiz-score-bar">
          {allAnswered ? (
            <span>
              🏁 Final Score:{" "}
              <strong>
                {correctCount}/{questions.length}
              </strong>
            </span>
          ) : (
            <span>
              📊 Progress:{" "}
              <strong>
                {answeredCount}/{questions.length}
              </strong>{" "}
              answered
              {answeredCount > 0 && (
                <>
                  {" "}
                  · Correct: <strong>{correctCount}</strong>
                </>
              )}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderFlashcards = (cards, messageIndex) => {
    const flips = flippedCards[messageIndex] || {};
    return (
      <div className="flashcard-container">
        <div className="flashcard-hint">💡 Click a card to reveal the answer</div>
        {cards.map((card) => {
          const isFlipped = Boolean(flips[card.id]);
          return (
            <button
              key={card.id}
              type="button"
              className={`flashcard ${isFlipped ? "flipped" : ""}`}
              onClick={() => handleFlipCard(messageIndex, card.id)}
            >
              <div className="flashcard-label">{isFlipped ? "Answer" : `Card ${card.id + 1}`}</div>
              <div className="flashcard-text">{isFlipped ? card.back : card.front}</div>
              <div className="flashcard-footer">{isFlipped ? "Click to see question" : "Click to reveal answer"}</div>
            </button>
          );
        })}
      </div>
    );
  };

  if (!authToken) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>✨ {APP_NAME}</h1>
          <p>{authMode === "login" ? "Login to continue" : "Create a new account"}</p>
          <p className="auth-hint">Password must be at least 6 characters</p>
          <input
            type="text"
            placeholder="Username"
            value={authUsername}
            onChange={(e) => setAuthUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAuth();
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAuth();
            }}
          />
          {authError && <div className="auth-error">{authError}</div>}
          <button type="button" onClick={handleAuth} disabled={authLoading}>
            {authLoading ? "Please wait..." : authMode === "login" ? "Login" : "Register"}
          </button>
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setAuthMode((m) => (m === "login" ? "register" : "login"));
              setAuthError("");
            }}
          >
            {authMode === "login" ? "New user? Register" : "Already have account? Login"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app mode-${currentMode}`}>
      <header className="header">
        <div>
          <h1>✨ {APP_NAME}</h1>
          <p>
            {currentMode === "study" && "📚 Study Mode"}
            {currentMode === "coding" && "💻 Coding Mode"}
            {currentMode === "career" && "💼 Career Mode"}
            {currentMode === "agent" && "🧠 Agent Mode"}
            {currentMode === "general" && "Ask me anything"}
          </p>
        </div>
        <div className="status">
          {studyStreak > 0 && (
            <div className="streak-badge" title="Study streak">
              🔥 {studyStreak} day{studyStreak > 1 ? "s" : ""}
            </div>
          )}
          <span className="auth-user">👤 {authUser}</span>
          <button type="button" className="settings-button" onClick={() => setSettingsOpen(true)}>
            ⚙️ Settings
          </button>
          <button type="button" className="logout-button" onClick={handleLogout}>
            Logout
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </button>
          <span className="status-dot"></span>
          Online
        </div>
      </header>

      <div className="app-body">
        {historyVisible && <div className="history-overlay" onClick={() => setHistoryVisible(false)} />}
        {historyVisible && (
          <aside className="history-sidebar">
            <div className="history-sidebar-header">
              <div className="history-title">
                <span>🕘</span>
                <span>Chat History</span>
              </div>
              <button className="history-close-button" onClick={() => setHistoryVisible(false)} type="button">
                ×
              </button>
            </div>
            <button className="sidebar-new-chat" onClick={startNewChat} disabled={loading} type="button">
              <span>＋</span> New Chat
            </button>
            <input
              className="history-search"
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder="Search chats..."
            />
            <div className="history-list">
              {historyLoading ? (
                <div className="empty-history">
                  <span>⏳</span>
                  <p>Loading history...</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="empty-history">
                  <span>💬</span>
                  <p>{historyQuery ? "No chats found." : "Your previous chats will appear here."}</p>
                </div>
              ) : (
                filteredHistory.map((item) => (
                  <div
                    className={`history-item ${currentChatId === item.id ? "active-history-item" : ""}`}
                    key={item.id}
                  >
                    <button className="history-chat-button" onClick={() => loadHistoryChat(item)} type="button">
                      <span className="history-chat-icon">💬</span>
                      <span className="history-chat-title">{item.title}</span>
                    </button>
                    <button className="history-delete-button" onClick={() => deleteHistory(item.id)} type="button">
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        <main className="chat-container">
          {!historyVisible && (
            <button className="show-history-button" onClick={() => setHistoryVisible(true)} type="button">
              🕘 History
            </button>
          )}

          <div className="chat-actions">
            <div className="mode-selector">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`mode-button ${currentMode === mode.id ? "active-mode" : ""}`}
                  onClick={() => handleModeChange(mode.id)}
                  disabled={loading}
                  title={mode.description}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button className="new-chat-button" onClick={startNewChat} disabled={loading} type="button">
              🆕 New Chat
            </button>
            <button
              className={`call-button ${isCallMode ? "call-active" : ""}`}
              onClick={toggleCallMode}
              disabled={loading}
              type="button"
            >
              📞 {isCallMode ? "End Call" : "AI Call"}
            </button>
            <button className="clear-button" onClick={clearMessages} disabled={loading || !currentChatId} type="button">
              🗑️ Clear
            </button>
          </div>

          <div className="level-toggle">
            <span className="level-label">Explain level:</span>
            {[
              { id: "beginner", label: "Beginner" },
              { id: "normal", label: "Intermediate" },
              { id: "advanced", label: "Expert" },
            ].map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                className={`level-button ${explainLevel === lvl.id ? "active" : ""}`}
                onClick={() => setExplainLevel(lvl.id)}
                disabled={loading}
              >
                {lvl.label}
              </button>
            ))}
          </div>

          {MODE_QUICK_ACTIONS[currentMode]?.length > 0 && (
            <div className="quick-actions">
              {MODE_QUICK_ACTIONS[currentMode].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="quick-action-button"
                  onClick={() => handleQuickAction(action.text)}
                  disabled={loading}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {isCallMode && (
            <div className="call-mode-panel">
              <div className="call-avatar">🤖</div>
              <div>
                <strong>AI Call Mode</strong>
                <p>Speak naturally with {APP_NAME}.</p>
              </div>
              <button type="button" className="call-mic-button" onClick={startVoiceInput} disabled={loading}>
                {isListening ? "🎙️ Listening..." : "🎙️ Speak"}
              </button>
            </div>
          )}

          <div className="messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message-row ${msg.role === "user" ? "user-row" : "assistant-row"}`}>
                <div className={`message ${msg.role === "user" ? "user-message" : "assistant-message"}`}>
                  {msg.attachment?.isImage && msg.attachment.preview && (
                    <div className="message-image-wrapper">
                      <img
                        src={msg.attachment.preview}
                        alt={msg.attachment.name}
                        className="message-image"
                        onClick={() => window.open(msg.attachment.preview, "_blank")}
                        style={{ cursor: "pointer" }}
                        title="Click to open image"
                      />
                      <span className="attachment-name">{msg.attachment.name}</span>
                    </div>
                  )}
                  {msg.attachment && !msg.attachment.isImage && (
                    <div className="file-attachment">
                      📄 <span>{msg.attachment.name}</span>
                    </div>
                  )}
                  {msg.text &&
                    (msg.role === "assistant" ? (
                      (() => {
                        const quiz = parseQuiz(msg.text);
                        if (quiz) return renderQuiz(quiz, index);
                        const flashcards = parseFlashcards(msg.text);
                        if (flashcards) {
                          const textWithoutFlashcards = msg.text
                            .replace(/===FLASHCARD_START===[\s\S]*?===FLASHCARD_END===/g, "")
                            .trim();
                          return (
                            <div>
                              {textWithoutFlashcards && renderMarkdown(textWithoutFlashcards)}
                              {renderFlashcards(flashcards, index)}
                            </div>
                          );
                        }
                        return renderMarkdown(msg.text);
                      })()
                    ) : (
                      <span className="user-text">{msg.text}</span>
                    ))}
                </div>

                <div className="message-menu-wrapper">
                  <button
                    className="message-menu-button"
                    onClick={() => setOpenMenu(openMenu === index ? null : index)}
                    disabled={loading}
                    type="button"
                  >
                    ⋮
                  </button>
                  {openMenu === index && (
                    <div className="message-menu">
                      <button onClick={() => copyMessage(msg.text)} type="button">
                        📋 Copy
                      </button>
                      {msg.role === "user" && (
                        <button onClick={() => editMessage(index)} type="button">
                          ✏️ Edit
                        </button>
                      )}
                      {msg.role === "assistant" && (
                        <button onClick={() => regenerateMessage(index)} type="button">
                          🔄 Regenerate
                        </button>
                      )}
                      <button onClick={() => deleteMessage(index)} type="button">
                        🗑️ Delete
                      </button>
                    </div>
                  )}
                </div>

                {msg.role === "assistant" &&
                  msg.text &&
                  !parseQuiz(msg.text) &&
                  !parseFlashcards(msg.text) && (
                    <button
                      className="voice-output-button"
                      onClick={() => speakMessage(msg.text, index)}
                      disabled={voiceLoading && speakingIndex !== index}
                      type="button"
                    >
                      {speakingIndex === index ? "⏸ Stop Voice" : "🔊 Play Voice"}
                    </button>
                  )}
              </div>
            ))}

            {loading && (
              <div className="message-row assistant-row">
                <div className="message assistant-message typing">
                  <span>Thinking</span>
                  <span className="dots">...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {editingIndex !== null && (
            <div className="editing-bar">
              <span>✏️ Editing message</span>
              <button type="button" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          )}

          {selectedAttachment && (
            <div className="attachment-preview">
              {selectedAttachment.isImage && selectedAttachment.preview && (
                <img src={selectedAttachment.preview} alt="Selected" className="selected-image-preview" />
              )}
              {!selectedAttachment.isImage && <span className="selected-file-icon">📄</span>}
              <span className="selected-file-name">{selectedAttachment.name}</span>
              <button type="button" className="remove-attachment-button" onClick={removeAttachment}>
                ×
              </button>
            </div>
          )}

          <div className="input-area">
            <div className="attachment-container">
              <button
                type="button"
                className="plus-button"
                onClick={() => setAttachmentMenuOpen((p) => !p)}
                disabled={loading}
              >
                +
              </button>
              {attachmentMenuOpen && (
                <div className="attachment-menu">
                  <button type="button" className="attachment-option" onClick={() => openFilePicker("image/*")}>
                    <span className="attachment-icon">📷</span>
                    <span>Camera</span>
                  </button>
                  <button type="button" className="attachment-option" onClick={() => openFilePicker("image/*")}>
                    <span className="attachment-icon">🖼️</span>
                    <span>Photos / Gallery</span>
                  </button>
                  <button
                    type="button"
                    className="attachment-option"
                    onClick={() => openFilePicker(".pdf,.doc,.docx,.txt,.md,.csv")}
                  >
                    <span className="attachment-icon">📄</span>
                    <span>Documents</span>
                  </button>
                  <button type="button" className="attachment-option" onClick={() => openFilePicker("*/*")}>
                    <span className="attachment-icon">📁</span>
                    <span>Files</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className={`web-search-toggle ${webSearchEnabled ? "active" : ""}`}
              onClick={() => setWebSearchEnabled((v) => !v)}
              disabled={loading}
              title="Enable web search"
            >
              🔍 {webSearchEnabled ? "Search ON" : "Search"}
            </button>

            <input ref={fileInputRef} type="file" className="hidden-file-input" onChange={handleFileChange} />

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                editingIndex !== null
                  ? "Edit your message..."
                  : currentMode === "career"
                  ? "Upload resume or ask career question..."
                  : currentMode === "study"
                  ? "Ask to explain, quiz, or flashcards..."
                  : currentMode === "coding"
                  ? "Paste code or describe your problem..."
                  : currentMode === "agent"
                  ? "Describe your goal for Omnimate..."
                  : "Type your message..."
              }
              rows="1"
              maxLength="5000"
              disabled={loading}
            />

            <div className="voice-controls">
              <select
                className="voice-selector"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={loading || voiceLoading}
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`voice-input-button ${isListening ? "listening" : ""}`}
                onClick={startVoiceInput}
                disabled={loading}
              >
                {isListening ? "🔴" : "🎙️"}
              </button>
            </div>

            <button
              type="button"
              className="send-button"
              onClick={() => sendMessage()}
              disabled={(!message.trim() && !selectedAttachment) || loading}
            >
              {loading ? "..." : editingIndex !== null ? "Update" : "Send"}
            </button>
          </div>

          <p className="hint">🎙️ Mic = Voice Input • 🔊 Play Voice = AI Voice • 📞 AI Call = Voice Conversation</p>
          <p className="hint">Press Enter to send • Shift + Enter for new line</p>
        </main>
      </div>

      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>⚙️ Settings</h2>
              <button type="button" onClick={() => setSettingsOpen(false)}>
                ×
              </button>
            </div>

            <div className="settings-section">
              <label>Theme</label>
              <div className="settings-row">
                <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
                  🌙 Dark
                </button>
                <button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
                  ☀️ Light
                </button>
              </div>
            </div>

            <div className="settings-section">
              <label>Background</label>
              <div className="settings-row">
                {BG_THEMES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={bgTheme === b.id ? "active" : ""}
                    onClick={() => setBgTheme(b.id)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <label>Default Voice</label>
              <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)}>
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-section">
              <label>Explain Level</label>
              <div className="settings-row">
                {[
                  { id: "beginner", label: "Beginner" },
                  { id: "normal", label: "Intermediate" },
                  { id: "advanced", label: "Expert" },
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    className={explainLevel === lvl.id ? "active" : ""}
                    onClick={() => setExplainLevel(lvl.id)}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <label>Account</label>
              <p className="settings-account">👤 {authUser}</p>
              <button type="button" className="settings-logout" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;