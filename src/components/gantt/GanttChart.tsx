"use client";

import { useState } from "react";
import { Gantt, Task, ViewMode } from "@rsagiev/gantt-task-react-19";
import "@rsagiev/gantt-task-react-19/dist/index.css";
import { TaskWithRelations } from "@/lib/actions/tasks";
import { ZoomIn, ZoomOut, Search } from "lucide-react";

type GroupByMode = 'none' | 'stage' | 'status' | 'user';

type Props = {
  tasks: TaskWithRelations[];
  onTaskDatesChange?: (taskId: string, start: Date, end: Date) => void;
  onTaskDoubleClick?: (task: TaskWithRelations) => void;
};

interface GroupedTask extends Task {
  stage?: string;
  status?: string;
  user?: string;
}

/** Convierte tareas de Prisma al formato que espera gantt-task-react */
function toGanttTasks(tasks: TaskWithRelations[], groupBy: GroupByMode): Task[] {
  // 1. Convertir tareas individuales
  const convertedTasks: GroupedTask[] = tasks.map(t => {
    const progress = t.progress;

    let styles = undefined;
    if (t.isAssembly) {
      styles = {
        progressColor: "#a855f7",
        progressSelectedColor: "#9333ea",
        backgroundColor: "#f5f3ff", // Purple 50
        backgroundSelectedColor: "#ede9fe" // Purple 100
      };
    } else {
      switch (t.status) {
        case "HECHO":
          styles = { progressColor: "#22c55e", progressSelectedColor: "#16a34a", backgroundColor: "#f0fdf4" };
          break;
        case "CANCELADO":
          styles = { progressColor: "#94a3b8", progressSelectedColor: "#64748b", backgroundColor: "#f1f5f9" };
          break;
        case "APROBADO":
          styles = { progressColor: "#10b981", progressSelectedColor: "#059669" };
          break;
        case "CAMBIOS_SOLICITADOS":
          styles = { progressColor: "#f59e0b", progressSelectedColor: "#d97706" };
          break;
        case "EN_PROCESO":
        default:
          styles = { progressColor: "#3b82f6", progressSelectedColor: "#2563eb" };
          break;
      }
    }

    return {
      id: t.id,
      name: t.name,
      start: new Date(t.startDate),
      end: new Date(t.endDate),
      type: t.isAssembly ? "project" : "task", // Assemblies as project for auto-resize, leaves as task for dragging
      progress: progress,
      dependencies: t.predecessors.map(p => p.predecessor.id),
      project: groupBy === 'none' ? (t.parentId ?? undefined) : undefined,
      styles: styles,
      stage: t.stage,
      status: t.status,
      user: t.assignees[0]?.name ?? "Sin asignar"
    } as GroupedTask;
  });

  if (groupBy === 'none') return convertedTasks;

  // 2. Agrupación
  const groups: Record<string, GroupedTask[]> = {};
  convertedTasks.forEach(t => {
    let key = "";
    if (groupBy === 'stage') key = t.stage ?? "";
    else if (groupBy === 'status') key = t.status ?? "";
    else if (groupBy === 'user') key = t.user ?? "";

    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const finalTasks: Task[] = [];
  Object.entries(groups).forEach(([groupName, groupTasks]) => {
    const groupId = `group-${groupBy}-${groupName}`;

    // Calcular fechas del grupo
    const groupStart = new Date(Math.min(...groupTasks.map(t => t.start.getTime())));
    const groupEnd = new Date(Math.max(...groupTasks.map(t => t.end.getTime())));

    // Añadir el proyecto del grupo (ahora con colores más vivos)
    finalTasks.push({
      id: groupId,
      name: groupName.toUpperCase(),
      start: groupStart,
      end: groupEnd,
      type: "project",
      progress: groupTasks.reduce((acc, t) => acc + t.progress, 0) / groupTasks.length,
      hideChildren: false,
      styles: {
        progressColor: "transparent",
        progressSelectedColor: "transparent",
        backgroundColor: "transparent",
        backgroundSelectedColor: "transparent",
      }
    });

    // Añadir tareas del grupo
    groupTasks.forEach(t => {
      finalTasks.push({
        ...t,
        project: groupId // Vincular al grupo
      });
    });
  });

  return finalTasks;
}

export function GanttChart({ tasks, onTaskDatesChange, onTaskDoubleClick }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Month);
  const [zoomLevel, setZoomLevel] = useState(0.8);
  const [groupBy, setGroupBy] = useState<GroupByMode>("none");

  const ganttTasks = toGanttTasks(tasks, groupBy);

  const handleTaskChange = async (ganttTask: Task) => {
    // Validar que las fechas son válidas antes de persistir
    if (!ganttTask.start || !ganttTask.end) return
    if (isNaN(ganttTask.start.getTime()) || isNaN(ganttTask.end.getTime())) return
    if (ganttTask.end < ganttTask.start) return

    if (onTaskDatesChange) {
      onTaskDatesChange(ganttTask.id, ganttTask.start, ganttTask.end);
    }
  }

  const handleDblClick = (task: Task) => {
    if (onTaskDoubleClick) {
      const originalTask = tasks.find(t => t.id === task.id);
      if (originalTask) onTaskDoubleClick(originalTask);
    }
  }

  const viewButtons: { label: string; mode: ViewMode }[] = [
    { label: "Hora", mode: ViewMode.Hour },
    { label: "Día", mode: ViewMode.Day },
    { label: "Semana", mode: ViewMode.Week },
    { label: "Mes", mode: ViewMode.Month },
  ];

  const groupButtons: { label: string; mode: GroupByMode }[] = [
    { label: "Sin grupo", mode: "none" },
    { label: "Por Etapa", mode: "stage" },
    { label: "Por Estado", mode: "status" },
    { label: "Por Responsable", mode: "user" },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-gray-50/30">
      {/* Barra de Herramientas */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        {/* Agrupación */}
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
          <span className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Agrupar por:</span>
          {groupButtons.map(({ label, mode }) => (
            <button
              key={mode}
              onClick={() => setGroupBy(mode)}
              className={`px-3 py-1.5 cursor-pointer rounded-lg text-xs font-medium transition-all ${groupBy === mode
                ? "bg-gray-900 text-white shadow-sm ring-1 ring-gray-200"
                : "text-gray-500 hover:bg-gray-50"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Modos de vista */}
        <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
          {viewButtons.map(({ label, mode }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 cursor-pointer rounded-lg text-xs font-medium transition-all ${viewMode === mode
                ? "bg-gray-900 text-white shadow-md"
                : "text-gray-500 hover:bg-gray-50"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Zoom Controls */}
        <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm items-center gap-1">
          <div className="px-2 flex items-center gap-1.5 text-gray-400">
            <Search size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Zoom</span>
          </div>
          <button
            onClick={() => setZoomLevel(prev => Math.max(0.3, prev - 0.1))}
            disabled={zoomLevel <= 0.3}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 cursor-pointer transition-all"
            title="Alejar"
          >
            <ZoomOut size={16} />
          </button>
          <div className="w-10 text-center text-[10px] font-bold text-gray-600">
            {Math.round(zoomLevel * 100)}%
          </div>
          <button
            onClick={() => setZoomLevel(prev => Math.min(3.0, prev + 0.1))}
            disabled={zoomLevel >= 3.0}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 cursor-pointer transition-all"
            title="Acercar"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setZoomLevel(0.5)}
            className="ml-1 px-2 py-1 text-[9px] font-bold text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer transition-all"
          >
            RESET
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mb-6 flex-wrap text-[10px] text-gray-400 font-medium px-2">
        {[
          { color: "bg-purple-500", label: "ENSAMBLE" },
          { color: "bg-blue-500", label: "EN PROCESO" },
          { color: "bg-green-500", label: "LISTO" },
          { color: "bg-amber-500", label: "CAMBIOS" },
          { color: "bg-gray-300", label: "BLOQUEADO/PENDIENTE" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Gantt Container — la librería gestiona su propio scroll interno */}
      <div className="flex-1 min-h-0 border border-gray-200 bg-white shadow-xl">
        {ganttTasks.length > 0 ? (
          <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            onDateChange={handleTaskChange}
            onDoubleClick={handleDblClick}
            locale="es"
            fontFamily="var(--font-outfit), Inter, sans-serif"
            listCellWidth="260px"
            columnWidth={(viewMode === ViewMode.Month ? 300 : viewMode === ViewMode.Week ? 200 : viewMode === ViewMode.Day ? 70 : 60) * zoomLevel}
            headerHeight={50}
            rowHeight={45}
            ganttHeight={typeof window !== "undefined" ? Math.max(300, window.innerHeight - 400) : 560}
            barCornerRadius={6}
            handleWidth={8}
            preStepsCount={viewMode === ViewMode.Hour || viewMode === ViewMode.Day ? 2 : 0}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm italic">
            No hay tareas para mostrar en el Gantt
          </div>
        )}
      </div>

      {/* CSS Overrides para renombrar headers y centrar contenido */}
      <style jsx global>{`
        /* Usar los selectores hash de la librería para que funcione sí o sí */
        
        /* Centrado general de cabeceras y celdas */
        ._WuQ0f, ._3lLk3 {
          text-align: center !important;
          vertical-align: middle !important;
        }

        /* Centrado vertical de textos de meses y años en el header SVG */
        ._9w8d5, ._2q1Kt {
          dominant-baseline: central !important;
        }

        /* Ocultar todo lo que está después del nombre de la tarea (separadores, Inicio, Fin) */
        ._1nBOt > div:nth-child(n+2) {
          display: none !important;
        }
        
        ._34SS0 > div:nth-child(n+2) {
          display: none !important;
        }

        /* Solo renombrar el Name a Tarea */
        ._1nBOt > div:nth-child(1) { font-size: 0 !important; }
        ._1nBOt > div:nth-child(1)::after { content: "Tarea"; font-size: 13px; font-weight: 700; color: #374151; }
        
        /* Alinear a la izquierda solo el nombre de la tarea en el body */
        ._34SS0 > div:first-child {
          text-align: left !important;
          padding-left: 12px !important;
        }

        /* Contraste del texto dentro de las barras del Gantt */
        ._3zRJQ {
          fill: #4b5563 !important; /* Gris muy oscuro casi negro */
          font-weight: 700 !important;
        }
        ._3KcaM {
          fill: #4b5563 !important;
        }

        /* FIX SCROLL HORIZONTAL: el SVG interno (width=svgWidth) expande _CZjuD
           haciéndolo tan ancho como todo el timeline, lo que hace que el padre
           del div#._2k9Ys también sea svgWidth→ sin overflow → sin scrollbar.
           Con flex:1 y min-width:0, _CZjuD respeta el ancho del viewport. */
        ._CZjuD {
          flex: 1 !important;
          min-width: 0 !important;
        }
        ._3eULf {
          max-width: 100% !important;
          min-width: 0 !important;
        }

        /* Estilo para las filas de grupo (proyectos virtuales) */
        ._34SS0[style*="font-weight: bold"],
        .taskListTable > div > div[style*="font-weight: bold"] {
          background-color: #f1f5f9 !important;
          border-left: 4px solid #64748b !important;
        }

        /* Scroll vertical premium (clase interna ._1eT-t) */
        ._1eT-t {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
          transition: scrollbar-color 0.3s ease;
        }
        ._1eT-t:hover {
          scrollbar-color: #cbd5e1 transparent;
        }
        ._1eT-t::-webkit-scrollbar {
          width: 4px !important;
        }
        ._1eT-t::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 99px;
        }
        ._1eT-t::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 99px;
          transition: background 0.3s ease;
        }
        ._1eT-t:hover::-webkit-scrollbar-thumb {
          background: #cbd5e1;
        }
        ._1eT-t::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
