
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  ViewMode, 
  KnowledgeSource, 
  Partition, 
  ChatMessage, 
  SourceType, 
  ProcessingStatus 
} from './types';
import { 
  IconPlus, 
  IconDatabase, 
  IconFolder, 
  IconChat, 
  IconSend, 
  IconLoader, 
  IconTrash,
  IconSettings,
  IconFileText,
  IconCheck,
  IconDownload,
  IconSparkles
} from './components/Icons';
import { Modal } from './components/Modal';
import { UploadManager } from './components/UploadManager';
import { AvatarGenerator } from './components/AvatarGenerator';
import { analyzeData, extractTextFromDocument } from './services/geminiService';
import { saveSourcesToDB, getSourcesFromDB } from './services/storageService';

const INITIAL_PARTITIONS: Partition[] = [
  { id: 'all', name: '全部内容', isSystem: true },
  { id: 'config', name: '配置', description: '车型参数对比' },
  { id: 'sales', name: '销量', description: '市场表现数据' },
  { id: 'reports', name: '报告', description: '行业深度报告' },
  { id: 'uncategorized', name: '未分类', isSystem: true },
];

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [partitions, setPartitions] = useState<Partition[]>(() => {
    const saved = localStorage.getItem('kb_partitions');
    return saved ? JSON.parse(saved) : INITIAL_PARTITIONS;
  });

  const [currentPartitionId, setCurrentPartitionId] = useState('all');
  const [selectedAnalysisPartitions, setSelectedAnalysisPartitions] = useState<string[]>(['config', 'sales', 'reports']);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // 深度拖拽状态
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDraggingInternal, setIsDraggingInternal] = useState(false);
  const [dragOverPartitionId, setDragOverPartitionId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState(() => localStorage.getItem('avatar_name') || '智擎所长');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      const savedSources = await getSourcesFromDB();
      if (savedSources) setSources(savedSources);
      const savedAvatar = localStorage.getItem('user_avatar');
      if (savedAvatar) setCurrentAvatar(savedAvatar);
    };
    loadData();
  }, []);

  useEffect(() => { saveSourcesToDB(sources); }, [sources]);
  useEffect(() => { localStorage.setItem('kb_partitions', JSON.stringify(partitions)); }, [partitions]);
  useEffect(() => { localStorage.setItem('avatar_name', avatarName); }, [avatarName]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, isAnalyzing]);

  const filteredSources = useMemo(() => {
    return currentPartitionId === 'all' ? sources : sources.filter(s => s.partitionId === currentPartitionId);
  }, [sources, currentPartitionId]);

  const analysisSources = useMemo(() => {
    return sources.filter(s => selectedAnalysisPartitions.includes(s.partitionId));
  }, [sources, selectedAnalysisPartitions]);

  const processFiles = async (files: File[], partitionId: string) => {
    const targetPartition = (partitionId === 'all' || !partitionId) ? 'uncategorized' : partitionId;
    
    const filePlaceholders = files.map((file, index) => ({
      id: Math.random().toString(36).substr(2, 9),
      partitionId: targetPartition,
      sequenceNumber: sources.length + index + 1,
      name: file.name,
      type: file.name.toLowerCase().endsWith('.pdf') ? SourceType.PDF : file.name.endsWith('.csv') ? SourceType.CSV : SourceType.TEXT,
      content: "",
      dateAdded: Date.now(),
      status: ProcessingStatus.PROCESSING,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      summary: "正在应用数据主权协议并锚定坐标..."
    }));

    setSources(prev => [...prev, ...filePlaceholders]);

    filePlaceholders.forEach(async (placeholder, index) => {
      const file = files[index];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = (e.target?.result as string).split(',')[1];
        const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
        try {
          const { text, summary } = await extractTextFromDocument(base64Data, mimeType, file.name);
          setSources(prev => prev.map(s => s.id === placeholder.id ? { 
            ...s, content: text, summary: summary, status: ProcessingStatus.COMPLETED 
          } : s));
        } catch (err) {
          setSources(prev => prev.map(s => s.id === placeholder.id ? { 
            ...s, summary: "挂载失败，请检查文件编码", status: ProcessingStatus.ERROR 
          } : s));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // 全局拖拽拦截逻辑
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingFile(false);
      setIsDraggingInternal(false);
      setDragOverPartitionId(null);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isFile = e.dataTransfer.files.length > 0;
    
    setIsDraggingFile(false);
    setIsDraggingInternal(false);
    setDragOverPartitionId(null);
    dragCounter.current = 0;
    
    if (isFile) {
      const files = Array.from(e.dataTransfer.files) as File[];
      await processFiles(files, currentPartitionId);
    }
  };

  // 内部卡片拖拽开始 - 关键重构：自定义拖拽预览图
  const handleInternalDragStart = (e: React.DragEvent, source: KnowledgeSource) => {
    e.dataTransfer.setData('sourceId', source.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDraggingInternal(true);

    // 创建临时的“胶囊行”作为预览图
    const dragGhost = document.createElement('div');
    dragGhost.style.position = 'absolute';
    dragGhost.style.top = '-1000px';
    dragGhost.style.zIndex = '-1';
    dragGhost.innerHTML = `
      <div style="
        background: white;
        padding: 10px 20px;
        border-radius: 9999px;
        border: 2px solid #3b82f6;
        box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.3);
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: sans-serif;
        pointer-events: none;
      ">
        <svg style="width:18px; height:18px; color:#2563eb" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span style="font-size: 14px; font-weight: 700; color: #1e293b; white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">
          ${source.name}
        </span>
      </div>
    `;
    document.body.appendChild(dragGhost);
    
    // 设置预览图中心位置
    e.dataTransfer.setDragImage(dragGhost, 20, 20);

    // 下一帧移除辅助元素
    setTimeout(() => {
      if (dragGhost.parentNode) {
        document.body.removeChild(dragGhost);
      }
    }, 0);
  };

  const handleSendMessage = async () => {
    if (!query.trim() || isAnalyzing) return;
    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', text: query, timestamp: Date.now() };
    setChatHistory(prev => [...prev, userMessage]);
    setQuery('');
    setIsAnalyzing(true);
    try {
      const result = await analyzeData(query, chatHistory, analysisSources);
      const aiMessage: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: result, timestamp: Date.now() };
      setChatHistory(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Analysis Failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const MarkdownComponents = {
    table: (props: any) => {
      const [tableContent, setTableContent] = useState('');
      const tableRef = useRef<HTMLTableElement>(null);
      useEffect(() => {
        if (tableRef.current) {
          const rows = Array.from(tableRef.current.querySelectorAll('tr')) as HTMLTableRowElement[];
          const csv = rows.map(r => Array.from(r.querySelectorAll('th, td')).map(c => `"${c.textContent?.trim().replace(/"/g, '""')}"`).join(',')).join('\n');
          setTableContent(csv);
        }
      }, []);
      const download = () => {
        const blob = new Blob(['\uFEFF' + tableContent], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `分析导出_${Date.now()}.csv`;
        link.click();
      };
      return (
        <div className="relative group/table mb-6">
          <button onClick={download} className="absolute -top-3 -right-3 z-10 p-2 bg-white rounded-full shadow-lg border border-slate-100 text-blue-600 opacity-0 group-hover/table:opacity-100 hover:scale-110 transition-all flex items-center justify-center"><IconDownload className="w-4 h-4" /></button>
          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white"><table ref={tableRef} {...props} /></div>
        </div>
      );
    }
  };

  return (
    <div 
      className={`h-screen w-full bg-slate-50 flex text-slate-900 overflow-hidden relative selection:bg-blue-100 transition-all duration-500 ${isDraggingFile ? 'ring-8 ring-blue-500/10 ring-inset' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 灵动提示标签 */}
      {(isDraggingFile || isDraggingInternal) && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 duration-500 pointer-events-none">
           <div className="bg-white/90 backdrop-blur-xl border border-blue-200 px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 ring-1 ring-black/5">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
               <IconSparkles className="w-4 h-4 animate-spin-slow" />
             </div>
             <div className="flex flex-col">
               <span className="text-sm font-bold text-slate-900">{isDraggingInternal ? '正在调整分类...' : '释放文件以录入'}</span>
               <span className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">{isDraggingInternal ? '拖拽至左侧分区即可移动' : '地毯式扫描已就绪'}</span>
             </div>
           </div>
        </div>
      )}

      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-full relative z-[60]">
        <div className="p-6 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center mb-10 shrink-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white mr-3 shadow-lg shadow-blue-200"><IconDatabase className="w-5 h-5" /></div>
            <span className="font-bold text-lg tracking-tight">所长的知识宝</span>
          </div>
          
          <nav className="space-y-1 mb-8 shrink-0">
            <button onClick={() => setViewMode('library')} className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${viewMode === 'library' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}><IconDatabase className="w-4 h-4" /><span>知识库</span></button>
            <button onClick={() => setViewMode('analysis')} className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${viewMode === 'analysis' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}><IconChat className="w-4 h-4" /><span>深度分析</span></button>
          </nav>

          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-3 mb-3 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {viewMode === 'analysis' ? '分析检索范围' : '分区列表'}
              </span>
              <button onClick={(e) => { e.stopPropagation(); const n = prompt("新分区名称:"); n && setPartitions(p => [...p, { id: Math.random().toString(36).substr(2,9), name: n.trim() }]); }} className="text-slate-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded-md transition-colors"><IconPlus className="w-4 h-4" /></button>
            </div>
            
            <div className="space-y-1 overflow-y-auto pr-1 flex-1 custom-scrollbar">
              {partitions.map(p => {
                const isActive = viewMode === 'library' ? currentPartitionId === p.id : selectedAnalysisPartitions.includes(p.id);
                const isOver = dragOverPartitionId === p.id;
                
                return (
                  <div 
                    key={p.id} 
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragOverPartitionId !== p.id) setDragOverPartitionId(p.id);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverPartitionId(p.id);
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverPartitionId(null);
                      setIsDraggingFile(false);
                      setIsDraggingInternal(false);
                      dragCounter.current = 0;
                      
                      const internalId = e.dataTransfer.getData('sourceId');
                      if (internalId && p.id !== 'all') {
                        setSources(prev => prev.map(s => s.id === internalId ? { ...s, partitionId: p.id } : s));
                        setCurrentPartitionId(p.id);
                        return;
                      }

                      const files = Array.from(e.dataTransfer.files) as File[];
                      if (files.length > 0) {
                        await processFiles(files, p.id);
                        if (viewMode === 'library') setCurrentPartitionId(p.id);
                      }
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      if (viewMode === 'library') setCurrentPartitionId(p.id);
                      else {
                        if (p.id === 'all') return;
                        setSelectedAnalysisPartitions(prev => prev.includes(p.id) ? prev.filter(i => i !== p.id) : [...prev, p.id]);
                      }
                    }}
                    className={`group/part flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer border-2 transition-all duration-200 relative ${
                      isOver 
                        ? 'border-blue-500 bg-blue-50 scale-105 z-20 shadow-xl ring-4 ring-blue-500/10' 
                        : 'border-transparent'
                    } ${
                      isActive 
                        ? (viewMode === 'analysis' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-100 font-bold text-blue-700') 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {isOver && (
                      <div className="absolute -left-2 top-0 bottom-0 w-1.5 bg-blue-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
                    )}
                    {viewMode === 'analysis' && p.id !== 'all' ? (
                      <div className={`w-4 h-4 rounded-md border-2 transition-colors ${selectedAnalysisPartitions.includes(p.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {selectedAnalysisPartitions.includes(p.id) && <IconCheck className="w-3 h-3 text-white m-auto" />}
                      </div>
                    ) : (
                      <IconFolder className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-slate-400'}`} />
                    )}
                    <span className="truncate flex-1">{p.name}</span>
                    {isOver && <IconDownload className="w-3 h-3 text-blue-600 animate-bounce" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100">
          <button onClick={() => setIsAvatarOpen(true)} className="flex items-center space-x-3 w-full p-2 rounded-2xl hover:bg-slate-50 transition-all text-left group">
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0 shadow-inner group-hover:ring-2 group-hover:ring-blue-500/20 transition-all">
              {currentAvatar ? <img src={currentAvatar} className="w-full h-full object-cover" /> : <IconSettings className="m-auto mt-2.5 w-5 h-5 text-slate-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate text-slate-900 group-hover:text-blue-600 transition-colors">{avatarName}</p>
              <p className="text-[10px] text-blue-600 font-medium">Gemini 3 Pro Engine</p>
            </div>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-white overflow-hidden relative z-50">
        {viewMode === 'library' ? (
          <div className="flex-1 overflow-y-auto p-8 relative">
            <header className="flex justify-between items-end mb-10">
              <div>
                <nav className="flex items-center space-x-2 text-xs text-slate-400 mb-1"><span>知识库</span><span>/</span><span className="text-slate-600 font-bold">{partitions.find(p => p.id === currentPartitionId)?.name}</span></nav>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">资料中心</h1>
              </div>
              <button onClick={() => setIsUploadOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl text-sm font-bold flex items-center space-x-2 shadow-xl shadow-blue-100 transition-all active:scale-95"><IconPlus className="w-4 h-4" /><span>导入资料</span></button>
            </header>

            {/* 灵动局部反馈 */}
            {(isDraggingFile || isDraggingInternal) && !dragOverPartitionId && (
              <div className="absolute inset-4 z-40 pointer-events-none animate-in fade-in duration-700">
                <div className={`w-full h-full border-2 border-dashed rounded-[40px] shadow-[inset_0_0_80px_rgba(59,130,246,0.05)] ${isDraggingInternal ? 'border-slate-300 bg-slate-50/10' : 'border-blue-400/20 bg-blue-50/5'}`} />
              </div>
            )}

            {filteredSources.length === 0 ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[32px] bg-slate-50/50">
                <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-6"><IconFileText className="w-10 h-10 text-slate-200" /></div>
                <p className="text-sm font-bold">暂无内容，请导入资料或直接拖拽文件</p>
                <p className="text-xs mt-2 text-blue-500 font-medium">已启用「数据主权协议」，支持文件胶囊跨分区平滑移动</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                {filteredSources.map(source => (
                  <div 
                    key={source.id} 
                    draggable="true"
                    onDragStart={(e) => handleInternalDragStart(e, source)}
                    className="bg-white p-6 rounded-[24px] border border-slate-200 group relative hover:shadow-2xl hover:shadow-slate-200/50 transition-all hover:-translate-y-1 cursor-grab active:cursor-grabbing"
                  >
                    <button onClick={(e) => { e.stopPropagation(); setSources(prev => prev.filter(s => s.id !== source.id)); }} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 p-2 transition-all"><IconTrash className="w-4 h-4" /></button>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${source.status === ProcessingStatus.PROCESSING ? 'bg-blue-50 animate-pulse' : source.status === ProcessingStatus.ERROR ? 'bg-red-50 text-red-600' : source.type === SourceType.CSV ? 'bg-blue-50 text-blue-600' : source.type === SourceType.PDF ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      {source.status === ProcessingStatus.PROCESSING ? <IconLoader className="w-6 h-6 text-blue-500" /> : <IconFileText className="w-6 h-6" />}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 truncate mb-1">{source.name}</h3>
                    <p className="text-[10px] text-slate-400 font-medium mb-4 uppercase tracking-tighter">{source.size} • {new Date(source.dateAdded).toLocaleDateString()}</p>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 min-h-[80px]">
                      <p className="text-[11px] text-slate-600 line-clamp-4 leading-relaxed font-mono">{source.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full bg-slate-50/30">
            <div className="px-8 py-4 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-3 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">当前分析范围:</span>
                <div className="flex space-x-1.5">
                  {selectedAnalysisPartitions.length === 0 ? (
                    <span className="text-xs text-red-400 font-medium">请在左侧勾选分区...</span>
                  ) : (
                    selectedAnalysisPartitions.map(id => <span key={id} className="px-3 py-1 bg-blue-50 text-blue-700 text-[10px] rounded-full font-bold border border-blue-100 shrink-0">{partitions.find(p => p.id === id)?.name}</span>)
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1.5 rounded-full">
                <IconCheck className="w-3 h-3 text-blue-600" />
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">原子化坐标检索已开启</span>
              </div>
            </div>
            
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {chatHistory.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto opacity-40">
                  <div className="w-20 h-20 bg-blue-100 rounded-[32px] flex items-center justify-center mb-6 text-blue-600 animate-pulse"><IconChat className="w-10 h-10" /></div>
                  <h2 className="text-xl font-extrabold text-slate-900 mb-2">高精度分析引擎</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">系统已实施「数据主权协议」。您可以询问任何复杂的车型销量对比、配置穿透分析，AI 将 100% 忠实于您的原始 CSV 数据，并按行号进行地毯式扫描。</p>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[85%] p-6 rounded-[28px] shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white shadow-blue-100' : 'bg-white border border-slate-100 text-slate-800'}`}>
                    <div className="markdown-container prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isAnalyzing && (
                <div className="flex items-center space-x-3 text-xs text-blue-600 font-bold bg-white px-5 py-3 rounded-full shadow-sm w-fit border border-blue-50 animate-pulse">
                  <IconLoader className="w-4 h-4" />
                  <span>Gemini 3 Pro 执行数据主权检索中...</span>
                </div>
              )}
            </div>

            <div className="p-8 bg-white border-t border-slate-100 relative">
              <div className="max-w-4xl mx-auto relative group">
                <textarea value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => (e.ctrlKey && e.key === 'Enter') && handleSendMessage()} placeholder="输入指令对数据进行坐标式检索... (Ctrl+Enter 发送)" className="w-full bg-slate-100 border-none rounded-[24px] px-8 py-5 pr-16 outline-none text-sm min-h-[64px] max-h-40 resize-none focus:ring-2 focus:ring-blue-500/10 transition-all shadow-inner" />
                <button onClick={handleSendMessage} disabled={isAnalyzing || !query.trim()} className="absolute right-3 bottom-3 w-12 h-12 bg-blue-600 text-white rounded-[18px] shadow-xl shadow-blue-200 flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 hover:bg-blue-700"><IconSend className="w-6 h-6" /></button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} title="导入文档资料">
        <UploadManager onUpload={(files, pid) => { processFiles(files, pid); setIsUploadOpen(false); }} onLinkAdd={(u, p) => setSources(prev => [...prev, { id: Math.random().toString(36).substr(2,9), partitionId: p, sequenceNumber: prev.length+1, name: u, type: SourceType.WEB, content: "链接内容收录", dateAdded: Date.now(), status: ProcessingStatus.COMPLETED, size: 'WEB', summary: "网页链接已入库，等待深度索引" }])} partitions={partitions} currentPartitionId={currentPartitionId} />
      </Modal>

      <Modal isOpen={isAvatarOpen} onClose={() => setIsAvatarOpen(false)} title="数字分身实验室"><AvatarGenerator currentAvatar={currentAvatar} onAvatarSet={u => { setCurrentAvatar(u); localStorage.setItem('user_avatar', u); setIsAvatarOpen(false); }} /></Modal>
    </div>
  );
};

export default App;
