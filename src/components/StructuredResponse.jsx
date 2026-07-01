import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Heart, Activity, CheckSquare, Apple, Dumbbell, Sparkles,
  AlertTriangle, Calendar, Pill, Search, ClipboardList, Shield,
  ArrowRight, Info, Check, Clock
} from 'lucide-react';

// Helper to parse bold markdown
const parseBold = (text) => {
  const parts = [];
  const boldRegex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-extrabold text-primary-600 dark:text-primary-400">
        {match[1]}
      </strong>
    );
    lastIndex = boldRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

// Helper to parse standard lists, paragraphs, headers
const renderParagraphOrList = (text) => {
  if (!text) return null;
  const lines = text.split('\n');

  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={idx} className="h-2" />;

    // Markdown Headers
    if (trimmed.startsWith('###')) {
      return (
        <h4 key={idx} className="text-xs font-extrabold text-primary-500 dark:text-primary-450 mt-4 mb-2 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary-500" />
          {parseBold(trimmed.substring(3).trim())}
        </h4>
      );
    }
    if (trimmed.startsWith('##')) {
      return (
        <h3 key={idx} className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-4 mb-2">
          {parseBold(trimmed.substring(2).trim())}
        </h3>
      );
    }
    if (trimmed.startsWith('#')) {
      return (
        <h2 key={idx} className="text-base font-black text-slate-900 dark:text-white mt-5 mb-2.5">
          {parseBold(trimmed.substring(1).trim())}
        </h2>
      );
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      return (
        <blockquote key={idx} className="border-l-4 border-primary-500 pl-3 my-2 text-slate-500 dark:text-slate-400 italic bg-primary-500/5 py-1 rounded-r-lg">
          {parseBold(trimmed.substring(1).trim())}
        </blockquote>
      );
    }

    // List item
    if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
      return (
        <li key={idx} className="list-none ml-4 my-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
          <span>{parseBold(trimmed.replace(/^[\*\-]\s*/, ''))}</span>
        </li>
      );
    }

    return (
      <p key={idx} className="text-xs text-slate-700 dark:text-slate-350 leading-relaxed mb-1.5">
        {parseBold(trimmed)}
      </p>
    );
  });
};

