# 🎓 KIMY — Sistema de Revisión Inteligente de Tesis

> **Sistema web completo + app móvil** para la gestión, revisión y evaluación automatizada de avances de tesis universitarias con inteligencia artificial.

---

## ✨ Características

| Módulo | Descripción |
|--------|-------------|
| 🤖 **Análisis IA Multi-Proveedor** | GPT-4o / Groq (Llama 3.3 70B) / Gemini 2.0 Flash con fallback automático y soporte para modelos fine-tuneados |
| 📊 **Dashboard con KPIs** | Vista general con métricas, concordancia IA-Humano y alertas de plagio en tiempo real |
| 📝 **Retroalimentación accionable** | Hallazgos con instrucciones de corrección, ejemplos de mejora y severidad (Crítico / Mayor / Menor / Sugerencia) |
| 🔍 **Detección de plagio** | Embeddings coseno con pgvector (`<=>`) + integración opcional Copyleaks API |
| 📚 **Validación de citas** | Verificación automática con CrossRef API (verified / partial / not_found / hallucinated) |
| 🎯 **Fine-tuning continuo** | Recolección de pares humano-IA y activación/desactivación de modelos personalizados desde panel Admin |
| 🔗 **Integración ORCID** | OAuth 2.0 para perfiles académicos de asesores (publicaciones, afiliaciones, validación de expertise) |
| 📱 **App Móvil (Expo SDK 52)** | Dashboard, hallazgos IA por severidad, historial de notas, descarga de PDFs y push notifications reales |
| 📄 **Reportes PDF** | Actas de revisión con evaluación IA + ajustes humanos + plagio + citas |
| 🔔 **Push Notifications** | Expo Push API real: análisis IA listo, asesor comentó, deadline próximo |
| 🗂️ **Revisión por Lotes** | Análisis masivo de múltiples avances con barra de progreso en tiempo real |

---

## 🏗️ Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| **Frontend Web** | Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS, shadcn/ui |
| **Backend** | NestJS 11, TypeScript, Arquitectura Modular (Clean/Hexagonal) |
| **Base de Datos** | PostgreSQL 16 + pgvector (embeddings semánticos) |
| **ORM** | Prisma 6 (con Prisma Migrate) |
| **Almacenamiento** | MinIO (S3-compatible para documentos Word/PDF) |
| **Colas** | BullMQ + Redis (análisis IA, plagio, citas — workers independientes) |
| **IA Principal** | OpenAI GPT-4o / GPT-4o-mini (con soporte fine-tuned models) |
| **IA Respaldo** | Groq (Llama 3.3 70B) / Google Gemini 2.0 Flash |
| **Embeddings** | text-embedding-3-large → pgvector (3072 dims) |
| **App Móvil** | Expo SDK 52, React Native, React Navigation, TanStack Query, Zustand |
| **Notificaciones Push** | Expo Push API (registro de tokens, batches de 100 msgs) |
| **Contenedores** | Docker + Docker Compose |
| **Monorepo** | Turborepo 2 |

---

## 📁 Estructura del Proyecto

