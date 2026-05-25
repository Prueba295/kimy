'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Upload, X, Bot, Download, Mail, Loader2, Brain } from 'lucide-react';

interface AdvanceSummary {
  id: string;
  title: string;
  studentName?: string;
  advanceType: string;
  status: string;
  version: number;
  createdAt: string;
}

interface BulkJobResult {
  advanceId: string;
  title: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  score?: number;
  error?: string;
}

const ADVANCE_TYPES = [
  { value: 'chapter_1', label: 'Capítulo 1' },
  { value: 'chapter_2', label: 'Capítulo 2' },
  { value: 'chapter_3', label: 'Capítulo 3' },
  { value: 'chapter_4', label: 'Capítulo 4' },
  { value: 'chapter_5', label: 'Capítulo 5' },
  { value: 'full', label: 'Tesis completa' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-500',
  AI_PROCESSING: 'bg-indigo-500',
  AI_COMPLETE: 'bg-emerald-500',
  HUMAN_REVIEW: 'bg-amber-500',
  OBSERVED: 'bg-orange-500',
  APPROVED: 'bg-green-600',
  REJECTED: 'bg-red-500',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  AI_PROCESSING: 'Analizando IA',
  AI_COMPLETE: 'IA Completo',
  HUMAN_REVIEW: 'En Revisión',
  OBSERVED: 'Observado',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

export default function BulkReviewPage() {
  const [advances, setAdvances] = useState<AdvanceSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BulkJobResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [filterStatus, setFilterStatus] = useState('PENDING');

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [uploadAdvanceType, setUploadAdvanceType] = useState('chapter_1');
  const [uploadTemplateId, setUploadTemplateId] = useState('');
  const [uploadStudentId, setUploadStudentId] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchAdvances();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  useEffect(() => {
    setLoadError('');
    Promise.all([
      api.get('/templates?includeInactive=false'),
      api.get('/users?role=STUDENT'),
    ]).then(([tRes, uRes]) => {
      setTemplates(Array.isArray(tRes.data) ? tRes.data : []);
      setStudents(Array.isArray(uRes.data) ? uRes.data : []);
      if (!tRes.data?.length && !uRes.data?.length) {
        setLoadError('No se encontraron plantillas ni estudiantes. Verifica que existan en la base de datos.');
      } else if (!tRes.data?.length) {
        setLoadError('No hay plantillas activas disponibles para tu programa.');
      } else if (!uRes.data?.length) {
        setLoadError('No hay estudiantes registrados en el sistema.');
      }
    }).catch(e => {
      console.error('Error cargando datos para upload:', e);
      setLoadError('Error al cargar datos. Revisa la consola para más detalles.');
    });
  }, []);

  const fetchAdvances = async () => {
    setLoading(true);
    try {
      const res = await api.get('/advances', { params: { status: filterStatus, limit: 100 } });
      const data = res.data;
      setAdvances(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setAdvances([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === advances.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(advances.map((a) => a.id)));
    }
  };

  async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const results: T[] = [];
    let index = 0;

    async function worker(): Promise<void> {
      while (index < tasks.length) {
        const i = index++;
        results[i] = await tasks[i]();
      }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  const runBulkAnalysis = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    setProgress(0);

    const ids = Array.from(selected);
    const jobResults: BulkJobResult[] = ids.map((id) => {
      const adv = advances.find((a) => a.id === id)!;
      return { advanceId: id, title: adv.title, status: 'queued' };
    });
    setResults(jobResults);

    let completedCount = 0;

    const tasks = ids.map((advanceId) => async () => {
      setResults((prev) =>
        prev.map((r) =>
          r.advanceId === advanceId ? { ...r, status: 'processing' } : r,
        ),
      );

      try {
        await api.post(`/ai-analysis/${advanceId}/analyze`);
        setResults((prev) =>
          prev.map((r) =>
            r.advanceId === advanceId ? { ...r, status: 'done' } : r,
          ),
        );
      } catch (err: any) {
        setResults((prev) =>
          prev.map((r) =>
            r.advanceId === advanceId
              ? { ...r, status: 'error', error: err.response?.data?.message || err.message }
              : r,
          ),
        );
      }

      completedCount++;
      setProgress(Math.round((completedCount / ids.length) * 100));
    });

    await runWithConcurrency(tasks, 3);
    setRunning(false);
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFiles.length === 0 || !uploadTemplateId || !uploadStudentId) return;
    setUploading(true);
    setUploadMsg('');

    const fd = new FormData();
    for (const f of uploadFiles) {
      fd.append('files', f);
    }
    fd.append('templateId', uploadTemplateId);
    fd.append('advanceType', uploadAdvanceType);
    fd.append('studentId', uploadStudentId);

    try {
      const res = await api.post('/advances/bulk-upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const created = res.data;
      const count = Array.isArray(created) ? created.length : 1;
      setUploadMsg(`${count} archivo(s) subido(s) y encolado(s) para análisis.`);
      setUploadFiles([]);
      fetchAdvances();
    } catch (err: any) {
      setUploadMsg('Error: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(false);
    }
  };

  const completedAdvanceIds = results.filter(r => r.status === 'done').map(r => r.advanceId);

  const handleBatchDownload = async () => {
    if (completedAdvanceIds.length === 0) return;
    setExporting(true);
    setExportMsg('');
    try {
      const res = await api.post('/reports/batch-pdf', { advanceIds: completedAdvanceIds }, { responseType: 'blob' });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reportes_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg(`${completedAdvanceIds.length} reporte(s) descargados.`);
    } catch (err: any) {
      setExportMsg('Error al descargar: ' + (err.response?.data?.message || err.message));
    } finally {
      setExporting(false);
    }
  };

  const handleBatchEmail = async () => {
    if (completedAdvanceIds.length === 0) return;
    setSendingEmail(true);
    setExportMsg('');
    try {
      const res = await api.post('/reports/batch-send-email', { advanceIds: completedAdvanceIds });
      setExportMsg(`${res.data.successCount} de ${res.data.totalCount} correo(s) enviado(s).`);
    } catch (err: any) {
      setExportMsg('Error al enviar correos: ' + (err.response?.data?.message || err.message));
    } finally {
      setSendingEmail(false);
    }
  };

  const filteredAdvances = advances.filter(
    (a) => filterStatus === 'all' || a.status === filterStatus,
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revisión por Lotes</h1>
          <p className="text-gray-500 text-sm mt-1">
            Selecciona múltiples avances y ejecuta el análisis IA de forma masiva.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showUpload
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {showUpload ? <><X className="w-4 h-4 inline mr-1" /> Cerrar</> : <><Upload className="w-4 h-4 inline mr-1" /> Subir archivos</>}
        </button>
      </div>

      {/* Upload section */}
      {showUpload && (
        <form onSubmit={handleBulkUpload} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          {loadError && (
            <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200">
              {loadError}
            </div>
          )}
          {uploadMsg && (
            <div className={`p-3 rounded-lg text-sm ${
              uploadMsg.startsWith('Error')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {uploadMsg}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Estudiante</label>
              <select
                value={uploadStudentId}
                onChange={e => setUploadStudentId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                required
              >
                <option value="">{students.length === 0 ? 'No hay estudiantes disponibles' : 'Seleccionar...'}</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Documento patrón</label>
              <select
                value={uploadTemplateId}
                onChange={e => setUploadTemplateId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                required
              >
                <option value="">{templates.length === 0 ? 'No hay plantillas activas' : 'Seleccionar...'}</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} v{t.version}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de avance</label>
              <select
                value={uploadAdvanceType}
                onChange={e => setUploadAdvanceType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              >
                {ADVANCE_TYPES.map(at => (
                  <option key={at.value} value={at.value}>{at.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Archivos (múltiple)</label>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors cursor-pointer">
              {uploadFiles.length > 0 ? (
                <div className="text-center px-4">
                  <p className="text-sm text-gray-700 font-medium">{uploadFiles.length} archivo(s) seleccionado(s)</p>
                  <ul className="mt-1 text-xs text-gray-500 space-y-0.5">
                    {uploadFiles.map((f, i) => (
                      <li key={i} className="truncate max-w-[300px]">{f.name}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-center">
                  <svg className="w-7 h-7 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <p className="text-sm text-gray-500">Arrastra o haz clic para seleccionar</p>
                  <p className="text-xs text-gray-400 mt-1">PDF o Word (.docx) — Máx. 50MB c/u</p>
                </div>
              )}
              <input
                type="file"
                multiple
                accept=".pdf,.docx"
                onChange={e => setUploadFiles(Array.from(e.target.files || []))}
                className="hidden"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={uploading || uploadFiles.length === 0 || !uploadTemplateId || !uploadStudentId}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Subiendo...' : `Subir ${uploadFiles.length} archivo(s)`}
            </button>
            {uploadFiles.length > 0 && (
              <button
                type="button"
                onClick={() => setUploadFiles([])}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Limpiar
              </button>
            )}
          </div>
        </form>
      )}

      {/* Filtros + Acciones */}
      <div className="flex flex-wrap gap-3 items-center">
        {['PENDING', 'AI_COMPLETE', 'OBSERVED', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterStatus === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Todos' : STATUS_LABELS[s] ?? s}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-gray-500 text-sm">{selected.size} seleccionados</span>
        <button
          onClick={runBulkAnalysis}
          disabled={selected.size === 0 || running}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? <><Loader2 className="w-4 h-4 inline mr-1 animate-spin" /> Procesando...</> : <><Bot className="w-4 h-4 inline mr-1" /> Analizar {selected.size} avances</>}
        </button>
      </div>

      {/* Barra de progreso nativa */}
      {running && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>Progreso del análisis masivo</span>
            <span className="font-semibold text-indigo-600">{progress}%</span>
          </div>
          {/* Progress bar con div nativo */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Lista de avances — Card nativo */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* CardHeader */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">
              Avances ({filteredAdvances.length})
            </span>
            <button
              onClick={selectAll}
              className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
            >
              {selected.size === advances.length
                ? 'Deseleccionar todo'
                : 'Seleccionar todo'}
            </button>
          </div>

          {/* CardContent */}
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Cargando...</div>
          ) : filteredAdvances.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              No hay avances en este estado.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
              {filteredAdvances.map((adv) => (
                <div
                  key={adv.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleSelect(adv.id)}
                >
                  {/* Checkbox nativo */}
                  <input
                    type="checkbox"
                    checked={selected.has(adv.id)}
                    onChange={() => toggleSelect(adv.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-sm font-medium truncate">
                      {adv.title}
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {adv.advanceType} · v{adv.version}
                    </p>
                  </div>
                  {/* Badge nativo */}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white shrink-0 ${
                      STATUS_COLORS[adv.status] ?? 'bg-gray-500'
                    }`}
                  >
                    {STATUS_LABELS[adv.status] ?? adv.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export message */}
        {exportMsg && (
          <div className={`p-3 rounded-lg text-sm ${
            exportMsg.startsWith('Error')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {exportMsg}
          </div>
        )}

        {/* Resultados del job — Card nativo */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* CardHeader */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">
              Resultados del análisis
            </span>
            {completedAdvanceIds.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleBatchDownload}
                  disabled={exporting}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors"
                >
                  {exporting ? <><Loader2 className="w-4 h-4 inline mr-1 animate-spin" /> Generando...</> : <><Download className="w-4 h-4 inline mr-1" /> Descargar PDFs</>}
                </button>
                <button
                  onClick={handleBatchEmail}
                  disabled={sendingEmail}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
                >
                  {sendingEmail ? <><Loader2 className="w-4 h-4 inline mr-1 animate-spin" /> Enviando...</> : <><Mail className="w-4 h-4 inline mr-1" /> Enviar por correo</>}
                </button>
              </div>
            )}
          </div>

          {/* CardContent */}
          {results.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <Brain className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                Selecciona avances y presiona &quot;Analizar&quot; para comenzar.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
              {results.map((r) => (
                <div key={r.advanceId} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg shrink-0">
                    {r.status === 'queued'
                      ? <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                      : r.status === 'processing'
                      ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      : r.status === 'done'
                      ? <span className="text-green-600 text-base">&#10003;</span>
                      : <span className="text-red-500 text-base">&#10007;</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-sm truncate">{r.title}</p>
                    {r.error && (
                      <p className="text-red-500 text-xs mt-0.5">{r.error}</p>
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      r.status === 'done'
                        ? 'text-emerald-600'
                        : r.status === 'processing'
                        ? 'text-indigo-500'
                        : r.status === 'error'
                        ? 'text-red-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {r.status === 'queued'
                      ? 'En cola'
                      : r.status === 'processing'
                      ? 'Procesando...'
                      : r.status === 'done'
                      ? 'Encolado ✓'
                      : 'Error'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
