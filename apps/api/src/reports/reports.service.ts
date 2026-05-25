import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import * as nodemailer from 'nodemailer';
import archiver from 'archiver';
import { Readable, PassThrough } from 'stream';

import puppeteer from 'puppeteer';

function findChromePath(): string | undefined {
  const envPath = process.env.CHROMIUM_PATH || process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) return envPath;
  try {
    const fs = require('fs');
    for (const p of ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']) {
      try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
    }
  } catch {}
  return undefined;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  async getFileName(advanceId: string): Promise<string> {
    const advance = await this.prisma.advance.findUniqueOrThrow({
      where: { id: advanceId },
      select: {
        student: { select: { name: true } },
        advanceType: true,
        version: true,
      },
    });
    const safeName = advance.student.name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').trim().replace(/\s+/g, '_');
    const safeType = advance.advanceType.replace(/[^a-zA-Z0-9]/g, '_');
    return `Acta_${safeName}_${safeType}_v${advance.version}.pdf`;
  }

  async generateAdvanceReport(advanceId: string) {
    const advance = await this.prisma.advance.findUniqueOrThrow({
      where: { id: advanceId },
      include: {
        student: { select: { name: true, email: true } },
        program: { select: { name: true } },
        template: { select: { name: true, version: true } },
        aiAnalysis: {
          include: { findings: { orderBy: { severity: 'asc' } } },
        },
        review: {
          include: { reviewer: { select: { name: true } } },
        },
        referenceAnalysis: {
          include: { references: { where: { status: { not: 'VERIFIED' } }, take: 10 } },
        },
        plagiarismReports: {
          include: { alerts: { orderBy: { similarity: 'desc' }, take: 5 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Generar HTML para el reporte
    const html = this.buildReportHTML(advance);

    return {
      html,
      advance,
      generatedAt: new Date().toISOString(),
    };
  }

  async generateAdvancePdf(advanceId: string, existingBrowser?: any): Promise<Buffer> {
    const report = await this.generateAdvanceReport(advanceId);
    
    const chromePath = findChromePath();
    const browser = existingBrowser || await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--single-process'],
      ...(chromePath ? { executablePath: chromePath } : {}),
    });
    
    try {
      const page = await browser.newPage();
      await page.setContent(report.html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div style="font-size:8px;color:#9CA3AF;width:100%;text-align:right;padding-right:20mm">Reporte de Evaluación KIMY</div>',
        footerTemplate: '<div style="font-size:8px;color:#9CA3AF;width:100%;text-align:center">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
      });
      
      return Buffer.from(pdfBuffer);
    } finally {
      if (!existingBrowser) await browser.close();
    }
  }

  async sendAdvanceReportEmail(advanceId: string) {
    const report = await this.generateAdvanceReport(advanceId);
    const pdfBuffer = await this.generateAdvancePdf(advanceId);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER || 'ethereal.user@ethereal.email',
        pass: process.env.SMTP_PASS || 'etherealpass',
      },
    });

    try {
      const info = await transporter.sendMail({
        from: '"KIMY Thesis System" <noreply@kimy.edu>',
        to: report.advance.student.email,
        subject: `Acta de Revisión - ${report.advance.advanceType}`,
        html: `<p>Hola ${report.advance.student.name},</p><p>Adjuntamos el acta de revisión de tu avance de tesis.</p><p>Nota IA: ${report.advance.aiAnalysis?.gradeConverted?.toFixed(1)}</p>`,
        attachments: [
          {
            filename: `Acta_${report.advance.student.name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').trim().replace(/\s+/g, '_')}_${report.advance.advanceType.replace(/[^a-zA-Z0-9]/g, '_')}_v${report.advance.version}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
      this.logger.log(`Email enviado: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error('Error enviando email', error);
      throw error;
    }
  }

  async generateBatchPdf(advanceIds: string[]): Promise<Buffer> {
    const chromePath = await findChrome();
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--single-process'],
      ...(chromePath ? { executablePath: chromePath } : {}),
    });
    const archive = archiver('zip', { zlib: { level: 9 } });
    const buffers: Buffer[] = [];

    return new Promise((resolve, reject) => {
      archive.on('data', (d: Buffer) => buffers.push(d));
      archive.on('end', async () => {
        await browser.close();
        resolve(Buffer.concat(buffers));
      });
      archive.on('error', async (err) => {
        await browser.close();
        reject(err);
      });

      (async () => {
        for (const id of advanceIds) {
          try {
            const pdf = await this.generateAdvancePdf(id, browser);
            const advance = await this.prisma.advance.findUnique({
              where: { id },
              select: { advanceType: true, version: true, student: { select: { name: true } } },
            });
            const safeName = (advance?.student?.name || id).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').trim().replace(/\s+/g, '_');
            const safeType = (advance?.advanceType || 'avance').replace(/[^a-zA-Z0-9]/g, '_');
            archive.append(Buffer.from(pdf), { name: `Acta_${safeName}_${safeType}_v${advance?.version || 1}.pdf` });
          } catch (err) {
            this.logger.warn(`Error generando PDF para advance ${id}: ${err}`);
          }
        }
        await archive.finalize();
      })();
    });
  }

  async sendBatchEmail(advanceIds: string[]) {
    const results: { advanceId: string; success: boolean; error?: string }[] = [];

    for (const id of advanceIds) {
      try {
        await this.sendAdvanceReportEmail(id);
        results.push({ advanceId: id, success: true });
      } catch (err: any) {
        results.push({ advanceId: id, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return { results, successCount, totalCount: advanceIds.length };
  }

  private buildReportHTML(advance: any): string {
    const institution = process.env.INSTITUTION_NAME || 'Universidad';
    const analysis = advance.aiAnalysis;
    const findings = analysis?.findings || [];

    const severityColors: Record<string, string> = {
      CRITICAL: '#DC2626',
      MAJOR: '#D97706',
      MINOR: '#059669',
      SUGGESTION: '#2563EB',
    };

    const findingsHTML = findings.map((f: any) => `
      <div style="border:1px solid #E5E7EB;border-radius:8px;padding:14px;margin-bottom:10px;page-break-inside:avoid">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="background:${severityColors[f.severity]}20;color:${severityColors[f.severity]};font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">${f.severity}</span>
          <span style="font-size:11px;color:#6B7280">${f.sectionRef}${f.pageRef ? ` — p.${f.pageRef}` : ''}</span>
        </div>
        <p style="font-size:11.5px;color:#374151;margin:0 0 6px">${f.description}</p>
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:8px 10px;font-size:11px;color:#4B5563;margin-bottom:6px">
          <strong>Cómo corregir:</strong> ${f.correctionSteps}
        </div>
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:8px 10px;font-size:10.5px;color:#166534;font-style:italic">
          <strong>Ejemplo:</strong> ${f.exampleImprovement}
        </div>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#1F2937; line-height:1.6; padding:20px; }
  .header { text-align:center; padding:30px 0; border-bottom:2px solid #185FA5; margin-bottom:24px; }
  .institution { font-size:14px; font-weight:600; color:#185FA5; }
  .title { font-size:18px; font-weight:700; color:#111827; margin:10px 0 4px; }
  .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px; }
  .meta-card { background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; padding:10px; }
  .meta-label { font-size:10px; color:#9CA3AF; text-transform:uppercase; }
  .meta-value { font-size:13px; font-weight:600; color:#111827; }
  .section-title { font-size:14px; font-weight:700; color:#185FA5; margin:20px 0 10px; border-bottom:1px solid #E5E7EB; padding-bottom:6px; }
  .score-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:16px; }
  .score-item { text-align:center; border:1px solid #E5E7EB; border-radius:8px; padding:10px; }
  .score-val { font-size:22px; font-weight:700; color:#185FA5; }
  .score-lbl { font-size:10px; color:#6B7280; }
  .summary { background:#EFF6FF; border-left:4px solid #185FA5; padding:12px; border-radius:0 8px 8px 0; margin-bottom:20px; }
  .grade-box { background:#185FA5; color:#fff; border-radius:12px; padding:16px; text-align:center; margin-bottom:20px; }
  .grade-big { font-size:36px; font-weight:800; }
</style></head>
<body>
  <div class="header">
    <div class="institution">${institution}</div>
    <div class="title">Acta de Revisión de Avance de Tesis</div>
    <div style="font-size:11px;color:#6B7280">Sistema KIMY — Evaluación IA + Revisión Humana</div>
  </div>

  <div class="meta-grid">
    <div class="meta-card"><div class="meta-label">Estudiante</div><div class="meta-value">${advance.student.name}</div></div>
    <div class="meta-card"><div class="meta-label">Programa</div><div class="meta-value">${advance.program.name}</div></div>
    <div class="meta-card"><div class="meta-label">Avance</div><div class="meta-value">${advance.advanceType} — v${advance.version}</div></div>
    <div class="meta-card"><div class="meta-label">Estado</div><div class="meta-value">${advance.status}</div></div>
  </div>

  ${analysis ? `
  <div class="grade-box">
    <div class="grade-big">${analysis.gradeConverted.toFixed(1)} / ${process.env.MAX_GRADE || 20}</div>
    <div style="font-size:12px;opacity:0.85">Nota IA${advance.review ? ` | Nota Final: ${advance.review.finalGrade?.toFixed(1) || '—'}` : ''}</div>
  </div>

  <div class="section-title">Puntuación por Dimensión</div>
  <div class="score-grid">
    <div class="score-item"><div class="score-val">${Number(analysis.structureScore).toFixed(2)}%</div><div class="score-lbl">Estructura</div></div>
    <div class="score-item"><div class="score-val">${Number(analysis.contentScore).toFixed(2)}%</div><div class="score-lbl">Contenido</div></div>
    <div class="score-item"><div class="score-val">${Number(analysis.formScore).toFixed(2)}%</div><div class="score-lbl">Forma</div></div>
    <div class="score-item"><div class="score-val">${Number(analysis.originalityScore).toFixed(2)}%</div><div class="score-lbl">Originalidad</div></div>
  </div>

  <div class="section-title">Resumen Ejecutivo</div>
  <div class="summary">${analysis.executiveSummary}</div>

  <div class="section-title">Hallazgos (${findings.length})</div>
  ${findingsHTML}

  ${analysis.detailedFeedback ? `
  <div class="section-title">Feedback Detallado</div>
  <div class="summary">${analysis.detailedFeedback.executiveSummary || analysis.executiveSummary}</div>

  ${
    (analysis.detailedFeedback as any).sectionAnalysis?.length > 0 ? `
    <div style="margin-top:10px;">
      <div class="section-title" style="font-size:12px;">Análisis por Sección</div>
      ${(analysis.detailedFeedback as any).sectionAnalysis.map((s: any) => `
        <div style="background:${s.status === 'OK' ? '#F0FDF4' : s.status === 'OBSERVED' ? '#FFFBEB' : '#FEF2F2'}; border:1px solid ${s.status === 'OK' ? '#BBF7D0' : s.status === 'OBSERVED' ? '#FDE68A' : '#FECACA'}; border-radius:8px; padding:10px; margin-bottom:8px; page-break-inside:avoid;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <strong style="font-size:12px; color:#111827;">${s.sectionName}</strong>
            <span style="font-size:10px; font-weight:700; padding:2px 10px; border-radius:20px; background:${s.status === 'OK' ? '#059669' : s.status === 'OBSERVED' ? '#D97706' : '#DC2626'}; color:#fff;">${s.status === 'OK' ? '✓ Correcto' : s.status === 'OBSERVED' ? '~ Observado' : '✗ Faltante'}</span>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div style="background:#fff; border-radius:6px; padding:8px;">
              <div style="font-size:9px; font-weight:700; color:#059669; margin-bottom:2px;">FORTALEZAS</div>
              <p style="font-size:10.5px; color:#374151; margin:0;">${s.strengths}</p>
            </div>
            <div style="background:#fff; border-radius:6px; padding:8px;">
              <div style="font-size:9px; font-weight:700; color:#DC2626; margin-bottom:2px;">DEBILIDADES</div>
              <p style="font-size:10.5px; color:#374151; margin:0;">${s.weaknesses}</p>
            </div>
          </div>
          <div style="background:#EFF6FF; border-radius:6px; padding:8px; margin-top:6px;">
            <div style="font-size:9px; font-weight:700; color:#1E40AF; margin-bottom:2px;">SUGERENCIA DE MEJORA</div>
            <p style="font-size:10.5px; color:#374151; margin:0;">${s.improvementSuggestion}</p>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''
  }

  ${
    (analysis.detailedFeedback as any).dimensionAnalysis?.length > 0 ? `
    <div style="margin-top:10px;">
      <div class="section-title" style="font-size:12px;">Análisis por Dimensión</div>
      ${(analysis.detailedFeedback as any).dimensionAnalysis.map((d: any) => `
        <div style="background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; padding:10px; margin-bottom:8px; page-break-inside:avoid;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
            <strong style="font-size:12px; color:#111827;">${d.dimension}</strong>
            <span style="background:${d.priority === 'ALTA' ? '#FEE2E2' : d.priority === 'MEDIA' ? '#FEF3C7' : '#DBEAFE'}; color:${d.priority === 'ALTA' ? '#991B1B' : d.priority === 'MEDIA' ? '#92400E' : '#1E40AF'}; font-size:10px; font-weight:700; padding:2px 8px; border-radius:20px;">${d.priority}</span>
          </div>
          <div style="font-size:10px; color:#6B7280; margin-bottom:4px;">Puntaje: <strong>${d.score}%</strong> (Peso: ${d.weight}%)</div>
          <p style="font-size:11px; color:#374151; margin:0;">${d.analysis}</p>
        </div>
      `).join('')}
    </div>
    ` : ''
  }

  ${
    (analysis.detailedFeedback as any).prioritizedRecommendations?.length > 0 ? `
    <div style="margin-top:10px;">
      <div class="section-title" style="font-size:12px;">Recomendaciones Priorizadas</div>
      ${(analysis.detailedFeedback as any).prioritizedRecommendations.map((r: any) => `
        <div style="background:#EFF6FF; border-left:4px solid ${r.priority === 1 ? '#DC2626' : r.priority === 2 ? '#D97706' : '#2563EB'}; border-radius:0 8px 8px 0; padding:10px; margin-bottom:8px; page-break-inside:avoid;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span style="background:#185FA5; color:#fff; font-size:9px; font-weight:700; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${r.priority}</span>
            <strong style="font-size:11px; color:#111827;">${r.area}</strong>
          </div>
          <p style="font-size:10.5px; color:#374151; margin:0 0 4px 26px;">${r.recommendation}</p>
          <div style="font-size:10px; color:#6B7280; margin-left:26px;">Impacto esperado: <strong>${r.expectedImpact}</strong></div>
        </div>
      `).join('')}
    </div>
    ` : ''
  }

  ${
    (analysis.detailedFeedback as any).improvementPlan ? `
    <div style="margin-top:10px;">
      <div class="section-title" style="font-size:12px;">Plan de Mejora</div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
        <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; padding:10px;">
          <div style="font-size:10px; font-weight:700; color:#92400E; margin-bottom:6px;">Corto Plazo</div>
          <ul style="margin:0; padding-left:14px; font-size:10px; color:#78350F;">
            ${(analysis.detailedFeedback as any).improvementPlan.shortTerm.map((s: string) => `<li>${s}</li>`).join('')}
          </ul>
        </div>
        <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; padding:10px;">
          <div style="font-size:10px; font-weight:700; color:#1E40AF; margin-bottom:6px;">Mediano Plazo</div>
          <ul style="margin:0; padding-left:14px; font-size:10px; color:#1E3A5F;">
            ${(analysis.detailedFeedback as any).improvementPlan.mediumTerm.map((s: string) => `<li>${s}</li>`).join('')}
          </ul>
        </div>
        <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px; padding:10px;">
          <div style="font-size:10px; font-weight:700; color:#166534; margin-bottom:6px;">Largo Plazo</div>
          <ul style="margin:0; padding-left:14px; font-size:10px; color:#14532D;">
            ${(analysis.detailedFeedback as any).improvementPlan.longTerm.map((s: string) => `<li>${s}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
    ` : ''
  }
  ` : ''}
  ` : '<p>Análisis IA pendiente</p>'}

  ${advance.review ? `
  <div class="section-title">Revisión Humana</div>
  <div class="meta-grid">
    <div class="meta-card"><div class="meta-label">Revisor</div><div class="meta-value">${advance.review.reviewer.name}</div></div>
    <div class="meta-card"><div class="meta-label">Nota Final</div><div class="meta-value">${advance.review.finalGrade?.toFixed(1) || '—'}</div></div>
  </div>
  ${advance.review.humanComment ? `<div class="summary">${advance.review.humanComment}</div>` : ''}
  ` : ''}

  ${advance.plagiarismReports?.[0] ? `
  <div class="section-title">Análisis de Originalidad (Plagio)</div>
  <div class="meta-grid">
    <div class="meta-card"><div class="meta-label">Similitud Máxima</div><div class="meta-value" style="color:${advance.plagiarismReports[0].overallScore > 30 ? '#DC2626' : '#059669'}">${advance.plagiarismReports[0].overallScore.toFixed(1)}%</div></div>
  </div>
  ${advance.plagiarismReports[0].alerts.length > 0 ? `
    <div style="font-size:11px; margin-bottom:10px;">Alertas principales:</div>
    ${advance.plagiarismReports[0].alerts.map((a: any) => `
      <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:6px; padding:8px; margin-bottom:6px; font-size:10.5px; color:#991B1B;">
        <strong>${a.sectionName}</strong> — Similitud: ${(a.similarity * 100).toFixed(1)}%
      </div>
    `).join('')}
  ` : '<div style="font-size:11px; color:#059669;">No se detectó plagio significativo.</div>'}
  ` : ''}

  ${advance.referenceAnalysis ? `
  <div class="section-title">Validación Bibliográfica (CrossRef)</div>
  <div class="meta-grid">
    <div class="meta-card"><div class="meta-label">Total Citas</div><div class="meta-value">${advance.referenceAnalysis.totalRefs}</div></div>
    <div class="meta-card"><div class="meta-label">Verificadas</div><div class="meta-value" style="color:#059669">${advance.referenceAnalysis.verifiedCount}</div></div>
    <div class="meta-card"><div class="meta-label">Con Errores</div><div class="meta-value" style="color:#DC2626">${advance.referenceAnalysis.errorCount}</div></div>
  </div>
  ${advance.referenceAnalysis.references.length > 0 ? `
    <div style="font-size:11px; margin-bottom:10px;">Citas observadas (Muestra):</div>
    ${advance.referenceAnalysis.references.map((r: any) => `
      <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:6px; padding:8px; margin-bottom:6px; font-size:10.5px; color:#92400E;">
        <strong>${r.rawText.substring(0, 100)}...</strong><br/>
        <em>Estado: ${r.status} — ${r.suggestion || 'Sin sugerencia'}</em>
      </div>
    `).join('')}
  ` : '<div style="font-size:11px; color:#059669;">Todas las citas fueron validadas correctamente.</div>'}
  ` : ''}

  <div style="text-align:center;margin-top:30px;color:#9CA3AF;font-size:10px">
    Generado por KIMY — ${new Date().toLocaleDateString('es-PE', { year:'numeric', month:'long', day:'numeric' })}
  </div>
</body></html>`;
  }
}
