"use client";

import { useState } from "react";
import { Gantt, Task, ViewMode } from "@rsagiev/gantt-task-react-19";
import "@rsagiev/gantt-task-react-19/dist/index.css";
import { updateTaskDates, TaskWithRelations } from "@/lib/actions/tasks";

type GroupByMode = 'none' | 'stage' | 'status' | 'user';

type Props = { initialTasks: TaskWithRelations[] };

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
      styles = { progressColor: "#818cf8", progressSelectedColor: "#6366f1" };
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
      type: "task", // Cambiado de project a task para permitir arrastre
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

export function GanttChart({ initialTasks }: Props) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>(initialTasks);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [groupBy, setGroupBy] = useState<GroupByMode>("user");

  const ganttTasks = toGanttTasks(tasks, groupBy);

  const handleTaskChange = async (ganttTask: Task) => {
    // Validar que las fechas son válidas antes de persistir
    if (!ganttTask.start || !ganttTask.end) return
    if (isNaN(ganttTask.start.getTime()) || isNaN(ganttTask.end.getTime())) return
    if (ganttTask.end < ganttTask.start) return

    setTasks(prev =>
      prev.map(t =>
        t.id === ganttTask.id
          ? { ...t, startDate: ganttTask.start, endDate: ganttTask.end }
          : t
      )
    )
    await updateTaskDates(ganttTask.id, ganttTask.start, ganttTask.end)
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
    <div className="w-full h-full p-4 flex flex-col bg-gray-50/30">
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
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mb-6 flex-wrap text-[10px] text-gray-400 font-medium px-2">
        {[
          { color: "bg-indigo-400", label: "ENSAMBLE" },
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

      {/* Gantt Container */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
        {ganttTasks.length > 0 ? (
          <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            onDateChange={handleTaskChange}
            locale="es"
            fontFamily="var(--font-outfit), Inter, sans-serif"
            listCellWidth="200px"
            columnWidth={viewMode === ViewMode.Month ? 300 : viewMode === ViewMode.Week ? 200 : viewMode === ViewMode.Day ? 70 : 60}
            headerHeight={50}
            rowHeight={45}
            barCornerRadius={6}
            handleWidth={8}
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

        /* Estilo para las filas de grupo (proyectos virtuales) */
        ._34SS0[style*="font-weight: bold"],
        .taskListTable > div > div[style*="font-weight: bold"] {
          background-color: #f1f5f9 !important;
          border-left: 4px solid #64748b !important;
        }
      `}</style>
    </div>
  );
}
