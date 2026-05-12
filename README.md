# 🏗️ Joaquin Palacin Project Manager

Una plataforma de gestión de proyectos industrial y logística de alto rendimiento, diseñada para la máxima eficiencia en el seguimiento de ensambles, piezas y tiempos.

![Next.js 15](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=for-the-badge&logo=tailwind-css)

---

## 🚀 Funcionalidades Principales

### 📋 Tablero Kanban Avanzado
- **Gestión de Sub-tareas**: Seguimiento detallado de piezas dentro de grandes ensambles con barras de progreso reactivas.
- **Drag & Drop Fluido**: Movimiento intuitivo de tareas entre etapas con sincronización de estado automática.
- **Filtros Inteligentes**: Buscador integrado con búsqueda **insensible a tildes y mayúsculas** (normalización NFD), y filtrado por estado operativo en tiempo real.
- **Creación Contextual**: Botones rápidos por columna que pre-seleccionan la etapa del flujo.
- **Doble Modal Adaptativo**: El modal de edición de tarea se adapta al tipo de pieza:
  - **Fabricación Taller**: Muestra *Horas Totales* con cálculo de horas unitarias y botón de calcular desde fechas.
  - **Pedido Externo**: Muestra *Semanas Entrega* calculando automáticamente la fecha de fin por días naturales.
- **Sistema Dual Taller / Externo**: Conversión automática bidireccional al cambiar de etapa:
  - Taller → Externo: calcula semanas desde las fechas existentes.
  - Externo → Taller: calcula horas estimadas (~8h/día) desde las fechas.
- **Validaciones completas**: Nombre, fechas, horas y cantidad obligatorios. Inputs numéricos con control de decimales.
- **Etapas especializadas**: `Planeación y Diseño`, `Ensambles Taller`, `Fabricación Taller`, `Terminado Taller`, `Pedido Externo`, `Entregado Externo`.

### 🧾 Gestión de Materiales por Tarea
- **Lista de Materiales Requeridos**: Añadir, eliminar y visualizar materiales con cantidad por unidad y tipo de unidad.
- **Buscador de materiales**: Selección rápida desde el catálogo maestro con filtro insensible a tildes.
- **Sincronización con Catálogo**: Botón para guardar la lista de materiales de la tarea en la pieza del catálogo maestro.
- **Descarga Excel**: Exportación del despiece de materiales a archivo Excel.
- **Catálogo de Materiales y Unidades**: Gestión independiente con vista paginada (6 por página), búsqueda y CRUD completo.

### 📊 Diagrama de Gantt Dinámico (Estilo Odoo)
- **Agrupación Multifactor**: Visualiza el cronograma agrupado por **Etapa**, **Estado** o **Operario Responsable**.
- **Interacción Directa**: Modifica fechas arrastrando barras de tareas o ensambles directamente en el diagrama.
- **Sincronización Total**: Cualquier cambio en el Kanban (marcar como Terminado, cambiar progreso) se refleja al instante en el Gantt.
- **Control de Zoom (+ / −)**: Botones `ZoomIn` y `ZoomOut` que ajustan la escala temporal del diagrama entre **30%** y **300%**, con botón de reset al 100%.
- **Enfoque automático**: Al cargar el gráfico, la vista se centra en la fecha de inicio de la primera tarea, eliminando meses vacíos anteriores al proyecto.
- **Modos de vista**: Hora, Día, Semana y Mes con reset de zoom automático al cambiar de modo.
- **Leyenda visual**: Código de colores para Ensamble, En Proceso, Terminado, Cambios y Bloqueado/Pendiente.

### ⚙️ Motor de Programación Inteligente (TimeEngine)
- **Calendario laboral configurable**: Horarios de trabajo con validez por fechas (`validFrom`) y festivos por proyecto.
- **Temporadas con días diferenciados**: Múltiples horarios en el mismo rango de fechas (ej: Lun-Vie 8-14/16-18 + Sáb 9-13) sin conflictos de solapamiento.
- **Cálculo de fechas en horas laborables**: Suma de horas de trabajo reales respetando turnos y festivos, nunca en horas de calendario.
- **Jornada laboral estándar**: Toda fecha de inicio calculada por el sistema se normaliza a las **08:00 AM** del primer día laborable válido.
- **Doble Motor de Cálculo**:
  - **Fabricación Taller**: TimeEngine interno con jornada laboral y festivos de empresa.
  - **Pedido Externo**: Calendario de proveedores con días naturales (Lun-Dom), exclusión de agosto, y normalización de Sáb/Dom al Lunes siguiente.
- **Programación por dependencias (auto-scheduling)**: Al seleccionar piezas predecesoras en los modales de creación o edición, el sistema calcula automáticamente la **fecha de inicio como el siguiente día laborable** tras la finalización del predecesor más tardío. La fecha de fin se recalcula preservando las horas estimadas.
- **Propagación en cascada (BFS)**: Al mover las fechas de una tarea en el Gantt, se propagan automáticamente los cambios a todas sus sucesoras mediante un algoritmo **Breadth-First Search** anti-cíclico. Reglas:
  - Las tareas con estado `HECHO` o `CANCELADO` no se mueven.
  - Las sucesoras con múltiples predecesores esperan al **más tardío de todos**.
  - Pedidos externos usan `addCalendarDays` en vez de horas laborables.
  - Usa `knownEnds` en memoria para una propagación coherente sin consultas extra.

### 🗓️ Gestión de Festivos Avanzada
- **4 modos de creación**:
  - **Día único**: Una fecha concreta.
  - **Rango de fechas**: Desde/Hasta con selección de calendario.
  - **Días sueltos**: Mini calendario interactivo con meses colapsables. Selección múltiple de días individuales navegando entre años.
  - **Meses completos**: Selección de meses enteros de 3 años visibles.
