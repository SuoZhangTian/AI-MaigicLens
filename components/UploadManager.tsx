
import React, { useState, useRef, useEffect } from 'react';
import { IconFileText, IconGlobe } from './Icons';
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
  
  // 核心修复：使用 useEffect 确保 selectedPartition 随外部 state 同步
  const [selectedPartition, setSelectedPartition] = useState(
    currentPartitionId === 'all' ? 'uncategorized' : currentPartitionId
  );

  useEffect(() => {
    setSelectedPartition(currentPartitionId === 'all' ? 'uncategorized' : currentPartitionId);
  }, [currentPartitionId]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 过滤掉系统自带的“全部”分区，文件必须存入具体分类
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

  return (
    <div className="space-y-6">
      {/* 分区选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择存储分区
        </label>
        <select
          value={selectedPartition}
          onChange={(e) => setSelectedPartition(e.target.value)}
          className="w-full px-4 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all outline-none text-sm"
        >
          {uploadablePartitions.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* 标签页 */}
      <div className="flex p-1 bg-gray-100 rounded-lg">
        <button
          onClick={() => setActiveTab('file')}
          className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all duration-200 ${
            activeTab === 'file' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <IconFileText className="w-4 h-4 mr-2" />
          文件上传
        </button>
        <button
          onClick={() => setActiveTab('link')}
          className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all duration-200 ${
            activeTab === 'link' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <IconGlobe className="w-4 h-4 mr-2" />
          网页链接
        </button>
      </div>

      {/* 内容区域 */}
      <div className="min-h-[120px] flex flex-col justify-center">
        {activeTab === 'file' ? (
          <div 
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef}
              accept=".csv,.pdf,.txt"
              onChange={handleFileChange}
            />
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <IconFileText className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-gray-900">点击上传或拖拽文件</p>
            <p className="text-[10px] text-gray-400 mt-2 uppercase">支持 PDF、CSV、TXT</p>
          </div>
        ) : (
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/30 active:scale-[0.98]"
            >
              添加到当前库
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
