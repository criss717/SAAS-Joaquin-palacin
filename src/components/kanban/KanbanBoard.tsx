"use client";

import { useState, useRef } from "react";
import {
  DragDropContext, Droppable, DropResult,
} from "@hello-pangea/dnd";
import { reorderTasks, updateTaskStatus, updateTaskProgress, TaskWithRelations, getProjectMaterialsSummary } from "@/lib/actions/tasks";
import { reorderStages } from "@/lib/actions/stages";
import { Settings2, Plus, X } from "lucide-react";
import { TaskDetailModal } from "./TaskDetailModal";
import { StageManagerModal } from "./StageManagerModal";
import { CreateTaskModal } from "./CreateTaskModal";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { KanbanColumn } from "./KanbanColumn";
import { GanttChart } from "@/components/gantt/GanttChart";
import { toast } from "sonner";
import { updateTaskDatesAndCascade } from "@/lib/actions/tasks";
import { shiftProjectDates } from "@/lib/actions/projects";
import Swal from "sweetalert2";
import { Calendar as CalendarIcon, Loader2, Download, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { downloadMaterialReport } from "@/lib/utils/excel";

type Stage = { id: string; name: string; color: string; order: number; projectId: string }
type User = { id: string; name: string; email: string; role: string }
type Project = { id: string; name: string; startDate: Date }

type Props = {
  initialTasks: TaskWithRelations[]
  initialStages: Stage[]
  users: User[]
  isAdmin: boolean
  project: Project
  materials: { id: string; name: string }[]
  unitTypes: { id: string; name: string }[]
}

// Se eliminó la definición local redundante de TaskStatus
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function KanbanBoard({ initialTasks, initialStages, users, isAdmin, project, materials, unitTypes }: Props) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>(initialTasks);
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [showStageManager, setShowStageManager] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [searchTask, setSearchTask] = useState("");
  const [preSelectedStage, setPreSelectedStage] = useState<string | undefined>(undefined);
  const [preSelectedParentId, setPreSelectedParentId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(true);

  const handleDownloadAllMaterials = async () => {
    try {
      const summary = await getProjectMaterialsSummary(project.id);
      await downloadMaterialReport(summary, project.name);
      toast.success("Reporte de materiales generado.");
    } catch (error) {
      console.error(error);
      toast.error("Error al generar reporte.");
    }
  };
  const [viewMode, setViewMode] = useState<"kanban" | "gantt">("kanban");
  const [isShifting, setIsShifting] = useState(false);

  const handleShiftProject = async (newDate: string) => {
    if (!newDate) return;
    const date = new Date(newDate);

    // Confirmación con SweetAlert2
    const result = await Swal.fire({
      title: '¿Desplazar proyecto?',
      text: "Esto moverá todas las tareas pendientes según el nuevo inicio. Las tareas con progreso o terminadas no se moverán.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Sí, desplazar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    setIsShifting(true);
    const res = await shiftProjectDates(project.id, date);
    setIsShifting(false);

    if (res.success) {
      toast.success(`Proyecto desplazado. Se actualizaron ${res.movedTasks} tareas.`);
      // Recargar la página para obtener los nuevos datos
      window.location.reload();
    } else {
      toast.error(res.error || "Error al desplazar el proyecto");
    }
  };


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
    const isDoneStage = newStage.toLowerCase().includes("terminado") || newStage.toLowerCase().includes("entregado");

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
    const term = normalize(searchTask);
    const matchesSearch = term === "" || normalize(t.name).includes(term);
    const matchesStatus = filterStatus === "" || t.status === filterStatus;
    const matchesAssignee = filterAssignee === "" || t.assignees.some(a => a.id === filterAssignee);
    const matchesDone = showDone || t.status !== "HECHO";
    return matchesSearch && matchesStatus && matchesAssignee && matchesDone;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-95px)] overflow-hidden relative">
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

          <div className="flex gap-2">
            {isAdmin && (
              <>
                <Button
                  variant="ghost"
                  onClick={handleDownloadAllMaterials}
                  className="h-8 rounded-lg border-t-2 border-b-0 border-l-0 border-r-0 border-orange-500 text-gray-500 hover:border-b-2 hover:border-l-2 hover:border-r-2 hover:text-orange-700 font-bold px-3 text-[10px] transition-all uppercase tracking-wider mr-1"
                >
                  <Download size={12} className="mr-1.5 text-orange-500" />
                  Lista Materiales
                </Button>

                <Popover>
                  <PopoverTrigger
                    disabled={isShifting}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "h-8 rounded-lg border-t-2 border-b-0 border-l-0 border-r-0 border-emerald-500 text-gray-500 hover:border-b-2 hover:border-l-2 hover:border-r-2 hover:text-emerald-700 font-bold px-3 text-[10px] transition-all uppercase tracking-wider"
                    )}
                  >
                    {isShifting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <CalendarIcon size={12} className="mr-1.5 text-emerald-500" />}
                    Inicio: {format(new Date(project.startDate), "dd MMM yyyy", { locale: es })}
                  </PopoverTrigger>
                  <PopoverContent className="z-1000 w-auto p-4 rounded-xl shadow-2xl border-gray-100" align="end">
                    <div className="flex flex-col gap-3">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nueva Fecha de Inicio</label>
                      <input
                        type="date"
                        defaultValue={format(new Date(project.startDate), "yyyy-MM-dd")}
                        onChange={(e) => {
                          if (e.target.value) handleShiftProject(e.target.value);
                        }}
                        className="text-xs p-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-emerald-100 outline-none cursor-pointer"
                      />
                      <p className="text-[9px] text-gray-400 leading-tight max-w-[180px]">
                        Se desplazarán inteligentemente las tareas con 0% de progreso.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button variant="ghost" onClick={() => setShowStageManager(true)} className="h-8 rounded-lg border-t-2 border-b-0 border-l-0 border-r-0 border-blue-600 text-gray-500 hover:border-b-2 hover:border-l-2 hover:border-r-2 hover:text-gray-600 font-bold px-3 text-[10px] transition-all uppercase tracking-wider">
                  <Settings2 size={12} className="mr-1.5" /> Gestionar Etapas
                </Button>
              </>
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
              className={cn(
                "h-9 text-xs pl-3 pr-8 w-full border-gray-200 rounded-xl transition-all focus:ring-2 focus:ring-blue-100",
                searchTask && "border-blue-400 border-b-3 border-b-blue-700 shadow-sm"
              )}
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
                  <SelectItem value="HECHO" className="text-xs">Terminado</SelectItem>
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
        <div className="flex flex-col flex-1 min-h-0 mt-[130px]">
          <GanttChart
            tasks={filteredTasks}
            onTaskDatesChange={async (id, start, end) => {
              // Actualizar optimista la tarea arrastrada
              setTasks(prev => prev.map(t => t.id === id ? { ...t, startDate: start, endDate: end } : t));
              // Persistir y propagar en cadena a sucesoras
              const { updated } = await updateTaskDatesAndCascade(id, start, end);
              // Actualizar el estado con todas las tareas modificadas en cascada
              setTasks(prev => prev.map(t => {
                const cascaded = updated.find(u => u.id === t.id);
                return cascaded ? { ...t, startDate: cascaded.startDate, endDate: cascaded.endDate, estimatedHours: cascaded.estimatedHours } : t;
              }));
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
                  scrollContainerRef.current = el;
                }}
                {...colProvided.droppableProps}
                className="flex gap-4 overflow-x-auto kanban-scroll-x pb-4 h-full pt-[130px]"
              >
                {stages
                  .filter(col => showDone || (!col.name.toLowerCase().includes("terminado") && !col.name.toLowerCase().includes("entregado")))
                  .map((column, colIndex) => {
                    const columnTasks = filteredTasks.filter(t => t.stage === column.name).sort((a, b) => a.orderIndex - b.orderIndex);

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
                <button
                  onClick={() => setShowStageManager(true)}
                  title="Agregar etapa"
                  className="flex items-center justify-center w-12 h-12 rounded-full bg-white/60 hover:bg-white/90 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 mt-6 group"
                >
                  <Plus size={20} className="text-gray-400 w-12 group-hover:text-blue-500 transition-colors group-hover:scale-110" strokeWidth={2} />
                </button>
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
        onCreateSubTask={(parentId) => {
          setPreSelectedParentId(parentId);
          setShowCreateTask(true);
        }}
        onTaskUpdated={(updated) => {
          setTasks(prev => {
            const exists = prev.some(t => t.id === updated.id);
            if (exists) return prev.map(t => t.id === updated.id ? updated : t);
            return [...prev, updated];
          });
          // Actualizar selectedTask con los nuevos datos sin cerrar el modal
          if (selectedTask?.id === updated.id) {
            setSelectedTask(updated);
          }
        }}
        onDeleteTask={handleDeleteTask}
        materials={materials}
        unitTypes={unitTypes}
      />

      <CreateTaskModal
        key={showCreateTask ? `open-${preSelectedStage}-${preSelectedParentId}` : "closed"}
        open={showCreateTask}
        projectId={stages[0]?.projectId ?? ""}
        stages={stages}
        users={users}
        allTasks={tasks}
        initialStage={preSelectedStage}
        initialParentId={preSelectedParentId}
        onClose={() => {
          setShowCreateTask(false);
          setPreSelectedStage(undefined);
          setPreSelectedParentId(null);
        }}
        onTaskCreated={(newTask) => {
          setTasks(prev => {
            let next = [...prev, newTask];
            // Si tiene padre, actualizar la tarjeta del padre con la nueva sub-tarea
            if (newTask.parentId) {
              next = next.map(t => {
                if (t.id === newTask.parentId) {
                  const alreadyHasPred = t.predecessors.some(
                    (p: { predecessor: { id: string } }) => p.predecessor.id === newTask.id
                  );
                  return alreadyHasPred ? t : {
                    ...t,
                    predecessors: [...t.predecessors, { predecessor: { id: newTask.id, name: newTask.name } }]
                  };
                }
                return t;
              });
            }
            return next;
          });
          setShowCreateTask(false);
          setPreSelectedStage(undefined);
          setPreSelectedParentId(null);
        }}
        materials={materials}
        unitTypes={unitTypes}
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