- **Creación masiva**: Todos los modos crean múltiples festivos en lote.
- **Paginación**: 16 festivos por página con navegación.

### 🗂️ Gestión de Proyectos
- **Cambio de fecha de inicio del proyecto**: Botón elegante junto a "Gestionar Etapas" que muestra la fecha actual y permite modificarla.
- **Desplazamiento inteligente de tareas**: Al cambiar la fecha de inicio del proyecto, las tareas se desplazan respetando el tipo de tarea:
  - **Fabricación**: Desplazamiento por delta de horas laborales con normalización de turnos.
  - **Pedido Externo**: Desplazamiento de inicio con preservación de días naturales de entrega.
  - **Tareas con progreso > 0%**: No se desplazan (trabajo ya en curso).

### 📦 Catálogo de Máquinas y Despiece
- **Árbol de piezas jerárquico**: Visualización recursiva de ensambles con sub-piezas y operaciones.
- **Filtro por tipo**: Toggle **Todas / Taller / Externas** para organizar el despiece.
- **Tarjetas informativas**: Cada pieza muestra cantidad, horas o semanas según su tipo, badge de "Pedido Externo" cuando corresponde.
- **Modal de creación dual**: Toggle *Fabricación Taller* / *Pedido Externo* con inputs adaptativos (horas o semanas).
- **Modal de edición dual**: Permite cambiar el tipo de pieza entre taller y externo, ajustando horas/semanas automáticamente.
- **Cantidad entera**: Cantidad en unidades sin decimales, Horas/Semanas con 1 decimal (acepta `.` y `,`).
- **Buscador recursivo**: Filtra piezas y ensambles con búsqueda **insensible a tildes y mayúsculas**, resaltando matches con animación sutil.
- **Paginación**: Vista paginada de 15 elementos para proyectos con grandes despieces.
- **Importación desde Excel**: Carga masiva de la estructura de piezas y operaciones con modal para nombrar la máquina. Respeta la etapa de cada pieza (Taller, Externo, Ensambles). Calcula automáticamente tiempos, fechas y cadenas de dependencias.

### 🔄 Sincronización Maestra
- **Sincronizar Horas**: Guarda el tiempo real de la tarea en el `CatalogPart` del catálogo maestro.
- **Sincronizar Materiales**: Copia la lista de materiales de la tarea hacia la pieza del catálogo.
- **Sincronizar Etapa**: Al sincronizar, actualiza también el tipo de pieza en el catálogo (*Fabricación Taller* o *Pedido Externo*).

### 🔐 Seguridad y Arquitectura
- **Stack Moderno**: Implementado sobre **Next.js 15 App Router** y **React 19** con Server Components por defecto.
- **Acciones Seguras**: Validación de esquemas con **Zod** en todas las Server Actions.
- **Base de Datos Robusta**: Integración con PostgreSQL mediante **Prisma ORM**.
- **UI Premium**: Componentes de alta calidad con **Shadcn UI** y **Tailwind CSS v4**.
- **Compatibilidad con túneles de desarrollo**: Configuración para GitHub Dev Tunnels y similares mediante `allowedOrigins` en `next.config.ts`.

---

## 🛠️ Instalación y Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/criss717/SAAS-Joaquin-palacin.git
   cd SAAS-Joaquin-palacin
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   Crea un archivo `.env` en la raíz (usa `.env.example` como guía):
   ```env
   DATABASE_URL="vuestra-url-de-base-de-datos"
   NEXTAUTH_SECRET="tu-secret"
   NEXTAUTH_URL="http://localhost:3000"
   ```

4. **Preparar la base de datos:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Ejecutar en desarrollo:**
   ```bash
   npm run dev
   ```

---

## 🗂️ Arquitectura Técnica

```
src/
├── app/                    # Next.js App Router (páginas y layouts)
│   ├── gantt/              # Vista de Gantt + Kanban del proyecto
│   ├── catalog/            # Gestión del catálogo de máquinas
│   │   └── [id]/           # Detalle de máquina con despiece
│   └── admin/
│       └── schedule/       # Gestión de horarios y festivos
├── components/
│   ├── gantt/              # GanttChart.tsx con zoom y agrupación
│   ├── kanban/             # KanbanBoard, KanbanColumn, TaskCard, CreateTaskModal, TaskDetailModal, StageManagerModal
│   └── layout/             # ProjectSelector, Sidebar, Header
└── lib/
    ├── time-engine.ts       # Motor de cálculo de horas laborales internas
    ├── external-calendar.ts # Motor de cálculo para pedidos externos (días naturales, sin agosto)
    ├── actions/
    │   ├── tasks.ts         # CRUD + BFS cascade de tareas
    │   ├── catalog.ts       # Import/export Excel, lanzamiento de proyectos, sincronización
    │   ├── catalog-parts.ts # CRUD de piezas, operaciones y materiales del catálogo
    │   ├── projects.ts      # Gestión y desplazamiento de proyectos
    │   ├── schedule.ts      # CRUD de horarios y festivos
    │   └── time.ts          # Server Actions del TimeEngine expuestas al cliente
    ├── utils/
    │   └── excel.ts         # Generación de reportes Excel
    └── prisma.ts            # Singleton del cliente Prisma
```

---

## 👨‍💻 Desarrollo

El proyecto sigue estándares de **Código Limpio** y **Seguridad (OWASP)**. Las contribuciones deben mantener el tipado estricto de TypeScript y la arquitectura de componentes del servidor.

---

*Desarrollado con ❤️ para Joaquin Palacin.*
