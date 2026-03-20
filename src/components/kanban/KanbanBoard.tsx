"use client";

import { useState } from "react";
import {
  DragDropContext, Droppable, DropResult,
} from "@hello-pangea/dnd";
import { updateTaskStage, updateTaskStatus, updateTaskProgress, TaskWithRelations } from "@/lib/actions/tasks";
import { reorderStages } from "@/lib/actions/stages";
import { Settings2, Plus } from "lucide-react";
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex  items-center gap-3 text-sm text-gray-500">
          <span><strong className="text-gray-800">{stages.length}</strong> etapas</span>
          <span>·</span>
          <span><strong className="text-gray-800">{tasks.length}</strong> tareas</span>
        </div>
        <div className="flex ml-auto">
          <Input
            placeholder="Buscar tarea / pieza / ensamble..."
            value={searchTask}
            onChange={(e) => setSearchTask(e.target.value)}
            className="w-100"
          />
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
                    );

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
