"use client";

import { useState } from "react";
import {
  DragDropContext, Droppable, Draggable, DropResult,
} from "@hello-pangea/dnd";
import { updateTaskStage, updateTaskStatus, updateTaskProgress, TaskWithRelations } from "@/lib/actions/tasks";
import { reorderStages } from "@/lib/actions/stages";
import { Package, ChevronDown, ChevronUp, Settings2, Plus, GripVertical, CheckCircle2, PlayCircle, AlertCircle, CheckCheck, XCircle, Percent } from "lucide-react";
import { TaskDetailModal } from "./TaskDetailModal";
import { StageManagerModal } from "./StageManagerModal";
import { CreateTaskModal } from "./CreateTaskModal";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [showStageManager, setShowStageManager] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchTask, setSearchTask] = useState("");
  const [preSelectedStage, setPreSelectedStage] = useState<string | undefined>(undefined);



  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
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

    // ── Mover TARJETA entre columnas ──
    if (destination.droppableId === source.droppableId) return;
    const newStage = destination.droppableId;
    const isDoneStage = newStage.toLowerCase().includes("listo") || newStage.toLowerCase().includes("terminado");

    setTasks(prev => prev.map(t => {
      if (t.id === draggableId) {
        return {
          ...t,
          stage: newStage,
          status: isDoneStage ? "HECHO" : t.status,
          progress: isDoneStage ? 100 : t.progress
        };
      }
      return t;
    }));

    await updateTaskStage(draggableId, newStage);
    if (isDoneStage) {
      await updateTaskStatus(draggableId, "HECHO");
      await updateTaskProgress(draggableId, 100);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Barra superior */}
      <div className="flex items-center justify-start mb-4">
        <div className="flex  items-center gap-3 text-sm text-gray-500">
          <span><strong className="text-gray-800">{stages.length}</strong> etapas</span>
          <span>·</span>
          <span><strong className="text-gray-800">{tasks.length}</strong> tareas</span>
        </div>
        <div className="flex ml-auto">
          <Input
            placeholder="Buscar tarea..."
            value={searchTask}
            onChange={(e) => setSearchTask(e.target.value)}
            className="w-100"
          />
        </div>
        <div className="flex gap-2 ml-auto">
          <div>
            <Select
              value={filterStatus}
              onValueChange={(e) => setFilterStatus(e ?? "")}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="EN_PROCESO">En Proceso</SelectItem>
                <SelectItem value="CAMBIOS_SOLICITADOS">Cambios Solicitados</SelectItem>
                <SelectItem value="HECHO">Hecho</SelectItem>
                <SelectItem value="APROBADO">Aprobado</SelectItem>
                <SelectItem value="CANCELADO">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setShowCreateTask(true)} className="text-sm gap-1.5 cursor-pointer">
            <Plus size={14} /> Nueva Tarea
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setShowStageManager(true)} className="text-sm gap-1.5 cursor-pointer">
              <Settings2 size={14} /> Etapas
            </Button>
          )}
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed rounded-xl">
          <Plus size={40} className="mb-3 opacity-30" />
          <p className="font-medium">No hay etapas configuradas</p>
          {isAdmin && (
            <button onClick={() => setShowStageManager(true)} className="mt-2 text-blue-500 text-sm hover:underline">
              Crear primera etapa →
            </button>
          )}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          {/* Droppable de COLUMNAS → direction horizontal */}
          <Droppable droppableId="all-columns" direction="horizontal" type="COLUMN">
            {(colProvided) => (
              <div
                ref={colProvided.innerRef}
                {...colProvided.droppableProps}
                className="flex gap-4 overflow-x-auto pb-4 h-full"
              >
                {stages.map((column, colIndex) => {
                  console.log(column.color)
                  const columnTasks = tasks.filter(t =>
                    t.stage === column.name &&
                    (filterStatus === "" || t.status === filterStatus) &&
                    (searchTask === "" || t.name.toLowerCase().includes(searchTask.toLowerCase()))
                  );

                  return (
                    <Draggable key={column.id} draggableId={`col-${column.id}`} index={colIndex}>
                      {(colDrag, colSnapshot) => (
                        <div
                          ref={colDrag.innerRef}
                          {...colDrag.draggableProps}
                          className={`flex min-h-[calc(100vh-220px)] flex-col w-72 shrink-0 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden transition-shadow ${colSnapshot.isDragging ? "shadow-2xl rotate-1" : ""}`}
                          style={{
                            ...colDrag.draggableProps.style,
                            borderTopColor: column.color,
                            borderTopWidth: 3,
                          }}
                        >
                          {/* Header columna con handle de arrastre */}
                          <div
                            {...colDrag.dragHandleProps}
                            className="px-3 py-3 flex items-center gap-2 bg-white border-b border-gray-100 cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical size={14} className="text-gray-300 shrink-0" />
                            <h3 className="font-semibold text-gray-800 text-sm flex-1">{column.name}</h3>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: column.color }}
                            >
                              {columnTasks.length}
                            </span>
                            <Button
                              onClick={() => {
                                setPreSelectedStage(column.name);
                                setShowCreateTask(true);
                              }}
                              className="w-7 h-7 p-0 rounded-full text-white cursor-pointer ml-auto hover:opacity-90 transition-opacity"
                              style={{ backgroundColor: column.color }}
                            >
                              <Plus size={16} />
                            </Button>
                          </div>

                          {/* Tarjetas */}
                          <Droppable droppableId={column.name} type="TASK">
                            {(taskProvided, taskSnapshot) => (
                              <div
                                ref={taskProvided.innerRef}
                                {...taskProvided.droppableProps}
                                className={`flex-1 px-3 py-3 flex flex-col gap-2 min-h-[200px] transition-colors ${taskSnapshot.isDraggingOver ? "bg-blue-50/60" : ""}`}
                              >
                                {columnTasks.map((task, index) => {
                                  const isExpanded = expandedCards.has(task.id);
                                  const projectSubTasks = tasks.filter(t => t.parentId === task.id);
                                  const totalSubs = projectSubTasks.length;
                                  const completedSubs = projectSubTasks.filter(s => s.status === "HECHO").length;

                                  return (
                                    <Draggable key={task.id} draggableId={task.id} index={index}>
                                      {(taskDrag, taskDragSnapshot) => (
                                        <div
                                          ref={taskDrag.innerRef}
                                          {...taskDrag.draggableProps}
                                          {...taskDrag.dragHandleProps}
                                          onClick={() => {
                                            const currentTask = tasks.find(t => t.id === task.id)
                                            if (currentTask) setSelectedTask(currentTask)
                                          }}
                                          className={`bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer transition-all ${taskDragSnapshot.isDragging
                                            ? "shadow-xl rotate-1 scale-[1.02]"
                                            : "hover:shadow-md hover:-translate-y-0.5"
                                            } ${task.status === 'HECHO' ? 'grayscale opacity-75 bg-gray-50 border-gray-300' : ''} ${task.status === 'CANCELADO' ? 'opacity-50' : ''}`}
                                        >
                                          <div className="p-3">
                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                {task.isAssembly && <Package size={13} className="text-purple-500 shrink-0 mt-0.5" />}
                                                <p className="font-semibold text-sm text-gray-900 leading-tight truncate">{task.name}</p>
                                                <div className="shrink-0 flex items-center h-full">
                                                  {task.status === 'APROBADO' && <CheckCircle2 size={12} className="text-emerald-500" />}
                                                  {task.status === 'EN_PROCESO' && <PlayCircle size={12} className="text-blue-500" />}
                                                  {task.status === 'CAMBIOS_SOLICITADOS' && <AlertCircle size={12} className="text-amber-500" />}
                                                  {task.status === 'HECHO' && <CheckCheck size={12} className="text-gray-500" />}
                                                  {task.status === 'CANCELADO' && <XCircle size={12} className="text-red-500" />}
                                                </div>
                                              </div>
                                              {totalSubs > 0 && (
                                                <button onClick={(e) => toggleExpand(task.id, e)} className="text-gray-400 hover:text-gray-600 shrink-0 p-0.5 cursor-pointer">
                                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                              )}
                                            </div>

                                            {task.isAssembly && (
                                              <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium mb-1.5">
                                                Ensamble
                                              </span>
                                            )}

                                            {/* Progreso sub-piezas */}
                                            {totalSubs > 0 && (
                                              <div className="mb-2">
                                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                  <span>Sub-piezas/tareas</span>
                                                  <span className="font-medium">{completedSubs}/{totalSubs}</span>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                  <div
                                                    className="h-1.5 rounded-full transition-all"
                                                    style={{ width: `${(completedSubs / totalSubs) * 100}%`, backgroundColor: column.color }}
                                                  />
                                                </div>
                                                {isExpanded && (
                                                  <ul className="mt-2 space-y-1">
                                                    {projectSubTasks.map(sub => (
                                                      <li key={sub.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${sub.status === "HECHO" ? "bg-green-500" : "bg-gray-300"}`} />
                                                        {sub.name}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                )}
                                              </div>
                                            )}

                                            {/* Progreso Manual (para todas las tareas) */}
                                            <div className="mb-2.5">
                                              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                                <span className="flex items-center gap-0.5"><Percent size={10} /> Progreso</span>
                                                <span className="font-bold text-gray-600">{task.progress}%</span>
                                              </div>
                                              <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                                                <div
                                                  className={`h-full transition-all duration-500 ${task.status === 'HECHO' ? 'bg-green-500' : task.status === 'CANCELADO' ? 'bg-gray-400' : 'bg-blue-600'}`}
                                                  style={{ width: `${task.progress}%` }}
                                                />
                                              </div>
                                            </div>

                                            {/* Footer */}
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                                              <span className="text-xs text-gray-400">
                                                📅 {new Date(task.endDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                                              </span>
                                              {/* Avatares de asignados */}
                                              {task.assignees.length > 0 && (
                                                <div className="flex -space-x-1.5">
                                                  {task.assignees.slice(0, 3).map(a => (
                                                    <div
                                                      key={a.id}
                                                      title={a.name}
                                                      className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-[9px]"
                                                      style={{ backgroundColor: column.color }}
                                                    >
                                                      {a.name.charAt(0)}
                                                    </div>
                                                  ))}
                                                  {task.assignees.length > 3 && (
                                                    <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-gray-600 text-[9px] font-bold">
                                                      +{task.assignees.length - 3}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </Draggable>
                                  );
                                })}
                                {taskProvided.placeholder}

                                {columnTasks.length === 0 && !taskSnapshot.isDraggingOver && (
                                  <div className="flex-1 flex items-center justify-center text-xs text-gray-300 italic min-h-[80px] border-2 border-dashed border-gray-200 rounded-lg">
                                    Arrastra aquí
                                  </div>
                                )}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      )}
                    </Draggable>
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
        onStagesChanged={(updated) => setStages(updated as Stage[])}
        isAdmin={isAdmin}
      />
    </div>
  );
}
