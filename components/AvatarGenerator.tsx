
import React, { useState, useRef, useEffect } from 'react';
import { IconCamera, IconMagic, IconLoader, IconCheck, IconSettings, IconSparkles, IconDownload } from './Icons';
import { generateAvatar } from '../services/geminiService';

interface AvatarGeneratorProps {
  onAvatarSet: (avatarUrl: string) => void;
  currentAvatar: string | null;
}

const STYLES = [
  { id: 'automotive-tech', name: '极简科技感', prompt: 'Clean, professional headshot in automotive R&D lab setting, futuristic lighting, high contrast, minimal colors, tech executive portrait' },
  { id: 'cyberpunk', name: '赛博朋克', prompt: 'Cyberpunk style, neon lights, futuristic car background, digital art, high resolution, detailed' },
  { id: '3d-clay', name: '3D 粘土风', prompt: 'Cute 3D character design, claymation style, soft studio lighting, professional attire' },
  { id: 'sketch', name: '产品手绘图', prompt: 'Industrial design sketch, automotive designer pencil style, artistic shading, draft lines visible' },
  { id: 'pixel', name: '8Bit 像素', prompt: 'High quality 8-bit pixel art, gaming aesthetic, vibrant, clean profile' }
];

export const AvatarGenerator: React.FC<AvatarGeneratorProps> = ({ onAvatarSet, currentAvatar }) => {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>(STYLES[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleOpenKey = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setSourceImage(event.target?.result as string);
        setGeneratedImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!sourceImage || !hasApiKey) return;
    
    setIsGenerating(true);
    try {
      const stylePrompt = STYLES.find(s => s.id === selectedStyle)?.prompt || '';
      const result = await generateAvatar(sourceImage, stylePrompt);
      if (result) {
        setGeneratedImage(result);
      } else {
        alert("生成失败，请确认参考图清晰度或重试。");
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("Entity not found")) {
        setHasApiKey(false); 
        alert("API Key 权限不足，请重新授权付费项目。");
      } else {
        alert("AI 生成遇到技术障碍，请稍后再试。");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `Avatar_${selectedStyle}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-[550px]">
      <div className="grid grid-cols-2 gap-8 h-full">
        <div className="flex flex-col space-y-5 border-r border-gray-100 pr-8">
           {!hasApiKey ? (
             <div className="flex-1 flex flex-col items-center justify-center p-6 bg-amber-50 rounded-2xl border border-amber-100 text-center">
                <IconSettings className="w-12 h-12 text-amber-500 mb-4" />
                <h4 className="font-bold text-amber-900 mb-2">启用 Gemini 3.0 Pro Image</h4>
                <p className="text-xs text-amber-700 leading-relaxed mb-6">
                  生成专业头像需要调用最新的 3.0 模型。请确保已选择具有结算权限的 API Key。
                </p>
                <button 
                  onClick={handleOpenKey}
                  className="px-6 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 hover:bg-amber-700 transition-all"
                >
                  去授权 API Key
                </button>
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="mt-4 text-[10px] text-amber-600 underline">查看计费说明</a>
             </div>
           ) : (
             <>
                <div 
                  className="relative group h-44 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all overflow-hidden"
                  onClick={() => fileInputRef.current?.click()}
                >
                    {sourceImage ? (
                      <img src={sourceImage} alt="Source" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                    ) : (
                      <div className="flex flex-col items-center text-gray-400">
                          <IconCamera className="w-8 h-8 mb-2" />
                          <span className="text-xs font-bold">上传本人照片作为蓝本</span>
                      </div>
                    )}
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                </div>

                <div className="flex-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block">选择职业视觉风格</label>
                    <div className="grid grid-cols-2 gap-2">
                        {STYLES.map(style => (
                          <button
                              key={style.id}
                              onClick={() => setSelectedStyle(style.id)}
                              className={`text-xs py-2.5 px-3 rounded-xl border text-left font-medium transition-all ${
                                  selectedStyle === style.id 
                                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' 
                                  : 'border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                              }`}
                          >
                              {style.name}
                          </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={!sourceImage || isGenerating}
                    className="w-full bg-gradient-to-br from-black to-gray-800 text-white py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 hover:shadow-gray-300 disabled:opacity-30 transition-all active:scale-[0.98] flex items-center justify-center"
                >
                    {isGenerating ? <IconLoader className="w-5 h-5" /> : (
                        <>
                          <IconMagic className="w-5 h-5 mr-3" />
                          生成数字分身 (Gemini 3.0)
                        </>
                    )}
                </button>
             </>
           )}
        </div>

        <div className="flex flex-col h-full bg-gray-50/50 border border-gray-100 rounded-3xl relative overflow-hidden">
            {generatedImage ? (
                <div className="w-full h-full flex flex-col relative group">
                    <img src={generatedImage} alt="Generated" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <p className="text-white text-xs font-bold">Gemini 3.0 Pro 生成的数字分身</p>
                        <div className="flex flex-col w-full space-y-2">
                          <button
                              onClick={() => onAvatarSet(generatedImage)}
                              className="w-full bg-white text-black py-3 rounded-xl font-bold shadow-2xl hover:bg-blue-50 transition-colors flex items-center justify-center"
                          >
                              <IconCheck className="w-4 h-4 mr-2" />
                              应用为分身
                          </button>
                          <button
                              onClick={downloadImage}
                              className="w-full bg-white/20 backdrop-blur-md text-white border border-white/30 py-3 rounded-xl font-bold hover:bg-white/30 transition-colors flex items-center justify-center"
                          >
                              <IconDownload className="w-4 h-4 mr-2" />
                              下载高清照片
                          </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                    <div className="w-32 h-32 mb-6 bg-white rounded-full flex items-center justify-center shadow-sm relative">
                        <IconSparkles className="w-12 h-12 text-gray-200" />
                        <div className="absolute -right-2 -top-2 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">3.0</div>
                    </div>
                    <h3 className="text-gray-900 font-bold text-lg mb-2">生成中...</h3>
                    <p className="text-gray-400 text-xs leading-relaxed">
                        基于您的真实面貌结合行业精英气质，<br/>由 Gemini 3.0 Pro 高清重塑
                    </p>
                </div>
            )}
            
            {isGenerating && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center z-20">
                    <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-6"></div>
                    <p className="text-blue-600 font-bold text-sm animate-pulse">正在精雕细琢每一处细节...</p>
                    <p className="text-gray-400 text-[10px] mt-2">预计耗时 5-10 秒</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
