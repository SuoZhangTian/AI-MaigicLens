
import React, { useState, useRef, useEffect } from 'react';
import { IconFileText, IconGlobe, IconDatabase, IconPlus } from './Icons';
import { SourceType, Partition } from '../types';

interface UploadManagerProps {
  onUpload: (files: File[], partitionId: string) => void;
  onLinkAdd: (url: string, partitionId: string) => void;
  partitions: Partition[];
  currentPartitionId: string;
}

export const UploadManager: React.FC<UploadManagerProps> = ({ onUpload, onLinkAdd, partitions, currentPartitionId }) => {
  const [activeTab, setActiveTab] = useState<'file' | 'link'>('file');
  const [url, setUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  const [selectedPartition, setSelectedPartition] = useState(
    currentPartitionId === 'all' ? 'uncategorized' : currentPartitionId
  );

  useEffect(() => {
    if (currentPartitionId !== 'all') {
      setSelectedPartition(currentPartitionId);
    }
  }, [currentPartitionId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadablePartitions = partitions.filter(p => p.id !== 'all');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      onUpload(files, selectedPartition);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onLinkAdd(url, selectedPartition);
      setUrl('');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(Array.from(e.dataTransfer.files), selectedPartition);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <label className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
          <IconDatabase className="w-3 h-3 mr-2" />
          目标存储分区
        </label>
        <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto no-scrollbar">
          {uploadablePartitions.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPartition(p.id)}
              className={`text-xs py-2.5 px-4 rounded-xl border text-left font-bold transition-all ${
                selectedPartition === p.id 
                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105 z-10' 
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex p-1.5 bg-slate-100 rounded-[18px]">
        <button
          onClick={() => setActiveTab('file')}
          className={`flex-1 flex items-center justify-center py-3 text-sm font-bold rounded-[14px] transition-all duration-300 ${
            activeTab === 'file' 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <IconFileText className="w-4 h-4 mr-2" />
          本地文档
        </button>
        <button
          onClick={() => setActiveTab('link')}
          className={`flex-1 flex items-center justify-center py-3 text-sm font-bold rounded-[14px] transition-all duration-300 ${
            activeTab === 'link' 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <IconGlobe className="w-4 h-4 mr-2" />
          网页链接
        </button>
      </div>

      <div className="min-h-[160px]">
        {activeTab === 'file' ? (
          <div 
            className={`border-2 border-dashed rounded-[32px] p-10 text-center transition-all cursor-pointer group relative overflow-hidden ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef}
              accept=".csv,.pdf,.txt"
              onChange={handleFileChange}
            />
            <div className={`w-14 h-14 bg-blue-100 text-blue-600 rounded-[20px] flex items-center justify-center mx-auto mb-5 transition-all shadow-inner ${isDragging ? 'scale-110 animate-pulse' : 'group-hover:scale-105'}`}>
              <IconFileText className="w-6 h-6" />
            </div>
            <p className="text-sm font-extrabold text-slate-900">
              {isDragging ? '在此松开文件' : '点击上传或直接拖拽文件'}
            </p>
            <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">支持 CSV、PDF、TXT</p>
          </div>
        ) : (
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="请输入网页地址，如 https://..."
                className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 transition-all outline-none bg-slate-50 text-sm"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl transition-all shadow-xl hover:bg-black active:scale-[0.98] flex items-center justify-center"
            >
              <IconPlus className="w-4 h-4 mr-2" />
              立即收录
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