```
kimy/
├── apps/
│   ├── web/                    # Next.js 15 — Portal web
│   │   └── src/app/dashboard/
│   │       ├── advances/       # Lista y detalle de avances
│   │       ├── bulk-review/    # 🆕 Revisión por lotes
│   │       ├── fine-tuning/    # Panel de fine-tuning
│   │       ├── plagiarism/     # Reportes de plagio
│   │       ├── references/     # Citas validadas
│   │       ├── settings/       # Configuración del sistema
│   │       ├── statistics/     # Estadísticas y gráficos
│   │       ├── templates/      # Documentos patrón
│   │       └── users/          # Gestión de usuarios
│   │
│   ├── api/                    # NestJS — Backend REST
│   │   └── src/
│   │       ├── advances/       # Carga y versionado
│   │       ├── ai-analysis/    # Pipeline IA + workers BullMQ
│   │       ├── auth/           # JWT + Roles + Guards
│   │       ├── dashboard/      # KPIs y métricas
│   │       ├── fine-tuning/    # Export JSONL + activación modelos
│   │       ├── notifications/  # 🆕 Push real (Expo API) + in-app
│   │       ├── orcid/          # OAuth ORCID
│   │       ├── plagiarism/     # 🆕 pgvector + Copyleaks provider
│   │       ├── prisma/         # PrismaService
│   │       ├── programs/       # Programas académicos
│   │       ├── references/     # CrossRef API
│   │       ├── reports/        # PDF (Puppeteer + Handlebars)
│   │       ├── review/         # Revisión humana + FineTuningPair
│   │       ├── settings/       # SystemSettings (modelo activo)
│   │       ├── storage/        # MinIO S3
│   │       ├── templates/      # Documentos patrón
│   │       └── users/          # CRUD usuarios
│   │
│   └── mobile/                 # 🆕 Expo SDK 52 — App Móvil
│       ├── App.tsx             # Entry point (QueryClient + NavigationContainer)
│       ├── app.json            # Expo config (notifications, deep linking)
│       └── src/
│           ├── constants/      # Colors, Spacing, BorderRadius
│           ├── hooks/          # useAuth, useAdvances, useFindings, useNotifications
│           ├── navigation/     # RootNavigator + BottomTabNavigator (5 tabs)
│           ├── screens/
│           │   ├── auth/       # LoginScreen
│           │   ├── home/       # HomeScreen (KPIs + último avance)
│           │   ├── history/    # GradeHistoryScreen (gráfico línea)
│           │   ├── profile/    # ProfileScreen
│           │   ├── reports/    # ReportsScreen (descarga PDF)
│           │   └── reviews/    # ReviewsList + FindingDetail + FindingItemDetail
│           ├── services/       # api.ts (Axios + interceptor JWT)
│           └── store/          # authStore.ts (Zustand + SecureStore)
│
├── packages/
│   ├── database/               # Prisma schema + migrations + seeds
│   │   └── prisma/schema.prisma  # 15+ modelos: User, Advance, AIAnalysis, etc.
│   ├── ai-engine/              # Pipeline IA compartido
│   │   └── src/pipeline/analysis.pipeline.ts
│   └── shared-types/           # TypeScript types compartidos
│
├── docker-compose.yml          # PostgreSQL+pgvector, Redis, MinIO, API, Web
├── turbo.json
├── setup.ps1                   # Script de setup automático
└── .env.example
```

---

## 🚀 Instalación y Ejecución

### Prerequisitos

- **Node.js >= 20** (recomendado: 22 LTS)
- **Docker Desktop** con Docker Compose v2
- **API Key de IA** (opcional): OpenAI, Gemini o Groq *(el sistema funciona sin una en modo simulación)*

---

### ⚡ Opción 1: Setup Automático (Recomendado)

Ejecuta el script de configuración que hace **todo** en el orden correcto:

```powershell
.\setup.ps1
```

El script:
1. Copia `.env.example` → `.env`
2. Levanta todos los contenedores Docker
3. Espera que PostgreSQL esté healthy
4. Instala dependencias npm
5. Genera el cliente Prisma
6. Sincroniza el esquema con pgvector
7. Siembra usuarios y datos de prueba

Al finalizar verás las URLs y credenciales listas.

> [!NOTE]
> El backend tarda ~2 minutos en compilar la primera vez. Monitorea con:
> ```bash
> docker compose logs -f api
> ```

---

### 🔧 Opción 2: Setup Manual (paso a paso)

```powershell
# 1. Variables de entorno
Copy-Item .env.example .env
Copy-Item -Path .env -Destination packages/database/.env

# 2. Levantar infraestructura (PostgreSQL, Redis, MinIO)
docker compose up -d postgres redis minio

# 3. Esperar ~15 segundos a que Postgres esté healthy
Start-Sleep 15

# 4. Instalar dependencias del monorepo
npm install

# 5. Generar cliente Prisma (para host Windows)
npm run db:generate

# 6. Crear tablas y extensión pgvector
npm run db:push

# 7. Sembrar datos de prueba
npm run db:seed
```