// Markdown Table Parser
const parseMarkdownTable = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
  if (lines.length < 2) return null;

  const parseRow = (row) => row.split('|').map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow); // Skip divider row

  return (
    <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10 text-xs text-left">
        <thead className="bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-2.5 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-150 dark:divide-white/5 bg-white/40 dark:bg-dark-200/40">
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-semibold">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function StructuredResponse({ text, type = 'chat' }) {
  const navigate = useNavigate();

  if (!text) return null;

  // If text contains a markdown table, parse and extract it separately
  const hasTable = text.includes('|') && text.split('\n').some(l => l.trim().startsWith('|'));

  // Section parsing definitions
  const sectionKeys = [
    { id: 'summary', header: '🩺 Health Summary', icon: Heart, bg: 'from-rose-500/10 to-transparent', border: 'border-rose-500/20', textCol: 'text-rose-500' },
    { id: 'assessment', header: '📊 Health Assessment', icon: Activity, bg: 'from-amber-500/10 to-transparent', border: 'border-amber-500/20', textCol: 'text-amber-500' },
    { id: 'recommendations', header: '💡 Personalized Recommendations', icon: CheckSquare, bg: 'from-primary-500/10 to-transparent', border: 'border-primary-500/20', textCol: 'text-primary-500' },
    { id: 'diet', header: '🥗 Diet Suggestions', header2: '🥗 Diet & Lifestyle Suggestions', icon: Apple, bg: 'from-emerald-500/10 to-transparent', border: 'border-emerald-500/20', textCol: 'text-emerald-500' },
    { id: 'lifestyle', header: '🏃 Lifestyle Improvements', icon: Dumbbell, bg: 'from-cyan-500/10 to-transparent', border: 'border-cyan-500/20', textCol: 'text-cyan-500' },
    { id: 'insight', header: '❤️ HealthPoint Insight', icon: Sparkles, bg: 'from-violet-500/10 to-transparent', border: 'border-violet-500/20', textCol: 'text-violet-500' },
  ];

  const sections = {};
  let currentKey = 'general';
  let lines = text.split('\n');
  let actions = [];

  // Parse lines into segments
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let foundHeader = false;

    // Check for interactive checkbox action items
    if (line.startsWith('✅') || line.startsWith('- [ ] ✅') || line.startsWith('- [ ]')) {
      const cleanAction = line.replace(/^.*?✅\s*/, '').replace(/^- \[ \]\s*/, '').trim();
      if (cleanAction) {
        actions.push(cleanAction);
      }
      continue;
    }

    if (line.toLowerCase().includes('would you like me to') || line.toLowerCase().includes('suggested actions')) {
      currentKey = 'actions_intro';
      continue;
    }

    for (const key of sectionKeys) {
      if (line.startsWith(key.header) || (key.header2 && line.startsWith(key.header2))) {
        currentKey = key.id;
        sections[currentKey] = [];
        foundHeader = true;
        break;
      }
    }

    if (!foundHeader) {
      if (!sections[currentKey]) {
        sections[currentKey] = [];
      }
      sections[currentKey].push(lines[i]);
    }
  }

  // Helper to trigger navigation based on action buttons clicked
  const handleActionClick = (actionText) => {
    const action = actionText.toLowerCase();
    if (action.includes('doctor') || action.includes('appointment')) {
      navigate('/doctors');
    } else if (action.includes('pharmacy') || action.includes('medicine')) {
      navigate('/pharmacy');
    } else if (action.includes('report') || action.includes('record')) {
      navigate('/records');
    } else if (action.includes('meal') || action.includes('diet') || action.includes('nutrition')) {
      navigate('/nutrition');
    } else if (action.includes('workout') || action.includes('exercise') || action.includes('fitness')) {
      navigate('/fitness');
    } else if (action.includes('analytics') || action.includes('score')) {
      navigate('/analytics');
    } else if (action.includes('timeline')) {
      navigate('/timeline');
    } else {
      navigate('/dashboard');
    }
  };

  // If the text is general and does not contain our structured headings, fallback to a neat standard render
  const sectionKeysPresent = Object.keys(sections).filter(k => k !== 'general' && k !== 'actions_intro');
  if (sectionKeysPresent.length === 0) {
    if (hasTable) {
      const tableText = text.substring(text.indexOf('|'));
      const beforeTable = text.substring(0, text.indexOf('|'));
      return (
        <div className="space-y-2">
          {renderParagraphOrList(beforeTable)}
          {parseMarkdownTable(tableText)}
        </div>
      );
    }
    return <div className="space-y-1.5">{renderParagraphOrList(text)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* 1. HEALTH SUMMARY */}
      {sections.summary && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-gradient-to-br from-rose-500/5 to-transparent border border-rose-500/10 shadow-sm relative overflow-hidden"
        >
          {/* ECG Pulse BG Simulation */}
          <div className="absolute right-4 top-4 opacity-5 pointer-events-none">
            <Heart className="w-24 h-24 text-rose-500" />
          </div>
          <h4 className="text-xs font-black text-rose-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Heart className="w-4 h-4 text-rose-500 animate-pulse" />
            🩺 Health Summary
          </h4>
          <p className="text-xs text-slate-700 dark:text-slate-350 leading-relaxed font-semibold pl-1.5">
            {parseBold(sections.summary.join('\n').trim())}
          </p>
        </motion.div>
      )}

      {/* 2. HEALTH ASSESSMENT */}
      {sections.assessment && (() => {
        const content = sections.assessment.join('\n').trim();
        let riskColor = 'bg-emerald-500';
        let riskTextCol = 'text-emerald-500';
        let riskBg = 'bg-emerald-500/10';
        let badge = 'Healthy';

        if (content.includes('🔴') || content.toLowerCase().includes('high risk')) {
          riskColor = 'bg-rose-500';
          riskTextCol = 'text-rose-500';
          riskBg = 'bg-rose-500/10';
          badge = 'High Risk';
        } else if (content.includes('🟠') || content.toLowerCase().includes('needs attention')) {
          riskColor = 'bg-amber-500';
          riskTextCol = 'text-amber-500';
          riskBg = 'bg-amber-500/10';
          badge = 'Needs Attention';
        } else if (content.includes('🟡') || content.toLowerCase().includes('moderate')) {
          riskColor = 'bg-amber-500';
          riskTextCol = 'text-amber-400';
          riskBg = 'bg-amber-500/10';
          badge = 'Moderate';
        }

        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-transparent dark:from-white/5 dark:to-transparent border border-slate-200 dark:border-white/5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4 mb-3 border-b border-slate-100 dark:border-white/5 pb-2">
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-primary-500" />
                📊 Health Assessment
              </h4>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${riskBg} ${riskTextCol}`}>
                {badge}
              </span>
            </div>
            
            <div className="flex gap-4 items-start pl-1">
              <div className="relative w-2 h-14 bg-slate-200 dark:bg-white/10 rounded-full flex-shrink-0 overflow-hidden">
                <div className={`absolute bottom-0 left-0 right-0 ${riskColor}`} style={{ height: badge === 'High Risk' ? '90%' : badge === 'Needs Attention' ? '65%' : badge === 'Moderate' ? '40%' : '15%' }} />
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-350 leading-relaxed pl-0.5">
                {parseBold(content.replace(/^[🟢🟡🟠🔴]\s*/, '').replace(/Healthy|Moderate|Needs Attention|High Risk/gi, '').replace(/^Show risk level:\s*/i, '').trim())}
              </p>
            </div>
          </motion.div>
        );
      })()}

      {/* 3. PERSONALIZED RECOMMENDATIONS */}
      {sections.recommendations && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl border border-primary-500/20 bg-gradient-to-br from-primary-500/5 to-transparent"
        >
          <h4 className="text-xs font-black text-primary-500 dark:text-primary-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <CheckSquare className="w-4 h-4 text-primary-500" />
            💡 Daily Recommendations
          </h4>
          <div className="space-y-2">
            {sections.recommendations.join('\n').split('\n').filter(l => l.trim().startsWith('*') || l.trim().startsWith('-')).map((rec, i) => {
              const cleanRec = rec.replace(/^[\*\-]\s*/, '').trim();
              return (
                <div key={i} className="flex items-start gap-2.5 p-2 rounded-xl bg-white/50 dark:bg-white/5 border border-slate-150 dark:border-white/5 hover:border-primary-500/30 transition-all duration-200">
                  <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer" />
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{parseBold(cleanRec)}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* 4. DIET SUGGESTIONS */}
      {sections.diet && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent"
        >
          <h4 className="text-xs font-black text-emerald-500 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Apple className="w-4 h-4 text-emerald-500" />
            🥗 Diet Suggestions
          </h4>
          <div className="space-y-2">
            {renderParagraphOrList(sections.diet.join('\n').trim())}
          </div>
        </motion.div>
      )}

      {/* 5. LIFESTYLE IMPROVEMENTS */}
      {sections.lifestyle && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent"
        >
          <h4 className="text-xs font-black text-cyan-500 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Dumbbell className="w-4 h-4 text-cyan-500" />
            🏃 Lifestyle Improvements
          </h4>
          <div className="space-y-2">
            {renderParagraphOrList(sections.lifestyle.join('\n').trim())}
          </div>
        </motion.div>
      )}

      {/* 6. HEALTHPOINT INSIGHT */}
      {sections.insight && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl border-2 border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 shadow-glow-primary relative overflow-hidden"
        >
          <div className="absolute right-2 -bottom-2 opacity-10 pointer-events-none">
            <Sparkles className="w-20 h-20 text-violet-500 animate-pulse" />
          </div>
          <h4 className="text-xs font-black text-violet-500 dark:text-violet-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Sparkles className="w-4 h-4 text-violet-500 animate-spin" />
            ✨ HealthPoint AI Insights
          </h4>
          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-bold">
            {parseBold(sections.insight.join('\n').trim())}
          </p>
        </motion.div>
      )}

      {/* 7. INTERACTIVE BUTTON ACTIONS */}
      {actions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 space-y-3"
        >
          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Suggested Quick Actions
          </h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {actions.map((act, i) => (
              <button
                key={i}
                onClick={() => handleActionClick(act)}
                className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-dark-100 border border-slate-250 dark:border-white/5 hover:border-primary-500/50 hover:bg-primary-500/5 dark:hover:bg-primary-500/10 text-slate-800 dark:text-slate-200 font-bold text-xs transition-all text-left"
              >
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  {act}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
