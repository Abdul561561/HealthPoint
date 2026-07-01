import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Upload, Search, Filter, Download, Eye, Calendar, User, Sparkles, Trash2 } from 'lucide-react';
import { RECORD_CATEGORIES } from '../utils/constants';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { formatDate, getStatusColor } from '../utils/helpers';
import { analyzeMedicalReport } from '../services/aiApi';
import { useDispatch, useSelector } from 'react-redux';
import { fetchHealthData, uploadMedicalRecord, deleteMedicalRecord } from '../redux/slices/healthSlice';
import StructuredResponse from '../components/StructuredResponse';

const renderMarkdown = (text) => {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, index) => {
    let currentLine = line;
    if (currentLine.startsWith('>')) {
      const quoteText = currentLine.substring(1).trim();
      return (
        <blockquote key={index} className="border-l-4 border-primary-500 pl-3 my-2 text-slate-505 italic dark:text-slate-400">
          {parseInlineMarkdown(quoteText)}
        </blockquote>
      );
    }
    if (currentLine.trim().startsWith('*') || currentLine.trim().startsWith('-')) {
      const cleanText = currentLine.replace(/^[\*\-]\s*/, '');
      return (
        <li key={index} className="list-disc ml-5 my-1 text-slate-700 dark:text-slate-350">
          {parseInlineMarkdown(cleanText)}
        </li>
      );
    }
    if (currentLine.startsWith('###')) {
      return (
        <h5 key={index} className="text-xs font-extrabold text-primary-550 dark:text-primary-400 mt-3 mb-1.5 uppercase tracking-wider">
          {parseInlineMarkdown(currentLine.substring(3).trim())}
        </h5>
      );
    }
    if (currentLine.startsWith('##')) {
      return (
        <h4 key={index} className="text-base font-black text-slate-900 dark:text-slate-100 mt-4 mb-2">
          {parseInlineMarkdown(currentLine.substring(2).trim())}
        </h4>
      );
    }
    if (currentLine.startsWith('#')) {
      return (
        <h3 key={index} className="text-lg font-black text-slate-900 dark:text-slate-100 mt-5 mb-2.5">
          {parseInlineMarkdown(currentLine.substring(1).trim())}
        </h3>
      );
    }
    if (currentLine.trim() === '') {
      return <div key={index} className="h-2" />;
    }
    return (
      <p key={index} className="mb-1 text-slate-800 dark:text-slate-200">
        {parseInlineMarkdown(currentLine)}
      </p>
    );
  });
};