> [!TIP]
> **⚠️ Docker Desktop en Windows es lento para desarrollo.** El bind mount (montar `.:/app`) para web y API dentro de Docker tiene un overhead de 10-100x en operaciones de archivos debido a la virtualización NTFS → VM Linux.
>
> Para **desarrollo diario**, corre web y API fuera de Docker (directo en Windows) y solo dockeriza los servicios de infraestructura:
>
> ```bash
> # Terminal 1 — Solo servicios (PostgreSQL, Redis, MinIO)
> docker compose up -d postgres redis minio
>
> # Terminal 2 — API (directo en Windows, sin VM)
> npm run dev --workspace=@kimy/api
>
> # Terminal 3 — Web (directo en Windows)
> npm run dev --workspace=@kimy/web
> ```
>
> Esto es **5-10x más rápido** que ejecutar todo dentro de Docker en Windows.

---

### 📱 Opción 3: Levantar App Móvil (Expo)

La app móvil se ejecuta **independientemente** de Docker.

```bash
# 1. Instalar dependencias de la app móvil
cd apps/mobile
npm install

# 2. Iniciar servidor de desarrollo Expo
npx expo start

# Opciones:
# - Escanear QR con Expo Go (Android/iOS)
# - Presionar 'a' para Android emulator
# - Presionar 'i' para iOS simulator
# - Presionar 'w' para abrir en browser
```

> [!IMPORTANT]
> Asegúrate de que el backend esté corriendo antes de usar la app móvil.
>
> **Configuración de URL del API:**
> - Por defecto la app conecta a `http://192.168.1.41:3001` (configurado en `apps/mobile/app.json`).
> - Si usas un dispositivo físico en la misma red WiFi, actualiza `extra.apiUrl` en `apps/mobile/app.json` con la IP local de tu máquina.
> - Si usas solo el emulador/simulador, cambia a `http://localhost:3001`.
>
> **Solución de errores comunes:**
> - Error *"Credenciales incorrectas"* en móvil pero funciona en web → Verifica que el campo `accessToken` en `apps/mobile/src/hooks/useAuth.ts` coincida con lo que devuelve la API (camelCase, no snake_case).

---

### 🌐 URLs del Sistema

| Servicio | URL | Notas |
|----------|-----|-------|
| **Frontend Web** | http://localhost:3000 | Next.js 15 |
| **API REST** | http://localhost:3001 | NestJS |
| **Swagger / OpenAPI** | http://localhost:3001/api/docs | Documentación interactiva |
| **MinIO Console** | http://localhost:9001 | Storage S3 |
| **PostgreSQL** | `localhost:5434` | ⚠️ Puerto 5434 (no 5432) |
| **Redis** | `localhost:6379` | BullMQ |

> [!IMPORTANT]
> PostgreSQL en Docker mapea al puerto **`5434`** (no al 5432 estándar). El archivo `.env.example` ya está configurado correctamente.

---

### 🔑 Credenciales de Prueba

Contraseña para todos los usuarios: **`Kimy2026!`**

| Rol | Email |
|-----|-------|
| **Administrador** | `admin@kimy.edu` / `ayrton@kimy.edu` |
| **Coordinador** | `coordinador@kimy.edu` |
| **Asesor** | `asesor1@kimy.edu` / `asesor2@kimy.edu` |
| **Estudiante** | `estudiante1@kimy.edu` / `estudiante2@kimy.edu` / `estudiante3@kimy.edu` |

---

## 📐 Arquitectura

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Next.js 15 Web    │────▶│   NestJS API     │────▶│  PostgreSQL  │
│   (port 3000)       │     │   (port 3001)    │     │  + pgvector  │
└─────────────────────┘     └──────┬───────────┘     └──────────────┘
                                   │
         ┌─────────────────────────┤
         │                         │
