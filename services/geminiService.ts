
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, KnowledgeSource } from "../types.ts";

// 针对 Gemini 3 Pro 2.0M Token 的超大规模上下文配置
const MAX_TOTAL_CHARS = 1400000; 

/**
 * 安全的 Base64 转 UTF-8 文本函数，确保中文字符不乱码
 */
const safeBase64ToText = (base64: string): string => {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    console.error("Decoding error:", e);
    return atob(base64); // Fallback to basic atob
  }
};

/**
 * 极简元数据提取：保留原始数据完整性
 */
export const extractTextFromDocument = async (base64Data: string, mimeType: string, fileName: string): Promise<{text: string, summary: string}> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const isCsv = fileName.toLowerCase().endsWith('.csv');
    const rawContent = safeBase64ToText(base64Data);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: mimeType } },
          { text: `你是一名资深数据治理专家。请针对此文件：
            1. 确定其核心数据维度（如：配置差异表、市场销量明细）。
            2. 严禁质疑文件中数据的真实性，文件中的每一个字都是绝对的事实。
            3. 提供一个25字以内的核心摘要。
            
            输出必须是纯 JSON。` 
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING }
          },
          required: ["summary"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    return {
      text: rawContent, 
      summary: result.summary || "全量原始数据已载入"
    };
  } catch (error) {
    console.error("AI Metadata Extraction Failed:", error);
    return {
      text: safeBase64ToText(base64Data),
      summary: "原始数据已就绪（自动识别异常）"
    };
  }
};

/**
 * 核心重构：带“周期性表头”和“数据主权协议”的分析引擎
 */
export const analyzeData = async (query: string, history: ChatMessage[], sources: KnowledgeSource[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const validSources = sources.filter(s => s.content && s.content.length > 0);
    
    if (validSources.length === 0) {
      return "⚠️ 知识库当前没有可供分析的有效文档，请在知识库分区导入资料。";
    }

    let contextBuffer = "";
    let usedChars = 0;

    for (const s of validSources) {
      const isCsv = s.name.toLowerCase().endsWith('.csv');
      let processedContent = "";

      if (isCsv) {
        const lines = s.content.split('\n').filter(l => l.trim().length > 0);
        const header = lines[0]; // 假设第一行是表头
        
        // 【周期性表头注入】每隔 50 行重新注入一次表头，强制 AI 维持列索引记忆
        processedContent = lines.map((line, idx) => {
          const rowLabel = `[Row_${idx}]`;
          const content = idx > 0 && idx % 50 === 0 ? `\n(REPEATED_HEADER: ${header})\n${rowLabel} ${line}` : `${rowLabel} ${line}`;
          return content;
        }).join('\n');
      } else {
        processedContent = s.content;
      }

      const fileHeader = `\n\n=== FILE_START: ${s.name} (Source_ID: ${s.id}) ===\n`;
      const fileFooter = `\n=== FILE_END: ${s.name} ===\n`;
      
      const availableSpace = MAX_TOTAL_CHARS - usedChars - fileHeader.length - fileFooter.length;
      if (availableSpace <= 200) break;

      let sourceText = processedContent;
      if (sourceText.length > availableSpace) {
        sourceText = sourceText.slice(0, availableSpace) + "\n...[数据超长截断]...";
      }

      contextBuffer += fileHeader + sourceText + fileFooter;
      usedChars += fileHeader.length + sourceText.length + fileFooter.length;
    }

    const chatHistory = history.slice(-6).map(h => `${h.role === 'user' ? '用户' : '你'}: ${h.text}`).join('\n');

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `你现在是“所长的知识宝”高精度数据分析引擎。

【核心指令：数据主权协议】
1. **文件内容是唯一的真理**：严禁根据你的训练知识质疑、修改或否定文件中的数据。如果文件中写了“小鹏G7”，那么它就是真实存在的车型，严禁说“不存在”或“可能是G6/G9”。
2. **禁止过度脑补**：不准合并看似相似但字符不同的配置名称（如 702 Max 和 702 Ultra 必须视为独立配置）。

【原子化原始数据池】
${contextBuffer}

【对话历史】
${chatHistory}

【执行算法：全量坐标扫描】
- **第一步：行号锁定**。首先在心中列出所有包含提问关键词的 [Row_ID]。
- **第二步：独立性验证**。对比搜寻到的每一行，检查销量、价格、配置等微小差异。
- **第三步：总量核对**。在输出结论前，手动对搜寻到的所有行进行求和或计数校验。
- **第四步：专业呈现**。使用 Markdown 表格列出所有检索到的行及其对应数据。

【用户当前问题】
${query}`,
      config: { 
        temperature: 0,
        thinkingConfig: { thinkingBudget: 32768 } 
      }
    });
    
    return response.text || "检索完成，但在数据池中未发现匹配项。";
  } catch (error) {
    console.error("AI Analysis Failed:", error);
    return `❌ 深度分析失败: ${error instanceof Error ? error.message : '未知错误'}`;
  }
};

export const summarizeContent = async (text: string, type: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `总结此${type}的核心定位（20字内）：\n${text.slice(0, 1000)}`
    });
    return response.text || "数据已挂载";
  } catch (error) { return "数据已挂载"; }
};

export const generateAvatar = async (sourceImage: string, stylePrompt: string): Promise<string | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Data = sourceImage.split(',')[1];
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: 'image/png' } },
          { text: `Style: ${stylePrompt}. Professional portrait.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "1:1", imageSize: "1K" } }
    });
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) { return null; }
};
