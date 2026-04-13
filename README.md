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
- **Borde de búsqueda dinámico**: El input de búsqueda reacciona visualmente cuando contiene texto, mostrando un borde inferior azul grueso como indicador de filtro activo.

### 📊 Diagrama de Gantt Dinámico (Estilo Odoo)
- **Agrupación Multifactor**: Visualiza el cronograma agrupado por **Etapa**, **Estado** o **Operario Responsable**.
- **Interacción Directa**: Modifica fechas arrastrando barras de tareas o ensambles directamente en el diagrama.
- **Sincronización Total**: Cualquier cambio en el Kanban (marcar como listo, cambiar progreso) se refleja al instante en el Gantt.
- **Control de Zoom (+ / −)**: Botones `ZoomIn` y `ZoomOut` que ajustan la escala temporal del diagrama entre **30%** y **300%**, con botón de reset al 100%.
- **Enfoque automático**: Al cargar el gráfico, la vista se centra en la fecha de inicio de la primera tarea, eliminando meses vacíos anteriores al proyecto.
- **Modos de vista**: Hora, Día, Semana y Mes con reset de zoom automático al cambiar de modo.
- **Leyenda visual**: Código de colores para Ensamble, En Proceso, Listo, Cambios y Bloqueado/Pendiente.

### ⚙️ Motor de Programación Inteligente (TimeEngine)
- **Calendario laboral configurable**: Horarios de trabajo con validez por fechas (`validFrom`) y festivos por proyecto.
- **Cálculo de fechas en horas laborables**: Suma de horas de trabajo reales respetando turnos y festivos, nunca en horas de calendario.
- **Jornada laboral estándar**: Toda fecha de inicio calculada por el sistema se normaliza a las **08:00 AM** del primer día laborable válido.
- **Programación por dependencias (auto-scheduling)**: Al seleccionar piezas predecesoras en los modales de creación o edición, el sistema calcula automáticamente la **fecha de inicio como el siguiente día laborable** tras la finalización del predecesor más tardío. La fecha de fin se recalcula preservando las horas estimadas.
- **Propagación en cascada (BFS)**: Al mover las fechas de una tarea en el Gantt, se propagan automáticamente los cambios a todas sus sucesoras mediante un algoritmo **Breadth-First Search** anti-cíclico. Reglas aplicadas:
  - Las tareas con estado `HECHO` o `CANCELADO` no se mueven.
  - Las sucesoras con múltiples predecesores esperan al **más tardío de todos**.
  - Usa `knownEnds` en memoria para una propagación coherente sin consultas extra.

### 🗂️ Gestión de Proyectos
- **Cambio de fecha de inicio del proyecto**: Botón elegante junto a "Gestionar Etapas" que muestra la fecha actual y permite modificarla.
- **Desplazamiento inteligente de tareas**: Al cambiar la fecha de inicio del proyecto, las tareas se desplazan respetando el tipo de tarea:
  - **Fabricación**: Desplazamiento por delta de horas laborales con normalización de turnos.
  - **Pedido Externo**: Desplazamiento de inicio con preservación de días naturales de entrega.
  - **Tareas con progreso > 0%**: No se desplazan (trabajo ya en curso).

### 📦 Catálogo de Máquinas y Despiece
- **Árbol de piezas jerárquico**: Visualización recursiva de ensambles con sub-piezas y operaciones.
- **Buscador recursivo**: Filtra piezas y ensambles con búsqueda **insensible a tildes y mayúsculas**, resaltando matches con animación sutil.
- **Paginación**: Vista paginada de 15 elementos para proyectos con grandes despieces.
- **Importación desde Excel**: Carga masiva de la estructura de piezas y operaciones, calculando automáticamente tiempos, fechas y cadenas de dependencias.

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
│   └── catalog/            # Gestión del catálogo de máquinas
├── components/
│   ├── gantt/              # GanttChart.tsx con zoom y agrupación
│   ├── kanban/             # KanbanBoard, CreateTaskModal, TaskDetailModal
│   └── layout/             # ProjectSelector, Sidebar, Header
└── lib/
    ├── time-engine.ts       # Motor central de cálculo de horas laborales
    ├── actions/
    │   ├── tasks.ts         # CRUD + BFS cascade de tareas
    │   ├── projects.ts      # Gestión y desplazamiento de proyectos
    │   └── time.ts          # Server Actions del TimeEngine expuestas al cliente
    └── prisma.ts            # Singleton del cliente Prisma
```

---

## 👨‍💻 Desarrollo

El proyecto sigue estándares de **Código Limpio** y **Seguridad (OWASP)**. Las contribuciones deben mantener el tipado estricto de TypeScript y la arquitectura de componentes del servidor.

---
*Desarrollado con ❤️ para Joaquin Palacin.*
