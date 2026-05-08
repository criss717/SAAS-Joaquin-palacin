"use client";

import React, { useState } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskWithRelations } from "@/lib/actions/tasks";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
  column: { id: string; name: string; color: string };
  index: number;
  tasks: TaskWithRelations[];
  allTasks: TaskWithRelations[];
  expandedCards: Set<string>;
  onToggleExpand: (id: string, e: React.MouseEvent) => void;
  onSelectTask: (task: TaskWithRelations) => void;
  onDeleteTask: (taskId: string) => void;
  onAddTask: (stageName: string) => void;
}

export const KanbanColumn = ({
  column,
  index,
  tasks,
  allTasks,
  expandedCards,
  onToggleExpand,
  onSelectTask,
  onDeleteTask,
  onAddTask,
}: KanbanColumnProps) => {
  // Estado local para carga perezosa (Lazy Rendering)
  const [visibleCount, setVisibleCount] = useState(50);
  const visibleTasks = tasks.slice(0, visibleCount);
  const remainingCount = tasks.length - visibleCount;

  return (
    <Draggable draggableId={`col-${column.id}`} index={index}>
      {(colDrag, colSnapshot) => (
        <div
          ref={colDrag.innerRef}
          {...colDrag.draggableProps}
          className={`flex h-[calc(100vh-250px)] flex-col w-[300px] shrink-0 bg-gray-50 rounded-xl border-l border-r border-b border-t-3 border-l-gray-200 border-b-gray-200 border-r-gray-200 overflow-hidden transition-shadow ${colSnapshot.isDragging ? "shadow-2xl rotate-1" : ""
            }`}
          style={{ ...colDrag.draggableProps.style, borderTopColor: column.color }}
        >
          {/* Header de Columna */}
          <div
            {...colDrag.dragHandleProps}
            className="px-3 py-3 flex items-center gap-2 bg-white border-b border-gray-100 cursor-grab active:cursor-grabbing"
          >
            <GripVertical size={14} className="text-gray-300 shrink-0" />
            <h3 className="font-semibold text-gray-800 text-sm flex-1">{column.name}</h3>
            <span
              className="text-xs font-bold w-6 h-6 rounded-full text-white flex items-center justify-center shrink-0"
              style={{ backgroundColor: column.color }}
            >
              {tasks.length}
            </span>
            <Button
              onClick={() => onAddTask(column.name)}
              className="w-7 h-7 p-0 rounded-full text-white cursor-pointer ml-auto hover:opacity-90 transition-opacity"
              style={{ backgroundColor: column.color }}
            >
              <Plus size={16} />
            </Button>
          </div>

          {/* Lista de Tareas con Droppable */}
          <Droppable droppableId={column.name} type="TASK">
            {(taskProvided, taskSnapshot) => (
              <div
                ref={taskProvided.innerRef}
                {...taskProvided.droppableProps}
                className={`flex-1 overflow-y-auto kanban-scroll px-3 py-3 flex flex-col gap-2 min-h-[200px] transition-colors rounded-b-xl ${taskSnapshot.isDraggingOver ? "bg-blue-50/60" : ""
                  }`}
              >
                {visibleTasks.map((task, idx) => {
                  const predecessorsIds = task.predecessors.map((p) => p.predecessor.id);
                  const subTasksFromPreds = allTasks.filter((t) => predecessorsIds.includes(t.id));

                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      index={idx}
                      isExpanded={expandedCards.has(task.id)}
                      columnColor={column.color}
                      projectSubTasks={subTasksFromPreds}
                      allTasks={allTasks}
                      onToggleExpand={onToggleExpand}
                      onSelectTask={onSelectTask}
                      onDeleteTask={onDeleteTask}
                    />
                  );
                })}

                {taskProvided.placeholder}

                {/* Botón "Cargar más" para no saturar el DOM */}
                {remainingCount > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setVisibleCount((prev) => prev + 50)}
                    className="mt-2 text-[10px] text-blue-600 hover:bg-blue-50 font-black uppercase flex flex-col h-auto py-2 border border-dashed border-blue-200 rounded-lg"
                  >
                    <span>Ver {remainingCount} tareas más</span>
                    <span className="text-[9px] opacity-70">Carga incremental para mayor fluidez</span>
                  </Button>
                )}

                {tasks.length === 0 && !taskSnapshot.isDraggingOver && (
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
};