┌────────▼────────┐      ┌─────────▼────────┐
│  Expo App Móvil │      │   BullMQ Workers │
│  (estudiantes)  │      │   (Redis)        │
└─────────────────┘      └─────────┬────────┘
                                   │
            ┌──────────────────────┼────────────────────┐
            ▼                      ▼                    ▼
     ┌────────────┐        ┌────────────┐       ┌────────────┐
     │  OpenAI /  │        │  CrossRef  │       │   MinIO    │
     │ Groq/Gemini│        │    API     │       │    S3      │
     └────────────┘        └────────────┘       └────────────┘
            │
     ┌──────▼──────┐
     │ Expo Push   │
     │    API      │
     └─────────────┘
```

---

## 🤖 Pipeline de Análisis IA

Al cargar un avance, se ejecuta automáticamente:

```
Avance (DOCX/PDF)
       │
       ▼
1. EXTRACCIÓN     → mammoth.js (DOCX) / pdf-parse (PDF)
       │
       ▼
2. CHUNKING       → RecursiveCharacterTextSplitter (~1500 tokens)
       │
       ▼
3. EMBEDDINGS     → text-embedding-3-large → almacena en pgvector
       │
       ├──────────────────────────────────────────────────┐
       ▼                                                  ▼
4. ANÁLISIS IA                                   DETECCIÓN PLAGIO
   GPT-4o (modelo activo*)                       pgvector <=> coseno
   ├── Evaluación estructura (30%)               + Copyleaks API (opcional)
   ├── Evaluación contenido  (40%)
   ├── Evaluación forma      (20%)               VALIDACIÓN CITAS
   └── Evaluación originalidad(10%)              CrossRef API
       │                                         (verified/partial/hallucinated)
       ▼
5. OUTPUT
   ├── Score por dimensión + nota decimal
   ├── Hallazgos (descripción, instrucción, ejemplo, severidad)
   └── Resumen ejecutivo IA
       │
       ▼
6. NOTIFICACIÓN PUSH → Expo Push API → App Móvil (estudiante)
```

> *El modelo activo se lee dinámicamente desde `SystemSettings.aiModel`, lo que permite activar modelos fine-tuneados sin reiniciar el servidor.

---

## 📊 Módulos del Sistema

| # | Módulo | Descripción | Roles |
|---|--------|-------------|-------|
| 1 | **Auth** | JWT + Roles (4 niveles) + recuperación contraseña | Todos |
| 2 | **Documentos Patrón** | Upload y versionado de templates institucionales | COORD / ADMIN |
| 3 | **Dashboard** | KPIs, alertas, concordancia IA-Humano | ADVISOR+ |
| 4 | **Avances** | Upload DOCX/PDF, versionado, previsualización | Todos |
| 5 | **Análisis IA** | Pipeline automatizado (análisis + plagio + citas) | Auto |
| 6 | **Revisión** | Panel lado a lado, feedback humano → FineTuningPair | ADVISOR+ |
| 7 | **Revisión Masiva** | 🆕 Análisis por lotes con progreso en tiempo real | COORD / ADMIN |
| 8 | **Plagio** | pgvector coseno + Copyleaks API configurable | ADVISOR+ |
| 9 | **Referencias** | CrossRef API con rate limiting (1 req/seg) | Auto |
| 10 | **ORCID** | OAuth 2.0 + publicaciones + validación expertise | ADVISOR |
| 11 | **Reportes** | PDF con membrete, plagio, citas, evaluación completa | Todos |
| 12 | **Estadísticas** | Gráficos radar, histograma, concordancia IA | ADVISOR+ |
| 13 | **Fine-tuning** | Export JSONL + activación de modelos en producción | ADMIN |
| 14 | **Notificaciones** | 🆕 Push real (Expo API) + in-app | Todos |
| 15 | **App Móvil** | 🆕 Dashboard, hallazgos, notas, PDF download | STUDENT |

---

## 🧠 Pipeline de Fine-Tuning

El sistema acumula correcciones de asesores para mejorar el modelo de IA continuamente.

### 1. Acumulación automática

Cada vez que un asesor acepta con edición, modifica o rechaza un hallazgo, se crea un `FineTuningPair` automáticamente.

### 2. Exportar dataset JSONL (requiere 500+ pares)

```bash
# Via API (recomendado):
curl -X POST http://localhost:3001/api/fine-tuning/export \
  -H "Authorization: Bearer <admin-token>"