const parseInlineMarkdown = (text) => {
  const boldRegex = /\*\*(.*?)\*\*/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-extrabold text-primary-600 dark:text-primary-450">
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

export default function HealthRecords() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);

  // Upload Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState(RECORD_CATEGORIES[1] || 'Blood Test');
  const [newDate, setNewDate] = useState('');
  const [uploadFile, setUploadFile] = useState(null);

  // AI report analyzer states
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [selectedRecordTitle, setSelectedRecordTitle] = useState('');

  const dispatch = useDispatch();
  const { records } = useSelector(state => state.health);

  useEffect(() => {
    dispatch(fetchHealthData());
  }, [dispatch]);

  const filtered = (records || []).filter(r => {
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.doctor && r.doctor.toLowerCase().includes(search.toLowerCase()));
    const matchCat = category === 'All' || r.category === category;
    return matchSearch && matchCat;
  });

  const statusVariant = { normal: 'success', abnormal: 'error', 'follow-up': 'warning' };

  const handleAnalyzeRecord = async (record) => {
    setSelectedRecordTitle(record.title);
    setShowAiAnalysis(true);
    setAnalysisLoading(true);
    setAnalysisText('');
    try {
      const data = await analyzeMedicalReport(record.title, record.category, record.url);
      setAnalysisText(data.analysis);
    } catch (err) {
      console.error(err);
      setAnalysisText("I apologize, but I am unable to analyze this report at the moment. Please try again later.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!newTitle || !newDate) return;

    try {
      if (uploadFile) {
        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('title', newTitle);
        formData.append('category', newCategory);
        formData.append('date', newDate);
        await dispatch(uploadMedicalRecord(formData)).unwrap();
      } else {
        await dispatch(uploadMedicalRecord({
          title: newTitle,
          type: newCategory === 'Imaging' ? 'Radiology' : 'Lab Report',
          date: newDate,
          doctor: 'Dr. Sarah Mitchell',
          hospital: 'City Heart Center',
          status: 'normal',
          category: newCategory,
          fileSize: '1.5 MB'
        })).unwrap();
      }

      setNewTitle('');
      setNewDate('');
      setUploadFile(null);
      setUploadOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (window.confirm("Are you sure you want to delete this medical record?")) {
      try {
        await dispatch(deleteMedicalRecord(recordId)).unwrap();
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Health Records</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{filtered.length} records on file</p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="btn-primary py-2.5 px-5"
        >
          <Upload className="w-4 h-4" />
          Upload Record
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Records', value: (records || []).length, color: 'text-primary-500' },
          { label: 'Normal', value: (records || []).filter(r => r.status === 'normal').length, color: 'text-green-500' },
          { label: 'Needs Attention', value: (records || []).filter(r => r.status !== 'normal').length, color: 'text-rose-500' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search records..."
            className="input-field pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {RECORD_CATEGORIES.slice(0, 5).map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${category === cat ? 'bg-primary-600 text-white' : 'glass-card text-slate-600 dark:text-slate-400'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline list */}
      <div className="relative space-y-4">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-white/10" />
        {filtered.map((record, i) => (
          <motion.div
            key={record.id || record._id || i}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            className="flex gap-4"
          >
            <div className="relative flex-shrink-0">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center z-10 relative ${record.status === 'normal' ? 'bg-green-500/20' : record.status === 'abnormal' ? 'bg-rose-500/20' : 'bg-amber-500/20'}`}>
                <FileText className={`w-5 h-5 ${record.status === 'normal' ? 'text-green-500' : record.status === 'abnormal' ? 'text-rose-500' : 'text-amber-500'}`} />
              </div>
            </div>
            <div className="glass-card flex-1 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{record.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <User className="w-3 h-3" /> {record.doctor}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Calendar className="w-3 h-3" /> {formatDate(record.date)}
                    </div>
                    <span className="text-xs text-slate-400">{record.fileSize}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[record.status] || 'info'} dot>{record.status}</Badge>
                  <button
                    onClick={() => handleAnalyzeRecord(record)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 dark:bg-primary-500/10 dark:hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 text-xs font-semibold transition-all"
                    title="Get AI Medical Summary"
                  >
                    <Sparkles className="w-3.5 h-3.5 animate-pulse text-primary-500" />
                    <span className="hidden sm:inline">AI Summary</span>
                  </button>
                  <button
                    onClick={() => setViewRecord(record)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteRecord(record.id || record._id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-450 transition-all"
                    title="Delete Record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Upload Modal */}
      <Modal isOpen={uploadOpen} onClose={() => { setUploadOpen(false); setUploadFile(null); }} title="Upload Health Record">
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div 
            onClick={() => document.getElementById('report-file-input').click()}
            className="border-2 border-dashed border-slate-200 dark:border-white/20 rounded-2xl p-8 text-center hover:border-primary-500 transition-colors cursor-pointer"
          >
            <input
              type="file"
              id="report-file-input"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) {
                  setUploadFile(f);
                  setNewTitle(f.name.replace(/\.[^/.]+$/, ""));
                }
              }}
            />
            <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
            <p className="font-semibold text-slate-700 dark:text-slate-355 font-bold">
              {uploadFile ? `Selected: ${uploadFile.name}` : 'Drop files here or click to upload'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {uploadFile ? `${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Supports PDF, JPG, PNG — max 20 MB'}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Record Title</label>
            <input 
              type="text" 
              placeholder="e.g., CBC Blood Test Report" 
              className="input-field" 
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Category</label>
              <select 
                className="input-field"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              >
                {RECORD_CATEGORIES.slice(1).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Date</label>
              <input 
                type="date" 
                className="input-field" 
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
              />
            </div>
          </div>
          <button 
            type="submit"
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            disabled={!newTitle || !newDate}
          >
            <Upload className="w-4 h-4" />
            Upload Record
          </button>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={!!viewRecord} onClose={() => setViewRecord(null)} title={viewRecord?.title || ''}>
        {viewRecord && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Type', viewRecord.type],
                ['Doctor', viewRecord.doctor],
                ['Hospital', viewRecord.hospital],
                ['Date', formatDate(viewRecord.date)],
                ['Category', viewRecord.category],
                ['File Size', viewRecord.fileSize],
              ].map(([k, v]) => (
                <div key={k} className="p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{k}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button className="btn-primary flex-1 py-2.5">
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-primary-500 hover:text-primary-500 transition-all font-semibold text-sm">
                  Share with Doctor
                </button>
              </div>
              <button 
                onClick={() => {
                  setViewRecord(null);
                  handleAnalyzeRecord(viewRecord);
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary-550 to-accent-550 bg-primary-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-glow-primary hover:opacity-95 transition-all"
              >
                <Sparkles className="w-4.5 h-4.5 text-white" />
                Doctor's AI Summary
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* AI Report Analysis Modal */}
      <Modal 
        isOpen={showAiAnalysis} 
        onClose={() => setShowAiAnalysis(false)} 
        title={`Doctor's AI Summary: ${selectedRecordTitle}`}
      >
        {analysisLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Analyzing medical markers with HealthAI...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-w-none text-sm leading-relaxed">
              <StructuredResponse text={analysisText} type="report" />
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex justify-end">
              <button
                onClick={() => setShowAiAnalysis(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-black font-semibold text-sm transition-all"
              >
                Close Summary
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
