import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AnalysisPipeline } from '@kimy/ai-engine';
import { randomUUID } from 'crypto';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async findAll(programId?: string, includeInactive?: boolean) {
    return this.prisma.thesisTemplate.findMany({
      where: {
        ...(programId && { programId }),
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        program: { select: { name: true } },
        _count: { select: { advances: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.thesisTemplate.findUnique({
      where: { id },
      include: {
        program: true,
        chunks: { orderBy: { chunkIndex: 'asc' } },
      },
    });
  }

  async upload(
    file: Express.Multer.File,
    data: { programId: string; name: string; version: string; citationStyle?: string },
  ) {
    const fileType = file.originalname.endsWith('.docx') ? 'docx' : 'pdf';
    const fileKey = `templates/${data.programId}/${randomUUID()}.${fileType}`;

    // Subir archivo a MinIO
    await this.storage.upload(fileKey, file.buffer, file.mimetype);

    // Extraer texto y estructura con cascada
    let extractedSchema = null;
    let text = '';
    let pipelineToUse: AnalysisPipeline | null = null;
    
    const hasOpenAI = process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your-openai-key');
    const hasGroq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== '';
    const hasGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== '';
    const hasDeepSeek = process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== '';

    this.logger.log(`Keys Detectadas -> OpenAI: ${!!hasOpenAI}, Groq: ${!!hasGroq}, Gemini: ${!!hasGemini}, DeepSeek: ${!!hasDeepSeek}`);

    // 1. DeepSeek (Prioridad nueva basada en configuración)
    if (hasDeepSeek && !pipelineToUse) {
      try {
        this.logger.log('Intentando extraer estructura con DeepSeek...');
        const p = new AnalysisPipeline({ openaiKey: '', deepseekKey: process.env.DEEPSEEK_API_KEY, provider: 'deepseek', maxGrade: 20 });
        text = await p.extractText(file.buffer, fileType as any);
        extractedSchema = await p.extractStructure(text);
        pipelineToUse = p;
        this.logger.log('Estructura extraída exitosamente con DeepSeek');
      } catch (e: any) {
        this.logger.error(`DeepSeek template extraction failed: ${e.message}`);
      }
    }

    // 2. OpenAI
    if (hasOpenAI && !pipelineToUse) {
      try {
        this.logger.log('Intentando extraer estructura con OpenAI...');
        const p = new AnalysisPipeline({ openaiKey: process.env.OPENAI_API_KEY!, maxGrade: 20 });
        text = await p.extractText(file.buffer, fileType as any);
        extractedSchema = await p.extractStructure(text);
        pipelineToUse = p;
        this.logger.log('Estructura extraída exitosamente con OpenAI');
      } catch (e: any) {
        this.logger.error(`OpenAI template extraction failed: ${e.message}`);
      }
    }

    // 3. Groq
    if (hasGroq && !pipelineToUse) {
      try {
        this.logger.log('Intentando extraer estructura con Groq...');
        const p = new AnalysisPipeline({ openaiKey: process.env.GROQ_API_KEY!, provider: 'groq', maxGrade: 20 });
        text = await p.extractText(file.buffer, fileType as any);
        extractedSchema = await p.extractStructure(text);
        pipelineToUse = p;
        this.logger.log('Estructura extraída exitosamente con Groq');
      } catch (e: any) {
        this.logger.error(`Groq template extraction failed: ${e.message}`);
      }
    }

    // 4. Gemini
    if (hasGemini && !pipelineToUse) {
      try {
        this.logger.log('Intentando extraer estructura con Gemini...');
        const p = new AnalysisPipeline({ openaiKey: '', geminiKey: process.env.GEMINI_API_KEY, provider: 'gemini', maxGrade: 20 });
        text = await p.extractText(file.buffer, fileType as any);
        extractedSchema = await p.extractStructure(text);
        pipelineToUse = p;
        this.logger.log('Estructura extraída exitosamente con Gemini');
      } catch (e: any) {
        this.logger.error(`Gemini template extraction failed: ${e.message}`);
      }
    }

    if (!pipelineToUse) {
      this.logger.warn('No se pudo utilizar ninguna IA para la extracción. Se guardará sin estructura.');
    }

    try {
      // Crear template con chunks
      const template = await this.prisma.thesisTemplate.create({
        data: {
          programId: data.programId,
          name: data.name,
          version: data.version,
          fileKey,
          fileType,
          extractedSchema: extractedSchema as any,
          citationStyle: data.citationStyle || 'APA',
        },
      });

      if (pipelineToUse && text) {
        // Generar chunks y embeddings
        const chunks = await pipelineToUse.chunkDocument(text);
        const embeddings = await pipelineToUse.generateEmbeddings(chunks);

        for (let i = 0; i < chunks.length; i++) {
          if (!embeddings[i] || embeddings[i].length === 0) {
            this.logger.warn(`Skipping chunk ${i} due to empty embedding`);
            continue;
          }
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO "TemplateChunk" (id, "templateId", "sectionName", content, embedding, "chunkIndex", "createdAt")
             VALUES ($1, $2, $3, $4, $5::vector, $6, NOW())`,
            randomUUID(), template.id, 'auto', chunks[i],
            `[${embeddings[i].join(',')}]`, i,
          );
        }
      }

      this.logger.log(`Template uploaded: ${template.id}`);
      return template;
    } catch (error) {
      this.logger.error('Error processing template:', error);
      // Guardar sin análisis IA
      return this.prisma.thesisTemplate.create({
        data: {
          programId: data.programId,
          name: data.name,
          version: data.version,
          fileKey,
          fileType,
          citationStyle: data.citationStyle || 'APA',
        },
      });
    }
  }

  async update(id: string, data: { name?: string; version?: string }) {
    return this.prisma.thesisTemplate.update({
      where: { id },
      data,
    });
  }

  async updateRubric(id: string, rubric: any) {
    return this.prisma.thesisTemplate.update({
      where: { id },
      data: { rubric },
    });
  }

  async toggleActive(id: string) {
    const template = await this.prisma.thesisTemplate.findUnique({
      where: { id },
      select: { isActive: true },
    });
    if (!template) throw new Error('Template no encontrado');
    return this.prisma.thesisTemplate.update({
      where: { id },
      data: { isActive: !template.isActive },
    });
  }

  async deactivate(id: string) {
    return this.prisma.thesisTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
