import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, Send, Mic, RefreshCw, X, Minimize2, Maximize2, Sparkles, MessageSquare, Trash2
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { sendChatMessage, fetchChatHistory } from '../services/aiApi';
import StructuredResponse from './StructuredResponse';

const suggestedPrompts = [
  'What does my heart rate trend mean?',
  'How can I improve my sleep quality?',
  'What foods boost energy levels?',
  'Should I be worried about my BP?',
];

export default function FloatingAI() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', message: 'Hello! I am your HealthAI companion. How can I help you today?', timestamp: 'Now' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const { user } = useSelector((s) => s.auth);
  const messagesEndRef = useRef(null);
  const chatWindowRef = useRef(null);

  // Load chat history once on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await fetchChatHistory();
        if (data && data.messages && data.messages.length > 0) {
          setSessionId(data.id);
          const mapped = data.messages.map((m, idx) => ({
            id: idx,
            role: m.role === 'model' ? 'assistant' : 'user',
            message: m.content,
            timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          }));
          setMessages(mapped);
        }
      } catch (err) {
        console.error("Failed to load chat history in floating assistant:", err);
      }
    };
    loadHistory();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen, isMinimized]);

  const handleSendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;
    setInput('');

    const newMsg = {
      id: Date.now(),
      role: 'user',
      message: userMsg,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, newMsg]);
    setIsTyping(true);

    try {
      const response = await sendChatMessage(userMsg, sessionId);
      setSessionId(response.session_id);
      
      const mapped = response.history.map((m, idx) => ({
        id: idx,
        role: m.role === 'model' ? 'assistant' : 'user',
        message: m.content,
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      }));
      setMessages(mapped);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          message: "I am having trouble connecting to the medical AI service. Please verify your connection and try again.",
          timestamp: 'Just now'
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const clearChat = () => {
    setMessages([
      { id: 1, role: 'assistant', message: 'Hello! I am your HealthAI companion. How can I help you today?', timestamp: 'Now' }
    ]);
    setSessionId(null);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            ref={chatWindowRef}
            drag
            dragListener={true}
            dragConstraints={{ left: -1000, right: 100, top: -800, bottom: 50 }}
            dragElastic={0.05}
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 30 }}
            className={`glass-card p-0 flex flex-col shadow-2xl border border-primary-500/20 pointer-events-auto select-none ${
              isExpanded 
                ? 'w-[480px] h-[650px] mb-4' 
                : 'w-[360px] h-[480px] mb-4'
            }`}
          >
            {/* Header Handle for Dragging */}
            <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-primary-600/10 to-accent-600/10 border-b border-slate-150 dark:border-white/5 cursor-move flex-shrink-0 select-none rounded-t-2xl">
              <div className="flex items-center gap-2 drag-none">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-md">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1">
                    HealthAI Companion
                  </h4>
                  <p className="text-[8px] text-green-500 font-bold uppercase tracking-wider">Active</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 drag-none">
                <button 
                  onClick={() => setIsMinimized(true)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-600"
                  title="Minimize"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-600"
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={clearChat}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-rose-500"
                  title="Clear Chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-rose-500"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 divide-y divide-transparent scrollbar-thin">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2.5 pt-0.5`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-0.5`}>
                    <div
                      className={`px-3 py-2 rounded-xl text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-md whitespace-pre-line shadow-md'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200 rounded-bl-md shadow-sm border border-slate-150 dark:border-white/5'
                      }`}
                    >
                      {msg.role === 'user' ? msg.message : <StructuredResponse text={msg.message} type="chat" />}
                    </div>
                    <span className="text-[8px] text-slate-400 mt-0.5 font-semibold">{msg.timestamp}</span>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="px-3 py-2 rounded-xl rounded-bl-md bg-slate-50 dark:bg-white/5 text-[10px] text-slate-400 font-semibold border border-slate-150 dark:border-white/5">
                    Writing...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts Grid */}
            {messages.length <= 1 && (
              <div className="px-4 py-2 flex flex-wrap gap-1.5 flex-shrink-0">
                {suggestedPrompts.map(p => (
                  <button
                    key={p}
                    onClick={() => handleSendMessage(p)}
                    className="text-[9px] font-bold px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-slate-500 hover:bg-primary-500/10 hover:text-primary-500 transition-all text-left"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Input area */}
            <div className="p-3 border-t border-slate-150 dark:border-white/5 flex-shrink-0 flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask HealthAI anything..."
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none dark:text-white"
              />
              <button
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-all"
                title="Voice Dictation (Placeholder)"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isTyping}
                className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center shadow-md shadow-primary-500/10 hover:opacity-90 disabled:opacity-50 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button (FAB) */}
      {(!isOpen || isMinimized) && (
        <motion.button
          onClick={() => { setIsOpen(true); setIsMinimized(false); }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 text-white shadow-xl hover:shadow-2xl flex items-center justify-center border-2 border-white dark:border-dark-200 shadow-glow-primary z-[99999]"
          title="Open HealthAI Assistant"
        >
          <MessageSquare className="w-5 h-5 animate-pulse" />
        </motion.button>
      )}
    </div>
  );
}
