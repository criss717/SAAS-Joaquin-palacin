"use client";

import { useState, useRef } from "react";
import {
  DragDropContext, Droppable, DropResult,
} from "@hello-pangea/dnd";
import { reorderTasks, updateTaskStatus, updateTaskProgress, TaskWithRelations } from "@/lib/actions/tasks";
import { reorderStages } from "@/lib/actions/stages";
import { Settings2, Plus, X } from "lucide-react";
import { TaskDetailModal } from "./TaskDetailModal";
import { StageManagerModal } from "./StageManagerModal";
import { CreateTaskModal } from "./CreateTaskModal";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { KanbanColumn } from "./KanbanColumn";
import { GanttChart } from "@/components/gantt/GanttChart";
import { updateTaskDates } from "@/lib/actions/tasks";

type Stage = { id: string; name: string; color: string; order: number; projectId: string }
type User = { id: string; name: string; email: string; role: string }

type Props = {
  initialTasks: TaskWithRelations[]
  initialStages: Stage[]
  users: User[]
  isAdmin: boolean
}

// Se eliminó la definición local redundante de TaskStatus

export function KanbanBoard({ initialTasks, initialStages, users, isAdmin }: Props) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>(initialTasks);
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const scrollMirrorRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sincronización de scroll duplicado (Superior <-> Inferior)
  const syncScroll = (from: React.RefObject<HTMLDivElement | null>, to: React.RefObject<HTMLDivElement | null>) => {
    if (from.current && to.current) {
      to.current.scrollLeft = from.current.scrollLeft;
    }
  };
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [showStageManager, setShowStageManager] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [searchTask, setSearchTask] = useState("");
  const [preSelectedStage, setPreSelectedStage] = useState<string | undefined>(undefined);
  const [showDone, setShowDone] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "gantt">("kanban");


  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(prev => {
      // Identificar todos los descendientes recursivamente
      const idsToDelete = new Set([taskId]);
      let changed = true;
      while (changed) {
        changed = false;
        prev.forEach(t => {
          if (t.parentId && idsToDelete.has(t.parentId) && !idsToDelete.has(t.id)) {
            idsToDelete.add(t.id);
            changed = true;
          }
        });
      }
      return prev.filter(t => !idsToDelete.has(t.id));
    });
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) return;

    // ── Reordenar COLUMNAS ──
    if (type === "COLUMN") {
      if (destination.index === source.index) return;
      const newStages = Array.from(stages);
      const [moved] = newStages.splice(source.index, 1);
      newStages.splice(destination.index, 0, moved);
      const updated = newStages.map((s, i) => ({ ...s, order: i }));
      setStages(updated);
      await reorderStages(updated.map(s => s.id));
      return;
    }

    // ── Mover / Reordenar TARJETAS ──
    const sameColumn = destination.droppableId === source.droppableId;
    const sameIndex = destination.index === source.index;

    // Si no ha cambiado nada, salimos
    if (sameColumn && sameIndex) return;

    const newStage = destination.droppableId;
    const newIndex = destination.index;
    const isDoneStage = newStage.toLowerCase().includes("listo") || newStage.toLowerCase().includes("terminado");

    // --- ACTUALIZACIÓN OPTIMISTA ---
    setTasks(prev => {
      const allTasks = [...prev];
      const taskIndex = allTasks.findIndex(t => t.id === draggableId);
      if (taskIndex === -1) return prev;

      const [task] = allTasks.splice(taskIndex, 1);
      const updatedTask = {
        ...task,
        stage: newStage,
        status: isDoneStage ? "HECHO" : task.status,
        progress: isDoneStage ? 100 : task.progress
      };

      // 1. Obtener tareas de las columnas origen y destino (ordenadas)
      const sourceTasks = allTasks
        .filter(t => t.stage === source.droppableId)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const destTasks = sameColumn
        ? sourceTasks
        : allTasks.filter(t => t.stage === newStage).sort((a, b) => a.orderIndex - b.orderIndex);

      // 2. Insertar en la nueva posición
      destTasks.splice(newIndex, 0, updatedTask as TaskWithRelations);

      // 3. Crear mapa de nuevos índices
      const indexMap: Record<string, number> = {};
      destTasks.forEach((t, i) => { indexMap[t.id] = i; });
      if (!sameColumn) {
        sourceTasks.forEach((t, i) => { indexMap[t.id] = i; });
      }

      // 4. Actualizar estado global preservando el resto de columnas
      return prev.map(t => {
        if (t.id === draggableId) return { ...updatedTask, orderIndex: newIndex } as TaskWithRelations;
        if (indexMap[t.id] !== undefined) {
          return { ...t, orderIndex: indexMap[t.id], stage: t.id === draggableId ? newStage : t.stage };
        }
        return t;
      }).sort((a, b) => a.orderIndex - b.orderIndex);
    });

    // --- PERSISTENCIA EN EL SERVIDOR ---
    try {
      await reorderTasks(draggableId, newStage, newIndex);
      if (isDoneStage) {
        await updateTaskStatus(draggableId, "HECHO");
        await updateTaskProgress(draggableId, 100);
      }
    } catch (err) {
      console.error("Error persistiendo orden:", err);
      // Opcional: Revertir estado si falla, pero para una mejor UX solemos dejar el optimista
    }
  };

  // Filtrado compartido para ambas vistas
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = searchTask === "" || t.name.toLowerCase().includes(searchTask.toLowerCase());
    const matchesStatus = filterStatus === "" || t.status === filterStatus;
    const matchesAssignee = filterAssignee === "" || t.assignees.some(a => a.id === filterAssignee);
    const matchesDone = showDone || t.status !== "HECHO";
    return matchesSearch && matchesStatus && matchesAssignee && matchesDone;
  });

  return (
    <div className="flex flex-col h-full relative">
      {/* Cabecera Superior: Stats + Switch + Proyecto */}
      {/* Cabecera Superior: Proyecto + Switch (A la izquierda) */}
      <div className="w-[calc(100%-48px)] max-w-full fixed top-[60px] z-20 bg-gray-50 backdrop-blur-sm pb-2 pt-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-4 mt-2">
            <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 cursor-pointer ${viewMode === "kanban"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                Tablero
              </button>
              <button
                onClick={() => setViewMode("gantt")}
                className={`px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 cursor-pointer ${viewMode === "gantt"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                Gantt
              </button>
            </div>
          </div>

          {/* Espacio reservado para botones de acción secundarios si fuesen necesarios */}
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="ghost" onClick={() => setShowStageManager(true)} className="h-8 rounded-lg border-t-2 border-b-0 border-l-0 border-r-0 border-blue-600 text-gray-500 hover:border-b-2 hover:border-l-2 hover:border-r-2 hover:text-gray-600 font-bold px-3 text-[10px] transition-all uppercase tracking-wider">
                <Settings2 size={12} className="mr-1.5" /> Gestionar Etapas
              </Button>
            )}
          </div>
        </div>

        {/* Barra de Filtros: Stats + Search + Filtros (TODO EN UNA LÍNEA) */}
        <div className="flex items-center gap-3 mb-5 shrink-0">
          {/* Stats compactas integradas */}
          <div className="flex items-center gap-3 text-[10px] text-gray-400 font-bold bg-white px-3 h-9 rounded-xl border border-gray-100 shadow-sm shrink-0 uppercase tracking-tighter">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span>ETAPAS:</span>
              <span className="text-gray-800">{stages.length}</span>
            </div>
            <div className="w-px h-3 bg-gray-200" />
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span>TOTAL:</span>
              <span className="text-gray-800">{tasks.length}</span>
            </div>
            <div className="w-px h-3 bg-gray-200" />
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-gray-400">FILTRADAS:</span>
              <span className="text-gray-800">{filteredTasks.length}</span>
            </div>
          </div>

          <div className="2xl:ml-80 ml-5 flex-1 relative w-full">
            <Input
              placeholder="Buscar tarea, pieza o componente..."
              value={searchTask}
              onChange={(e) => setSearchTask(e.target.value)}
              className={`h-9 text-xs pl-3 pr-8 w-full border-gray-200 rounded-xl transition-all focus:ring-2 focus:ring-blue-100 ${searchTask ? "border-blue-400" : ""}`}
            />
            {searchTask && (
              <button
                onClick={() => setSearchTask("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 cursor-pointer p-0.5"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-2 w-full max-w-[600px] justify-end items-center">
            <div className="w-[180px] max-w-[180px]">
              <Select value={filterAssignee} onValueChange={(v) => setFilterAssignee(v ?? "")}>
                <SelectTrigger className={`h-9 text-xs w-full cursor-pointer rounded-xl border-gray-200 text-gray-700`}>
                  <SelectValue placeholder="Responsable">
                    {filterAssignee === "" ? "Todos los responsables" : users.find(u => u.id === filterAssignee)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} sideOffset={4} className="rounded-xl font-medium">
                  <SelectItem value="" className="text-xs">Todos los responsables</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="w-[160px]">
              <Select value={filterStatus} onValueChange={(e) => setFilterStatus(e ?? "")}>
                <SelectTrigger className="h-9 w-full text-xs cursor-pointer rounded-xl border-gray-200 text-gray-700">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} sideOffset={4} className="rounded-xl w-full font-medium">
                  <SelectItem value="" className="text-xs">Todos los estados</SelectItem>
                  <SelectItem value="EN_PROCESO" className="text-xs">En Proceso</SelectItem>
                  <SelectItem value="CAMBIOS" className="text-xs">Cambios</SelectItem>
                  <SelectItem value="HECHO" className="text-xs">Listo</SelectItem>
                  <SelectItem value="APROBADO" className="text-xs">Aprobado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center w-[130px] gap-2 px-3 h-9 bg-gray-50/50 rounded-xl border border-gray-100 transition-all hover:bg-white hover:border-blue-100 shrink-0">
              <input
                id="hide-done"
                type="checkbox"
                checked={!showDone}
                onChange={() => setShowDone(!showDone)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="hide-done" className={`text-[10px] font-bold text-gray-400 uppercase cursor-pointer select-none tracking-tight whitespace-nowrap ${showDone && 'font-medium'}`}>
                Ocultar hechos
              </label>
            </div>

            <style jsx global>{`
            .custom-scrollbar::-webkit-scrollbar {
              height: 8px !important;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: #f1f5f9 !important;
              border-radius: 10px !important;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #d4d5d6 !important; /* Azul más vivo para confirmar que se aplica */
              border-radius: 10px !important;
              border: 2px solid #f1f5f9 !important;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #a8a9aa !important;
            }
            /* Soporte para Firefox */
            .custom-scrollbar {
              scrollbar-width: thin !important;
              scrollbar-color: #d4d5d6 #f1f5f9  !important;
            }
          `}</style>

            <div className="w-px h-6 bg-gray-100 mx-1 shrink-0" />

            <div className="flex gap-2 shrink-0">
              <Button onClick={() => setShowCreateTask(true)} className="h-8 rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200 font-bold px-4 text-xs border-0 transition-all">
                <Plus size={14} className="mr-1.5" strokeWidth={3} /> Nueva Tarea
              </Button>
            </div>

          </div>

        </div>

        {/* Scroll Superior Espejo (Opcional, solo si hay overflow) */}
        {viewMode === "kanban" && stages.length > 0 && (
          <div
            ref={scrollMirrorRef}
            onScroll={() => syncScroll(scrollMirrorRef, scrollContainerRef)}
            className="overflow-x-auto h-3 mb-1 custom-scrollbar shrink-0"
          >
            {/* Calculamos el ancho exacto: 300px columna + 16px gap */}
            <div style={{ width: `${stages.filter(col => showDone || (!col.name.toLowerCase().includes("listo") && !col.name.toLowerCase().includes("terminado"))).length * 316}px` }}></div>
          </div>
        )}
      </div>

      {stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-[140px] h-64 text-gray-400 border-2 border-dashed rounded-xl">
          <Plus size={40} className="mb-3 opacity-30" />
          <p className="font-medium">No hay etapas configuradas</p>
          {isAdmin && (
            <button onClick={() => setShowStageManager(true)} className="mt-2 text-blue-500 text-sm hover:underline">
              Crear primera etapa →
            </button>
          )}
        </div>
      ) : viewMode === "gantt" ? (
        <div className="w-full flex-1 min-h-[500px] mt-[120px] bg-white border rounded-2xl shadow-sm overflow-hidden p-3 border-gray-100">
          <GanttChart
            tasks={filteredTasks}
            onTaskDatesChange={async (id, start, end) => {
              setTasks(prev => prev.map(t => t.id === id ? { ...t, startDate: start, endDate: end } : t));
              await updateTaskDates(id, start, end);
            }}
            onTaskDoubleClick={(task) => setSelectedTask(task)}
          />
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          {/* Droppable de COLUMNAS → direction horizontal */}
          <Droppable droppableId="all-columns" direction="horizontal" type="COLUMN">
            {(colProvided) => (
              <div
                ref={(el) => {
                  colProvided.innerRef(el);
                  // Guardar ref para scroll
                  scrollContainerRef.current = el;
                }}
                {...colProvided.droppableProps}
                onScroll={() => syncScroll(scrollContainerRef, scrollMirrorRef)}
                className="flex gap-4 overflow-x-auto pb-4 h-full custom-scrollbar pt-[150px]"
              >
                {stages
                  .filter(col => showDone || (!col.name.toLowerCase().includes("listo") && !col.name.toLowerCase().includes("terminado")))
                  .map((column, colIndex) => {
                    const columnTasks = filteredTasks.filter(t => t.stage === column.name);

                    return (
                      <KanbanColumn
                        key={column.id}
                        column={column}
                        index={colIndex}
                        tasks={columnTasks}
                        allTasks={tasks}
                        expandedCards={expandedCards}
                        onToggleExpand={toggleExpand}
                        onSelectTask={setSelectedTask}
                        onDeleteTask={handleDeleteTask}
                        onAddTask={(stageName) => {
                          setPreSelectedStage(stageName);
                          setShowCreateTask(true);
                        }}
                      />
                    );
                  })}
                {colProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Modal detalle/edición de tarea */}
      <TaskDetailModal
        key={selectedTask?.id ?? "none"}
        task={selectedTask}
        stages={stages}
        users={users}
        allTasks={tasks}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={(updated) => {
          setTasks(prev => {
            const exists = prev.some(t => t.id === updated.id);
            if (exists) return prev.map(t => t.id === updated.id ? updated : t);
            return [...prev, updated];
          });
          // Solo cerramos si se actualizó la tarea principal seleccionada
          if (updated.id === selectedTask?.id) {
            setSelectedTask(null);
          }
        }}
        onDeleteTask={handleDeleteTask}
      />

      <CreateTaskModal
        key={showCreateTask ? `open-${preSelectedStage}` : "closed"}
        open={showCreateTask}
        projectId={stages[0]?.projectId ?? ""}
        stages={stages}
        users={users}
        allTasks={tasks}
        initialStage={preSelectedStage}
        onClose={() => {
          setShowCreateTask(false);
          setPreSelectedStage(undefined);
        }}
        onTaskCreated={(newTask) => {
          setTasks(prev => [...prev, newTask]);
          setShowCreateTask(false);
          setPreSelectedStage(undefined);
        }}
      />

      {/* Modal gestión de etapas */}
      <StageManagerModal
        open={showStageManager}
        projectId={stages[0]?.projectId ?? ""}
        stages={stages}
        onClose={() => setShowStageManager(false)}
        onStagesChanged={(updated) => {
          const newStages = updated as Stage[];
          // Si una etapa cambió de nombre, actualizamos las tareas locales
          setTasks(prevTasks => {
            let nextTasks = [...prevTasks];
            stages.forEach(oldStage => {
              const newStage = newStages.find(ns => ns.id === oldStage.id);
              if (newStage && newStage.name !== oldStage.name) {
                // Se ha renombrado esta etapa
                nextTasks = nextTasks.map(t =>
                  t.stage === oldStage.name ? { ...t, stage: newStage.name } : t
                );
              }
            });
            return nextTasks;
          });
          setStages(newStages);
        }}
        isAdmin={isAdmin}
      />
    </div>
  );
}
