
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
  IconLens, 
  IconSend, 
  IconLoader, 
  IconTrash,
  IconSettings,
  IconFileText,
  IconEdit,
  IconCheck,
  IconDownload
} from './components/Icons';
import { Modal } from './components/Modal';
import { UploadManager } from './components/UploadManager';
import { AvatarGenerator } from './components/AvatarGenerator';
import { analyzeData, summarizeContent } from './services/geminiService';
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverPartitionId, setDragOverPartitionId] = useState<string | null>(null);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState(() => localStorage.getItem('avatar_name') || '数字分身');
  const [isEditingAvatarName, setIsEditingAvatarName] = useState(false);
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

  useEffect(() => {
    saveSourcesToDB(sources);
  }, [sources]);

  useEffect(() => {
    localStorage.setItem('kb_partitions', JSON.stringify(partitions));
  }, [partitions]);

  useEffect(() => {
    localStorage.setItem('avatar_name', avatarName);
  }, [avatarName]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const scrollHeight = scrollContainerRef.current.scrollHeight;
      scrollContainerRef.current.scrollTo({
        top: scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, isAnalyzing]);

  const filteredSources = useMemo(() => {
    return currentPartitionId === 'all' 
      ? sources 
      : sources.filter(s => s.partitionId === currentPartitionId);
  }, [sources, currentPartitionId]);

  const analysisSources = useMemo(() => {
    return sources.filter(s => selectedAnalysisPartitions.includes(s.partitionId));
  }, [sources, selectedAnalysisPartitions]);

  const processFiles = async (files: File[], partitionId: string) => {
    const targetPartition = partitionId === 'all' ? 'uncategorized' : partitionId;
    
    const newSources: KnowledgeSource[] = await Promise.all(files.map(async (file, index) => {
      const content = await file.text();
      const source: KnowledgeSource = {
        id: Math.random().toString(36).substr(2, 9),
        partitionId: targetPartition,
        sequenceNumber: sources.length + index + 1,
        name: file.name,
        type: file.name.endsWith('.pdf') ? SourceType.PDF : file.name.endsWith('.csv') ? SourceType.CSV : SourceType.TEXT,
        content,
        dateAdded: Date.now(),
        status: ProcessingStatus.COMPLETED,
        size: `${(file.size / 1024).toFixed(1)} KB`
      };
      
      summarizeContent(content, source.type).then(summary => {
        setSources(prev => prev.map(s => s.id === source.id ? { ...s, summary } : s));
      });

      return source;
    }));

    setSources(prev => [...prev, ...newSources]);
    setIsUploadOpen(false);
    setViewMode('library');
  };

  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.getData('internal-source-id')) return;
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0) {
      await processFiles(files, currentPartitionId);
    }
  };

  const handlePartitionDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPartitionId(id);
  };

  const handlePartitionDrop = async (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPartitionId(null);
    setIsDragging(false);
    
    const internalSourceId = e.dataTransfer.getData('internal-source-id');
    if (internalSourceId) {
      const targetId = id === 'all' ? 'uncategorized' : id;
      setSources(prev => prev.map(s => 
        s.id === internalSourceId ? { ...s, partitionId: targetId } : s
      ));
      return;
    }
    
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0) {
      await processFiles(files, id);
      setCurrentPartitionId(id);
    }
  };

  const toggleAnalysisPartition = (id: string) => {
    if (id === 'all') {
      const allSelectable = partitions.filter(p => !p.isSystem || p.id !== 'all').map(p => p.id);
      setSelectedAnalysisPartitions(prev => 
        prev.length === allSelectable.length ? [] : allSelectable
      );
      return;
    }
    setSelectedAnalysisPartitions(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handlePartitionClick = (id: string) => {
    if (viewMode === 'analysis') {
      toggleAnalysisPartition(id);
    } else {
      setCurrentPartitionId(id);
    }
  };

  const handleSendMessage = async () => {
    if (!query.trim() || isAnalyzing) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: query,
      timestamp: Date.now()
    };

    setChatHistory(prev => [...prev, userMessage]);
    setQuery('');
    setIsAnalyzing(true);

    try {
      const result = await analyzeData(query, chatHistory, analysisSources);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: result,
        timestamp: Date.now()
      };
      setChatHistory(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Analysis Failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addPartition = () => {
    const name = window.prompt("请输入新分区名称:");
    if (name && name.trim()) {
      const newPart: Partition = {
        id: Math.random().toString(36).substr(2, 9),
        name: name.trim(),
        description: '用户自定义分区'
      };
      setPartitions(prev => [...prev, newPart]);
    }
  };

  // 自定义 Markdown 渲染组件，为表格添加下载按钮
  const MarkdownComponents = {
    table: (props: any) => {
      const [tableContent, setTableContent] = useState('');
      const tableRef = useRef<HTMLTableElement>(null);

      useEffect(() => {
        if (tableRef.current) {
          const rows = Array.from(tableRef.current.querySelectorAll('tr'));
          const csv = rows.map((r) => {
            const cells = Array.from((r as Element).querySelectorAll('th, td'));
            return cells.map((c) => {
              let text = (c as Element).textContent?.trim() || '';
              if (text.includes(',')) text = `"${text.replace(/"/g, '""')}"`;
              return text;
            }).join(',');
          }).join('\n');
          setTableContent(csv);
        }
      }, []);

      const triggerDownload = () => {
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + tableContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `智擎数据导出_${new Date().getTime()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };

      return (
        <div className="relative group/table mb-6">
          <button 
            onClick={triggerDownload}
            className="absolute -top-3 -right-3 z-10 p-2.5 bg-white rounded-full shadow-xl border border-slate-100 text-blue-600 opacity-0 group-hover/table:opacity-100 transition-all hover:scale-110 active:scale-95 flex items-center justify-center"
            title="导出 CSV (Excel 友好)"
          >
            <IconDownload className="w-4 h-4" />
          </button>
          <div className="overflow-x-auto rounded-2xl shadow-sm border border-slate-100 bg-white">
            <table ref={tableRef} {...props} />
          </div>
        </div>
      );
    }
  };

  return (
    <div 
      className="h-screen w-full bg-slate-50 flex text-slate-900 overflow-hidden relative"
      onDragOver={handleGlobalDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleGlobalDrop}
    >
      {isDragging && !dragOverPartitionId && (
        <div className="absolute inset-0 z-[100] bg-blue-600/10 backdrop-blur-sm border-4 border-dashed border-blue-500 flex items-center justify-center pointer-events-none">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center scale-110 transition-transform">
            <IconFileText className="w-16 h-16 text-blue-500 mb-4 animate-bounce" />
            <p className="text-xl font-bold text-blue-600">释放以导入至知识库</p>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-full">
        <div className="p-6 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center mb-8 cursor-pointer group shrink-0" onClick={() => setViewMode('library')}>
            <span className="font-bold text-xl tracking-tight text-slate-900">AI知识库工具</span>
          </div>

          <nav className="space-y-1 mb-8 shrink-0">
            <button 
              onClick={() => setViewMode('library')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'library' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <IconDatabase className="w-4 h-4" />
              <span>知识库</span>
            </button>
            <button 
              onClick={() => setViewMode('analysis')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'analysis' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <IconChat className="w-4 h-4" />
              <span>深度分析</span>
            </button>
          </nav>

          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-3 mb-2 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {viewMode === 'analysis' ? '检索范围' : '分区管理'}
              </span>
              {viewMode === 'library' && (
                <button 
                  onClick={addPartition} 
                  className="text-slate-400 hover:text-blue-600 transition-all p-1.5 hover:bg-blue-50 rounded-md active:scale-90"
                >
                  <IconPlus className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="space-y-1 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {partitions.map(p => {
                const isActive = viewMode === 'library' ? currentPartitionId === p.id : selectedAnalysisPartitions.includes(p.id);
                const isDraggingOver = dragOverPartitionId === p.id;

                return (
                  <div 
                    key={p.id} 
                    onDragOver={(e) => handlePartitionDragOver(e, p.id)}
                    onDragLeave={() => setDragOverPartitionId(null)}
                    onDrop={(e) => handlePartitionDrop(e, p.id)}
                    className={`group/item flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer border-2 ${
                      isDraggingOver 
                        ? 'border-blue-500 bg-blue-50 scale-105 shadow-lg z-10' 
                        : 'border-transparent'
                    } ${
                      isActive 
                        ? (viewMode === 'analysis' ? 'bg-blue-50 text-blue-700 border-transparent' : 'bg-slate-100 font-semibold text-blue-600 border-transparent') 
                        : 'text-slate-500 hover:bg-slate-50 border-transparent'
                    }`}
                    onClick={() => handlePartitionClick(p.id)}
                  >
                    <div className="flex items-center space-x-3 truncate pointer-events-none">
                      {viewMode === 'analysis' && p.id !== 'all' ? (
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedAnalysisPartitions.includes(p.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {selectedAnalysisPartitions.includes(p.id) && <IconCheck className="w-3 h-3 text-white" />}
                        </div>
                      ) : (
                        <IconFolder className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-500' : 'text-slate-400'}`} />
                      )}
                      <span className="truncate">{p.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100">
          <div className="flex items-center space-x-3 w-full group relative">
            <button 
              onClick={() => setIsAvatarOpen(true)}
              className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm hover:border-blue-200 transition-all shrink-0"
            >
              {currentAvatar ? <img src={currentAvatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><IconSettings className="w-5 h-5" /></div>}
            </button>
            <div className="text-left flex-1 min-w-0">
              {isEditingAvatarName ? (
                <input 
                  autoFocus
                  className="text-sm font-bold w-full bg-slate-50 border-b border-blue-500 outline-none"
                  value={avatarName}
                  onChange={(e) => setAvatarName(e.target.value)}
                  onBlur={() => setIsEditingAvatarName(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingAvatarName(false)}
                />
              ) : (
                <div className="flex items-center group/name">
                  <p className="text-sm font-bold truncate flex-1">{avatarName}</p>
                  <button 
                    onClick={() => setIsEditingAvatarName(true)}
                    className="opacity-0 group-hover/name:opacity-100 p-1 hover:text-blue-600 transition-all"
                  >
                    <IconEdit className="w-3 h-3" />
                  </button>
                </div>
              )}
              <p className="text-[10px] text-slate-400">Gemini 3.0 Pro</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-white relative overflow-hidden">
        {viewMode === 'library' ? (
          <div className="flex-1 overflow-y-auto p-8">
            <header className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold">{partitions.find(p => p.id === currentPartitionId)?.name}</h1>
                <p className="text-sm text-slate-500">共 {filteredSources.length} 个知识来源</p>
              </div>
              <button 
                onClick={() => setIsUploadOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center space-x-2 shadow-lg shadow-blue-200 active:scale-95 transition-all"
              >
                <IconPlus className="w-4 h-4" />
                <span>添加内容</span>
              </button>
            </header>

            {filteredSources.length === 0 ? (
              <div className="h-[60vh] border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400">
                <IconFileText className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-medium">当前分区暂无内容</p>
                <p className="text-xs mt-1">拖拽文件到左侧分区或此处开始</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSources.map(source => (
                  <div 
                    key={source.id} 
                    draggable 
                    onDragStart={(e) => {
                      e.dataTransfer.setData('internal-source-id', source.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative cursor-grab active:cursor-grabbing"
                  >
                    <button onClick={() => setSources(prev => prev.filter(s => s.id !== source.id))} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                      <IconTrash className="w-4 h-4" />
                    </button>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${source.type === SourceType.CSV ? 'bg-green-50 text-green-600' : source.type === SourceType.PDF ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                      <IconDatabase className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-sm truncate mb-1">{source.name}</h3>
                    <p className="text-[10px] text-slate-400 mb-3">{source.size} • {new Date(source.dateAdded).toLocaleDateString()}</p>
                    <div className="bg-slate-50 p-3 rounded-lg"><p className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed">{source.summary || "生成摘要中..."}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
            <div className="px-8 py-4 bg-white border-b border-slate-100 flex items-center justify-between overflow-x-auto whitespace-nowrap">
              <div className="flex items-center space-x-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0">当前分析范围:</span>
                <div className="flex items-center space-x-2">
                  {selectedAnalysisPartitions.length === 0 ? (
                    <span className="text-xs text-red-500 font-medium">请在左侧勾选分区</span>
                  ) : (
                    partitions.filter(p => selectedAnalysisPartitions.includes(p.id)).map(p => (
                      <div key={p.id} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        <span>{p.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-medium ml-4">
                已联动 {analysisSources.length} 个知识来源
              </span>
            </div>

            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-8 space-y-6 bg-[#FAFBFC]"
            >
              {chatHistory.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 animate-pulse">
                    <IconChat className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">深度数据分析</h2>
                  <p className="text-sm max-w-xs mt-2 text-slate-500">基于左侧勾选分区的全量数据进行参数检索与逻辑推演</p>
                </div>
              )}
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                  <div className={`max-w-[92%] p-5 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 border border-slate-100'}`}>
                    <div className="markdown-container prose prose-slate prose-sm max-w-none">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={MarkdownComponents}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                    <p className={`text-[9px] mt-3 ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {isAnalyzing && (
                <div className="flex items-center space-x-3 text-xs text-blue-600 font-bold bg-white w-fit px-5 py-3 rounded-full border border-blue-50 shadow-sm animate-pulse">
                  <IconLoader className="w-4 h-4" /> 
                  <span>正在扫描勾选分区中的 {analysisSources.length} 个文件...</span>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
              <div className="max-w-4xl mx-auto relative">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="询问车型对比、销量分析... (Ctrl + Enter 发送)"
                  rows={1}
                  className="w-full bg-slate-100 border-none rounded-2xl px-6 py-4 pr-16 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none resize-none min-h-[56px] max-h-32 text-sm"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isAnalyzing || !query.trim() || analysisSources.length === 0}
                  className="absolute right-2 bottom-2 w-10 h-10 bg-blue-600 text-white rounded-xl disabled:opacity-30 transition-all active:scale-95 flex items-center justify-center shadow-lg shadow-blue-200"
                >
                  <IconSend className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} title="添加知识来源">
        <UploadManager 
          onUpload={processFiles} 
          onLinkAdd={(url, pid) => {
             const ns: KnowledgeSource = { 
               id: Math.random().toString(36).substr(2,9), 
               partitionId: pid, 
               sequenceNumber: sources.length+1, 
               name: new URL(url).hostname, 
               type: SourceType.WEB, 
               content: `Content from ${url}`, 
               url, 
               dateAdded: Date.now(), 
               status: ProcessingStatus.COMPLETED, 
               size: 'WEB' 
             };
             setSources(p => [...p, ns]);
             setIsUploadOpen(false);
             setViewMode('library');
          }} 
          partitions={partitions} 
          currentPartitionId={currentPartitionId}
        />
      </Modal>

      <Modal isOpen={isAvatarOpen} onClose={() => setIsAvatarOpen(false)} title={`${avatarName} 定制`}>
        <AvatarGenerator currentAvatar={currentAvatar} onAvatarSet={(url) => { setCurrentAvatar(url); localStorage.setItem('user_avatar', url); setIsAvatarOpen(false); }} />
      </Modal>
    </div>
  );
};

export default App;