# Via script directo:
npx tsx packages/database/export-finetune.ts
```

### 3. Entrenar en OpenAI

```bash
# Subir el archivo JSONL
curl https://api.openai.com/v1/files \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F purpose="fine-tune" \
  -F file="@finetuning-dataset.jsonl"

# Crear el job de fine-tuning
curl https://api.openai.com/v1/fine_tuning/jobs \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "training_file": "<file_id_del_paso_anterior>",
    "model": "gpt-4o-mini-2024-08-06"
  }'
```

### 4. Activar el modelo fine-tuneado (sin reiniciar el servidor)

```bash
# Activar — el próximo análisis usará este modelo
curl -X POST http://localhost:3001/api/fine-tuning/datasets/<dataset-id>/activate \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"modelId": "ft:gpt-4o-mini-2024-08-06:tu-org:kimy:xxxxxxx"}'

# Verificar modelo activo
curl http://localhost:3001/api/fine-tuning/active-model \
  -H "Authorization: Bearer <admin-token>"

# Desactivar (restaurar modelo base)
curl -X POST http://localhost:3001/api/fine-tuning/deactivate \
  -H "Authorization: Bearer <admin-token>"
```

> [!NOTE]
> El modelo activo se guarda en `SystemSettings.aiModel` en la base de datos.
> El servicio de análisis lo lee en cada request, sin necesidad de reiniciar el servidor.

---

## 📄 Configuración del Documento Patrón

### 1. Subir un Documento Patrón

1. Inicia sesión como **Coordinador** o **Administrador**
2. Ve a **Dashboard → Doc. Patrón → Nueva Plantilla**
3. Selecciona el archivo (PDF o DOCX, máximo 50MB)
4. Ingresa nombre y versión (ej: `Tesis Maestría v2.0`)
5. Selecciona el programa académico y el estilo de citas (APA/Vancouver)

### 2. Extracción automática de estructura

Al subir, el sistema ejecuta el `STRUCTURE_PROMPT` de `packages/ai-engine/src/prompts.ts` para extraer el esquema JSON:

```json
{
  "sections": [
    {"name": "CAPÍTULO I: INTRODUCCIÓN", "level": 1, "required": true, "estimatedWords": 3000},
    {"name": "PLANTEAMIENTO DEL PROBLEMA", "level": 2, "required": true}
  ],
  "citationStyle": "APA",
  "writingStyle": "Académico formal"
}
```

### 3. Pesos de evaluación por dimensión

| Dimensión | Peso Default |
|-----------|-------------|
| Estructura | 30% |
| Contenido | 40% |
| Forma | 20% |
| Originalidad | 10% |

---

## 🔗 Integración ORCID

### 1. Configuración

```env
# .env
ORCID_CLIENT_ID=APP-XXXXXXXXXXXXXXXXX
ORCID_CLIENT_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> Sandbox: https://sandbox.orcid.org — Producción: https://orcid.org

### 2. Flujo de vinculación

1. Asesor → **Mi Perfil → Vincular ORCID**
2. Redirige a `GET /api/orcid/authorize` → OAuth ORCID
3. Callback en `GET /api/orcid/callback` → obtiene token
4. El sistema sincroniza: nombre, afiliación, publicaciones (título, año, DOI, journal)

### 3. Validación de expertise

El sistema compara semánticamente las publicaciones ORCID del asesor con el título de la tesis supervisada mediante embeddings. Si la similitud es baja (< 60%), el coordinador recibe una alerta.

---

## 🔍 Configuración Copyleaks (Opcional)

Copyleaks complementa la detección interna de plagio con análisis contra internet y repositorios académicos.

### Activar

```env
# .env
COPYLEAKS_ACCESS_TOKEN=tu-token-de-copyleaks
COPYLEAKS_EMAIL=tu-email@ejemplo.com
```

> [!TIP]
> **Sin Copyleaks**, el sistema ya detecta similitud intra-programa con pgvector (`<=>` coseno, umbral 85%). Copyleaks agrega detección externa (internet, repositorios académicos).

