"use client";

import { useState } from "react";
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
  const [filterAssignee, setFilterAssignee] = useState("ALL");
  const [searchTask, setSearchTask] = useState("");
  const [preSelectedStage, setPreSelectedStage] = useState<string | undefined>(undefined);
  const [showDone, setShowDone] = useState(true);



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

  return (
    <div className="flex flex-col h-full">
      {/* Barra superior */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex  items-center gap-3 text-sm text-gray-500">
          <span><strong className="text-gray-800">{stages.length}</strong> etapas</span>
          <span>·</span>
          <span><strong className="text-gray-800">{tasks.length}</strong> tareas</span>
        </div>
        <div className="flex ml-auto relative">
          <Input
            placeholder="Buscar tarea / pieza / ensamble..."
            value={searchTask}
            onChange={(e) => setSearchTask(e.target.value)}
            className={`w-[400px] pr-8 transition-colors ${searchTask ? "border-b-2 border-blue-600 border-l-0 border-r-0 border-t-0" : ""}`}
          />
          {searchTask && (
            <button
              onClick={() => setSearchTask("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 cursor-pointer p-1"
              title="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex gap-2 ml-auto">
          <div className="w-[190px]">
            <Select
              value={filterAssignee}
              onValueChange={(v) => setFilterAssignee(v ?? "")}
            >
              <SelectTrigger className={`cursor-pointer w-full ${filterAssignee === "ALL" ? "text-gray-500" : "text-gray-800"}`}>
                <SelectValue placeholder="Filtrar por responsable" >
                  {filterAssignee === "ALL" ? "Todos los responsables" : users.find(u => u.id === filterAssignee)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los responsables</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <Select
              value={filterStatus}
              onValueChange={(e) => setFilterStatus(e ?? "")}
            >
              <SelectTrigger className="cursor-pointer w-full">
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
          <div className="flex items-center gap-2 mr-2 px-3 py-1 bg-gray-50 rounded-lg border border-gray-100">
            <input
              id="hide-done"
              type="checkbox"
              checked={!showDone}
              onChange={() => setShowDone(!showDone)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="hide-done" className="text-[11px] font-bold text-gray-500 uppercase cursor-pointer select-none">
              Ocultar terminadas
            </label>
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
                {stages
                  .filter(col => showDone || (!col.name.toLowerCase().includes("listo") && !col.name.toLowerCase().includes("terminado")))
                  .map((column, colIndex) => {
                    const columnTasks = tasks.filter(t =>
                      t.stage === column.name &&
                      (showDone || t.status !== "HECHO") &&
                      (filterStatus === "" || t.status === filterStatus) &&
                      (filterAssignee === "" || filterAssignee === "ALL" || t.assignees.some(a => a.id === filterAssignee)) &&
                      (searchTask === "" || t.name.toLowerCase().includes(searchTask.toLowerCase()))
                    ).sort((a, b) => a.orderIndex - b.orderIndex);

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
