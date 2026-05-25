// ═══════════════════════════════════════════════════════════════
// KIMY — Pipeline de Análisis de IA
// ═══════════════════════════════════════════════════════════════

import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { EVALUATION_PROMPT, REFERENCES_PROMPT, STRUCTURE_PROMPT, DETAILED_FEEDBACK_PROMPT } from '../prompts';
import type { AnalysisResult, ExtractedReference, TemplateSchema, DetailedFeedback } from '../types';

export class AnalysisPipeline {
  private llm: any;
  private fastLlm: any;
  private embeddings: any;
  // Native Gemini SDK — used when provider === 'gemini'
  private geminiClient: GoogleGenerativeAI | null = null;
  private geminiModel: string = 'gemini-2.0-flash';
  private splitter: RecursiveCharacterTextSplitter;

  private config: {
    openaiKey: string;
    deepseekKey?: string;
    geminiKey?: string;
    provider?: 'openai' | 'gemini' | 'groq' | 'deepseek';
    maxGrade: number;
    model?: string;
    embeddingModel?: string;
  };

  constructor(config: {
    openaiKey: string;
    deepseekKey?: string;
    geminiKey?: string;
    provider?: 'openai' | 'gemini' | 'groq' | 'deepseek';
    maxGrade: number;
    model?: string;
    embeddingModel?: string;
  }) {
    this.config = config;
    const isGemini = config.provider === 'gemini' && config.geminiKey;

    if (isGemini) {
      // Use @google/generative-ai directly — bypasses LangChain version restrictions
      this.geminiClient = new GoogleGenerativeAI(config.geminiKey!);
      this.geminiModel = config.model || 'gemini-2.0-flash';
    } else if (config.provider === 'groq') {
      // Groq uses an OpenAI-compatible REST API — no new package needed
      const groqModel = config.model || 'llama-3.3-70b-versatile';
      this.llm = new ChatOpenAI({
        apiKey: config.openaiKey,
        model: groqModel,
        temperature: 0.1,
        configuration: { baseURL: 'https://api.groq.com/openai/v1' },
      });
      this.fastLlm = new ChatOpenAI({
        apiKey: config.openaiKey,
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        configuration: { baseURL: 'https://api.groq.com/openai/v1' },
      });
      // Groq doesn't have an embedding model — skip embeddings (already handled by skip guard)
      this.embeddings = null;
    } else if (config.provider === 'deepseek') {
      // DeepSeek uses OpenAI-compatible API — no new package needed
      const dsModel = config.model || 'deepseek-chat';
      this.llm = new ChatOpenAI({
        apiKey: config.deepseekKey || config.openaiKey,
        model: dsModel,
        temperature: 0.1,
        configuration: { baseURL: 'https://api.deepseek.com/v1' },
      });
      this.fastLlm = new ChatOpenAI({
        apiKey: config.deepseekKey || config.openaiKey,
        model: 'deepseek-chat',
        temperature: 0,
        configuration: { baseURL: 'https://api.deepseek.com/v1' },
      });
      this.embeddings = null;
    } else {
      this.llm = new ChatOpenAI({
        apiKey: config.openaiKey,
        model: config.model || 'gpt-4o',
        temperature: 0.1,
        modelKwargs: { response_format: { type: 'json_object' } },
      });

      this.fastLlm = new ChatOpenAI({
        apiKey: config.openaiKey,
        model: 'gpt-4o-mini',
        temperature: 0,
        modelKwargs: { response_format: { type: 'json_object' } },
      });

      this.embeddings = new OpenAIEmbeddings({
        apiKey: config.openaiKey,
        model: config.embeddingModel || 'text-embedding-3-large',
      });
    }

    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' '],
    });
  }

  // ─── Helper: invoke Gemini with retry + model cascade ───────────
  private async invokeGemini(systemPrompt: string, userContent: string): Promise<string> {
    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    // Only Gemini 2.x models are supported on v1beta with current SDK
    // gemini-1.5-flash consistently returns 404 — removed from cascade
    const modelsToTry = [
      this.geminiModel,
      'gemini-2.0-flash-lite',
    ].filter((v, i, a) => a.indexOf(v) === i);

    // Errors that are billing/account issues — no point retrying or trying other models
    const isFatalBillingError = (msg: string) =>
      msg.includes('prepaid credits are depleted') ||
      msg.includes('SERVICE_DISABLED') ||
      msg.includes('CONSUMER_INVALID') ||
      msg.includes('403');

    let lastError: any;
    for (const modelName of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const model = this.geminiClient.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(`${systemPrompt}\n\n${userContent}`);
          let text = result.response.text();
          if (text.startsWith('```json')) text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
          else if (text.startsWith('```')) text = text.replace(/^```\n?/, '').replace(/\n?```$/, '');
          return text.trim();
        } catch (e: any) {
          lastError = e;
          const msg = e?.message || '';

          // Billing / account error: fail immediately, skip all remaining models
          if (isFatalBillingError(msg)) throw e;

          // True rate-limit 429 with retryDelay hint: wait once then retry same model
          const isRateLimit = msg.includes('429') && msg.includes('retryDelay');
          if (isRateLimit && attempt === 0) {
            const match = msg.match(/"retryDelay":"(\d+)s"/);
            const waitMs = Math.min((parseInt(match?.[1] || '10') + 3) * 1000, 30000);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }

          break; // other error or second attempt: try next model
        }
      }
    }
    throw lastError;
  }

  // ─── Extracción de texto ────────────────────
  async extractText(fileBuffer: Buffer, fileType: 'pdf' | 'docx'): Promise<string> {
    if (fileType === 'docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    }
    const data = await pdfParse(fileBuffer);
    return data.text;
  }

  // ─── Chunking ──────────────────────────────
  async chunkDocument(text: string): Promise<string[]> {
    return this.splitter.splitText(text);
  }

  // ─── Embeddings ────────────────────────────
  async generateEmbeddings(chunks: string[]): Promise<number[][]> {
    // Gemini and Groq have no configured embedding model — skip (caller handles empty arrays)
    if (this.geminiClient || !this.embeddings) {
      return chunks.map(() => []);
    }
    // Procesar en batches de 20 para evitar rate limits
    const batchSize = 20;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await this.embeddings.embedDocuments(batch);
      allEmbeddings.push(...embeddings);
    }
    return allEmbeddings;
  }

  // ─── Extracción de estructura ──────────────
  async extractStructure(text: string): Promise<TemplateSchema> {
    let rawContent: string;
    const truncatedText = text.substring(0, 40000);
    if (this.geminiClient) {
      rawContent = await this.invokeGemini(STRUCTURE_PROMPT, truncatedText);
    } else {
      const response: any = await (this.fastLlm as any).invoke([
        { role: 'system', content: STRUCTURE_PROMPT },
        { role: 'user', content: truncatedText },
      ]);
      rawContent = response.content as string;
      if (rawContent.startsWith('```json')) rawContent = rawContent.replace(/^```json\n/, '').replace(/\n```$/, '');
      else if (rawContent.startsWith('```')) rawContent = rawContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    return this.parseRobustJson(rawContent);
  }

  // ─── Análisis principal ────────────────────
  async analyze(
    advanceText: string,
    templateSchema: TemplateSchema | object,
    templateText: string,
    advanceType: string,
  ): Promise<AnalysisResult> {
    const startMs = Date.now();

    const userPrompt = `
## DOCUMENTO PATRÓN — ESTRUCTURA ESPERADA
${JSON.stringify(templateSchema, null, 2)}

## FRAGMENTO DEL PATRÓN (referencia de estilo y profundidad)
${templateText.substring(0, 4000)}

## TIPO DE AVANCE A EVALUAR
${advanceType}

## AVANCE DEL ESTUDIANTE
${advanceText.substring(0, 12000)}

## RESPUESTA REQUERIDA
Responde con este JSON exacto (sin backticks, sin markdown):
{
  "scores": {
    "structure": <número 0-100>,
    "content": <número 0-100>,
    "form": <número 0-100>,
    "originality": <número 0-100>
  },
  "executiveSummary": "<párrafo de 4-6 oraciones sintetizando fortalezas, debilidades, prioridad de corrección y nivel de avance>",
  "structureAnalysis": {
    "presentSections": ["lista de secciones encontradas"],
    "missingSections": ["lista de secciones faltantes del patrón"],
    "extraSections": ["secciones no esperadas"],
    "orderCorrect": true/false
  },
  "findings": [
    {
      "sectionRef": "<nombre de la sección afectada>",
      "pageRef": <número de página aprox o null>,
      "severity": "CRITICAL|MAJOR|MINOR|SUGGESTION",
      "description": "<descripción específica del hallazgo, mínimo 2 oraciones>",
      "correctionSteps": "<instrucciones paso a paso para corregir, mínimo 3 pasos>",
      "exampleImprovement": "<ejemplo concreto de redacción o estructura mejorada, mínimo 1 párrafo>",
      "recommendation": "<consejo académico adicional con referencias sugeridas>"
    }
  ]
}`;

    let rawContent: string;
    if (this.geminiClient) {
      rawContent = await this.invokeGemini(EVALUATION_PROMPT, userPrompt);
    } else {
      const response: any = await (this.llm as any).invoke([
        { role: 'system', content: EVALUATION_PROMPT },
        { role: 'user', content: userPrompt },
      ]);
      rawContent = response.content as string;
      if (rawContent.startsWith('```json')) rawContent = rawContent.replace(/^```json\n/, '').replace(/\n```$/, '');
      else if (rawContent.startsWith('```')) rawContent = rawContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const parsed = this.parseRobustJson(rawContent);
    const s = parsed.scores;
    const overall = s.structure * 0.3 + s.content * 0.4 + s.form * 0.2 + s.originality * 0.1;
    const grade = (overall / 100) * this.config.maxGrade;

    return {
      scores: {
        structure: Math.round(s.structure),
        content: Math.round(s.content),
        form: Math.round(s.form),
        originality: Math.round(s.originality),
        overall: Math.round(overall * 10) / 10,
      },
      grade: Math.round(grade * 10) / 10,
      executiveSummary: parsed.executiveSummary,
      structureAnalysis: parsed.structureAnalysis,
      findings: parsed.findings || [],
      processingMs: Date.now() - startMs,
    };
  }

  // ─── Feedback detallado ────────────────────
  async generateDetailedFeedback(
    advanceText: string,
    scores: { structure: number; content: number; form: number; originality: number; overall: number },
    executiveSummary: string,
    findings: any[],
    advanceType: string,
  ): Promise<DetailedFeedback> {
    const userPrompt = `
## TIPO DE AVANCE EVALUADO
${advanceType}

## PUNTUACIONES POR DIMENSIÓN
- Estructura: ${scores.structure}/100
- Contenido: ${scores.content}/100
- Forma: ${scores.form}/100
- Originalidad: ${scores.originality}/100
- Puntaje Global: ${scores.overall}/100

## RESUMEN EJECUTIVO
${executiveSummary}

## HALLAZGOS DETECTADOS
${JSON.stringify(findings, null, 2)}

## FRAGMENTO DEL AVANCE DEL ESTUDIANTE
${advanceText.substring(0, 8000)}`;

    let rawContent: string;
    if (this.geminiClient) {
      rawContent = await this.invokeGemini(DETAILED_FEEDBACK_PROMPT, userPrompt);
    } else {
      const response: any = await (this.llm as any).invoke([
        { role: 'system', content: DETAILED_FEEDBACK_PROMPT },
        { role: 'user', content: userPrompt },
      ]);
      rawContent = response.content as string;
      if (rawContent.startsWith('```json')) rawContent = rawContent.replace(/^```json\n/, '').replace(/\n```$/, '');
      else if (rawContent.startsWith('```')) rawContent = rawContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    return this.parseRobustJson(rawContent);
  }

  // ─── Extracción de referencias ─────────────
  async extractReferences(text: string): Promise<ExtractedReference[]> {
    const bibIndex = text.search(
      /referencias\s+bibliográficas?|bibliografía|references|bibliography/i,
    );
    const bibSection = bibIndex !== -1
      ? text.slice(bibIndex, bibIndex + 8000)
      : text.slice(-5000);

    let rawContent: string;
    if (this.geminiClient) {
      rawContent = await this.invokeGemini(REFERENCES_PROMPT, bibSection);
    } else {
      const response: any = await (this.fastLlm as any).invoke([
        { role: 'system', content: REFERENCES_PROMPT },
        { role: 'user', content: bibSection },
      ]);
      rawContent = response.content as string;
      if (rawContent.startsWith('```json')) rawContent = rawContent.replace(/^```json\n/, '').replace(/\n```$/, '');
      else if (rawContent.startsWith('```')) rawContent = rawContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    const parsed = this.parseRobustJson(rawContent);
    return parsed.references || [];
  }

  private parseRobustJson(text: string): any {
    const cleanText = text.trim();
    // 1. Try simple parse first
    try {
      return JSON.parse(cleanText);
    } catch (e) { }

    // 2. Extract markdown JSON block if present
    const markdownJsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const matchMarkdown = cleanText.match(markdownJsonRegex);
    if (matchMarkdown && matchMarkdown[1]) {
      try {
        return JSON.parse(matchMarkdown[1].trim());
      } catch (e) { }
    }

    // 3. Fallback: find first '{' or '[' and last '}' or ']'
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = cleanText.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (e) { }
    }

    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const jsonCandidate = cleanText.substring(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (e) { }
    }

    // If everything fails, throw the original parse error
    return JSON.parse(cleanText);
  }
}