### Tabla comparativa

| Método | Cobertura | Umbral | Costo |
|--------|-----------|--------|-------|
| pgvector (interno) | Avances del mismo programa | > 85% similitud coseno | Gratis |
| Copyleaks API | Internet + repositorios académicos | Configurable | API calls |

El proveedor se activa automáticamente si `COPYLEAKS_ACCESS_TOKEN` está configurado.

---

## 📡 Referencia de API

Documentación completa interactiva: **http://localhost:3001/api/docs**

### Endpoints principales

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| POST | `/api/auth/login` | Login JWT | Público |
| GET | `/api/advances` | Listar avances del usuario | JWT |
| POST | `/api/advances` | Subir nuevo avance | JWT |
| GET | `/api/ai-analysis/:advanceId` | Obtener análisis IA | JWT |
| POST | `/api/ai-analysis/:id/analyze` | Solicitar análisis | JWT |
| POST | `/api/review/finding/:id/feedback` | Feedback humano | ADVISOR |
| GET | `/api/orcid/authorize` | Iniciar OAuth ORCID | ADVISOR |
| POST | `/api/fine-tuning/export` | Exportar dataset JSONL | ADMIN |
| POST | `/api/fine-tuning/datasets/:id/activate` | 🆕 Activar modelo fine-tuneado | ADMIN |
| POST | `/api/fine-tuning/deactivate` | 🆕 Desactivar modelo fine-tuneado | ADMIN |
| GET | `/api/fine-tuning/active-model` | 🆕 Modelo activo actual | ADMIN |
| POST | `/api/notifications/push-token` | 🆕 Registrar token push móvil | JWT |
| GET | `/api/reports/advance/:id/pdf` | Descargar acta PDF | JWT |

### Roles y permisos

| Rol | Avances | Revisión | Dashboard | Fine-tuning | Admin |
|-----|---------|----------|-----------|-------------|-------|
| **Estudiante** | Propios | Ver resultados | Limitado | ✗ | ✗ |
| **Asesor** | Sus estudiantes | Revisar + feedback | Completo | ✗ | ✗ |
| **Coordinador** | Todo el programa | Todo | Completo + bulk | ✗ | ✗ |
| **Administrador** | Todo | Todo | Completo | ✓ | ✓ |

---

## 🔧 Scripts de Utilidad

```bash
# ─── Base de Datos ────────────────────────────────────────────────
# Regenerar cliente Prisma
npm run db:generate

# Reset completo de la base de datos
npm run db:push -- --force && npm run db:seed

# Abrir Prisma Studio (UI visual)
npm run db:studio

# ─── Fine-tuning ──────────────────────────────────────────────────
# Exportar dataset JSONL para fine-tuning
npx tsx packages/database/export-finetune.ts

# Ver pares acumulados
npx tsx packages/database/check_latest_analysis.ts

# ─── App Móvil ────────────────────────────────────────────────────
cd apps/mobile
npm install          # Primera vez
npx expo start       # Modo desarrollo
npx expo start --clear   # Limpiar caché

# ─── Docker ───────────────────────────────────────────────────────
# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f api
docker compose logs -f web
docker compose logs -f postgres

# Reiniciar solo el backend
docker compose restart api

# Parar todo
docker compose down

# Parar y eliminar volúmenes (⚠️ borra los datos)
docker compose down -v

# Limpiar recursos Docker huérfanos (libera GB de disco)
docker system prune -a --volumes

# ─── Desarrollo optimizado (Windows) ─────────────────────────────
# Solo infraestructura en Docker (más rápido que todo en Docker)
docker compose up -d postgres redis minio

# API directo en Windows (5-10x más rápido)
npm run dev --workspace=@kimy/api

# Web directo en Windows (5-10x más rápido)
npm run dev --workspace=@kimy/web

# ─── Backup ───────────────────────────────────────────────────────
docker compose exec postgres pg_dump -U kimy kimy_thesis > backup_$(date +%Y%m%d).sql
```

---

## 🚨 Solución de Problemas

