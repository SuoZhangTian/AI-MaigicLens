
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, KnowledgeSource } from "../types.ts";

/**
 * 全局上下文提取：不再限制行数，优先提供全量数据
 */
const prepareGlobalContext = (sources: KnowledgeSource[]): string => {
  return sources.map((s, index) => {
    const isCsv = s.type === 'CSV' || s.name.toLowerCase().endsWith('.csv');
    
    // 汽车配置表预处理：确保 AI 能够理解表格结构
    let processedContent = s.content;
    if (isCsv) {
      // 自动规范化分隔符，增强 AI 的解析准确度
      processedContent = s.content
        .replace(/\t/g, ',') // 将 Tab 转为逗号
        .replace(/;/g, ','); // 将分号转为逗号
    }

    return `
[数据源 ${index + 1}]
文件名: ${s.name}
类型: ${s.type}
内容开始:
${processedContent}
[数据源 ${index + 1} 结束]
`;
  }).join('\n\n---\n\n');
};

export const summarizeContent = async (text: string, type: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `你是一名资深汽车产品专家。请快速浏览此${type}资料，给出30字以内的核心定位摘要。如果是CSV配置表，请列出其覆盖的车型品牌 and 主要参数项。

内容：\n${text.slice(0, 10000)}`
    });
    return response.text || "摘要解析中...";
  } catch (error) {
    console.error("Summarization Error:", error);
    return "解析中...";
  }
};

export const analyzeData = async (query: string, history: ChatMessage[], sources: KnowledgeSource[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const validSources = sources.filter(s => s.content && s.content.trim().length > 10);
    
    if (validSources.length === 0) {
      return "⚠️ 知识库当前没有可供分析的有效文档。请确保已勾选包含文件的分区。";
    }

    const globalContext = prepareGlobalContext(validSources);
    const chatHistory = history.map(h => `${h.role === 'user' ? '用户' : '你'}: ${h.text}`).join('\n');

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `
你现在是“AI知识库工具”高级分析引擎。你拥有处理汽车行业复杂配置表、竞品分析报告、行业新闻的最高权限。

【全局知识上下文】:
${globalContext}

【对话历史】:
${chatHistory}

【当前用户问题】:
${query}

【深度检索与格式化指令】:
1. **全局扫描**：不要只搜索前几行。用户问到的车型可能在文件的任何位置（中间或末尾），请遍历所有数据源中的每一行数据。
2. **跨表关联**：如果数据源 1 有价格，数据源 2 有续航，请自动通过“车型名称”将它们关联起来。
3. **表格优先原则 (CRITICAL)**：
   - **只要涉及 2 个或以上车型、品牌或数据项的对比，必须使用 Markdown 表格呈现核心结果。**
   - **对于包含大量数值、参数、销量数据、价格信息的内容，必须且仅能使用 Markdown 表格进行结构化呈现。**
4. **模糊匹配逻辑**：车型名称可能不完全一致，请利用行业常识判断。
5. **输出标准**：必须引用原始数值。`,
      config: { 
        temperature: 0, 
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });
    
    return response.text || "Gemini 未能生成分析报告。";
  } catch (error) {
    console.error("AI Global Analysis Failed:", error);
    return `❌ 全量检索失败：${error instanceof Error ? error.message : '未知错误'}`;
  }
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
      config: { 
        imageConfig: { 
          aspectRatio: "1:1", 
          imageSize: "1K" 
        } 
      }
    });
    
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Avatar Generation Error:", error);
    return null;
  }
};
