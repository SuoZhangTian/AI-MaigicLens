import React from 'react';

export enum SourceType {
  PDF = 'PDF',
  CSV = 'CSV',
  WEB = 'WEB',
  TEXT = 'TEXT'
}

export enum ProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface Partition {
  id: string;
  name: string;
  description?: string;
  isSystem?: boolean; // For 'All' or 'Uncategorized'
}

export interface KnowledgeSource {
  id: string;
  partitionId: string; // Link to a partition
  sequenceNumber: number; // For display numbering like #001
  name: string;
  type: SourceType;
  content: string; 
  url?: string;
  dateAdded: number; 
  size?: string;
  status: ProcessingStatus;
  summary?: string; 
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isThinking?: boolean;
}

export type ViewMode = 'library' | 'analysis';
