import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, Mic, RefreshCw, Sparkles, Heart, Activity, Moon, Pill } from 'lucide-react';
import { sleep } from '../utils/helpers';
import { fetchChatHistory, sendChatMessage } from '../services/aiApi';
import { useSelector } from 'react-redux';
import StructuredResponse from '../components/StructuredResponse';

const suggestedPrompts = [
  'What does my heart rate trend mean?',
  'How can I improve my sleep quality?',
  'What foods boost energy levels?',
  'Should I be worried about my blood pressure?',
  'How many steps should I walk daily?',
  'What vitamins should I take?',
];

const renderMarkdown = (text) => {
  if (!text) return null;
  
  // Split the text by lines
  const lines = text.split('\n');
  
  return lines.map((line, index) => {
    let currentLine = line;
    
    // Check for blockquote
    if (currentLine.startsWith('>')) {
      const quoteText = currentLine.substring(1).trim();
      return (
        <blockquote key={index} className="border-l-4 border-primary-500 pl-3 my-2 text-slate-500 italic dark:text-slate-400">
          {parseInlineMarkdown(quoteText)}
        </blockquote>
      );
    }
    
    // Check for bullet points
    if (currentLine.trim().startsWith('*') || currentLine.trim().startsWith('-')) {
      const cleanText = currentLine.replace(/^[\*\-]\s*/, '');
      return (
        <li key={index} className="list-disc ml-5 my-1 text-slate-700 dark:text-slate-350">
          {parseInlineMarkdown(cleanText)}
        </li>
      );
    }
    
    // Check for headers (e.g. ### or ##)
    if (currentLine.startsWith('###')) {
      return (
        <h5 key={index} className="text-xs font-extrabold text-primary-400 dark:text-primary-350 mt-3 mb-1.5 uppercase tracking-wider">
          {parseInlineMarkdown(currentLine.substring(3).trim())}
        </h5>
      );
    }
    if (currentLine.startsWith('##')) {
      return (
        <h4 key={index} className="text-base font-black text-white dark:text-slate-100 mt-4 mb-2">
          {parseInlineMarkdown(currentLine.substring(2).trim())}
        </h4>
      );
    }
    if (currentLine.startsWith('#')) {
      return (
        <h3 key={index} className="text-lg font-black text-white dark:text-slate-100 mt-5 mb-2.5">
          {parseInlineMarkdown(currentLine.substring(1).trim())}
        </h3>
      );
    }
    
    // If it's a blank line, add some spacing
    if (currentLine.trim() === '') {
      return <div key={index} className="h-2" />;
    }
    
    // Default paragraph
    return (
      <p key={index} className="mb-1 text-slate-800 dark:text-slate-200">
        {parseInlineMarkdown(currentLine)}
      </p>
    );
  });
};

const parseInlineMarkdown = (text) => {
  // Convert **text** to bold
  const boldRegex = /\*\*(.*?)\*\*/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-extrabold text-primary-550 dark:text-primary-400">
        {match[1]}
      </strong>
    );
    lastIndex = boldRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  // If no bold matches, just return the text
  return parts.length > 0 ? parts : text;
};

export default function AIAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const { metrics } = useSelector((s) => s.health);
  const { user } = useSelector((s) => s.auth);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load chat history from backend on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        setIsTyping(true);
        const data = await fetchChatHistory();
        setSessionId(data.id);
        const mappedMessages = data.messages.map((m, idx) => ({
          id: idx,
          role: m.role === 'model' ? 'assistant' : 'user',
          message: m.content,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        }));
        setMessages(mappedMessages);
      } catch (err) {
        console.error("Failed to load chat history:", err);
      } finally {
        setIsTyping(false);
      }
    };
    loadHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;
    setInput('');

    const newMsg = {
      id: Date.now(),
      role: 'user',
      message: userMsg,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, newMsg]);
    setIsTyping(true);

    try {
      const response = await sendChatMessage(userMsg, sessionId);
      setSessionId(response.session_id);
      
      const mappedHistory = response.history.map((m, idx) => ({
        id: idx,
        role: m.role === 'model' ? 'assistant' : 'user',
        message: m.content,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      }));
      setMessages(mappedHistory);
    } catch (err) {
      console.error("Failed to get AI response:", err);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          message: "I'm sorry, I'm currently unable to connect to Gemini services. Please try again later.",
          timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleResetChat = async () => {
    try {
      setIsTyping(true);
      // Generate a new clean session by clearing sessionId
      setSessionId(null);
      const response = await sendChatMessage("Hello", null);
      setSessionId(response.session_id);
      const mappedHistory = response.history.map((m, idx) => ({
        id: idx,
        role: m.role === 'model' ? 'assistant' : 'user',
        message: m.content,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      }));
      setMessages(mappedHistory);
    } catch (err) {
      console.error("Failed to reset chat:", err);
    } finally {
      setIsTyping(false);
    }
  };

  const healthStats = [
    { label: 'Heart Rate', value: `${metrics?.heartRate?.current || 72} bpm`, icon: Heart, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Blood Pressure', value: `${metrics?.bloodPressure?.systolic || 120}/${metrics?.bloodPressure?.diastolic || 80}`, icon: Activity, color: 'text-primary-500', bg: 'bg-primary-500/10' },
    { label: 'Sleep', value: `${metrics?.sleep?.hours || 7.5} hrs`, icon: Moon, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: 'Medications', value: '3 Active', icon: Pill, color: 'text-accent-500', bg: 'bg-accent-500/10' },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-[calc(100vh-120px)]">
      {/* Sidebar info */}
      <div className="lg:w-72 space-y-4 flex-shrink-0">
        {/* AI Info card */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-glow-primary">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">HealthAI</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-green-500 font-medium">Online — Gemini 1.5</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Your AI-powered health companion. Ask about symptoms, medications, nutrition, fitness, or get personalized health advice based on your vitals.
          </p>
        </div>

        {/* Your health context */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Your Health Context</h4>
          </div>
          <div className="space-y-2.5">
            {healthStats.map(stat => (
              <div key={stat.label} className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{stat.value}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suggested prompts */}
        <div className="glass-card p-4">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-3">Suggested Questions</h4>
          <div className="space-y-2">
            {suggestedPrompts.slice(0, 4).map(prompt => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="w-full text-left text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-400 transition-all"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 glass-card flex flex-col overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200/50 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white">HealthAI Assistant</span>
          </div>
          <button
            onClick={handleResetChat}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {messages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-3`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-md whitespace-pre-line'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-150 rounded-bl-md whitespace-normal'
                    }`}
                  >
                    {msg.role === 'user' ? msg.message : <StructuredResponse text={msg.message} type="chat" />}
                  </div>
                  <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center flex-shrink-0 mt-1 text-white text-xs font-bold shadow-sm">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-slate-100 dark:bg-white/10 flex items-center gap-2 shadow-sm border border-slate-200/10">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold animate-pulse">HealthAI is writing</span>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <motion.span
                        key={i}
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                        className="w-1.5 h-1.5 rounded-full bg-primary-500 block"
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-slate-200/50 dark:border-white/10">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask me anything about your health..."
              className="input-field flex-1"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isTyping}
              className="btn-primary w-11 h-11 p-0 flex-shrink-0 rounded-xl"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
            HealthAI provides general guidance only. Always consult a licensed physician for medical decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