### Error: `@prisma/client did not initialize yet`

**Causa:** Binarios de Prisma generados en Windows no son compatibles con Linux (Docker).

```bash
docker compose exec api npm run db:generate
docker compose restart api
```

### Error: `DATABASE_URL not found`

```powershell
Copy-Item -Path .env -Destination packages/database/.env
npm run db:push
```

### Error: `ECONNREFUSED` en Redis

```bash
docker compose up -d redis
```

### Error: `401 Unauthorized` en análisis IA

1. Verifica en `.env`: `OPENAI_API_KEY=sk-...`
2. El sistema activa **modo simulación** automáticamente si no hay API key válida
3. Alternativas gratuitas: `GEMINI_API_KEY` o `GROQ_API_KEY`

### Error: `Connection refused` en MinIO

```bash
docker compose up -d minio
# Acceder a http://localhost:9001 y crear el bucket 'thesis-documents'
```

### Avance se queda en `AI_PROCESSING`

```bash
# Revisar logs del worker de IA
docker compose logs -f api | grep "ai-analysis"

# Re-intentar el análisis via API
curl -X POST http://localhost:3001/api/ai-analysis/<advance-id>/reanalyze \
  -H "Authorization: Bearer <token>"
```

### App Móvil no conecta al backend

1. Verifica que Docker esté corriendo: `docker compose ps`
2. Si usas dispositivo físico, cambia `EXPO_PUBLIC_API_URL=http://<IP-LOCAL>:3001` en `.env`
3. Limpia caché de Expo: `npx expo start --clear`

### El sitio web carga muy lento en desarrollo

**Causa:** Docker Desktop en Windows tiene un cuello de botella con bind mounts. Cada operación de archivos (file watching de Next.js, compilación, hot reload) es 10-100x más lenta.

**Solución:** Corre web y API fuera de Docker (ver tip en Opción 2 arriba).

```bash
# Solo infraestructura en Docker
docker compose up -d postgres redis minio

# API y Web directo en Windows
npm run dev --workspace=@kimy/api
npm run dev --workspace=@kimy/web
```

Si no ves mejora, revisa el uso de recursos:
```bash
docker stats  # Web no debería usar >500MB RAM
docker system df  # Limpia con: docker system prune -a --volumes
```

### Error: `pgvector operator <=> not found`

```sql
-- Ejecutar en Prisma Studio o psql:
CREATE EXTENSION IF NOT EXISTS vector;
```

### Error: `ORCID callback failed`

1. Verifica `ORCID_CLIENT_ID` y `ORCID_CLIENT_SECRET` en `.env`
2. El `redirect_uri` debe ser exactamente: `http://localhost:3001/api/orcid/callback`
3. Para producción, usa credenciales de ORCID production (no sandbox)

### Error push notifications no llegan

1. Push notifications reales requieren dispositivo físico (no simulador)
2. Verifica que el token se registre: `POST /api/notifications/push-token`
3. Los tokens deben tener formato `ExponentPushToken[...]`
4. Para producción se requiere EAS (Expo Application Services)

---

## 🧱 Decisiones de Arquitectura

| Decisión | Opción elegida | Razón |
|----------|---------------|-------|
| Monorepo | Turborepo | Pipeline de build compartido entre web, api y packages |
| Embeddings | pgvector (PostgreSQL) | Evita servicio adicional; excelente para < 1M vectores |
| Colas | BullMQ + Redis | Workers independientes y escalables horizontalmente |
| Fine-tuning | OpenAI Fine-Tuning API | Mejor calidad para evaluación académica estructurada |
| Push | Expo Push API | Compatible con iOS + Android sin servidores propios |
| Storage | MinIO | S3-compatible, self-hosted, sin costo de nube |
| IA Fallback | Groq → Gemini → Simulación | Alta disponibilidad sin interrumpir el flujo del usuario |
| Modelo activo | SystemSettings en BD | Permite A/B testing sin reiniciar servicios |

---

## 📝 Licencia

Proyecto académico — LAB01 HLJA — Universidad Nacional de Trujillo — 2026
