"use client";

import React, { memo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Package, ChevronDown, ChevronUp, CheckCircle2, PlayCircle, AlertCircle, CheckCheck, XCircle, Percent } from "lucide-react";
import { TaskWithRelations } from "@/lib/actions/tasks";

interface TaskCardProps {
  task: TaskWithRelations;
  index: number;
  isExpanded: boolean;
  columnColor: string;
  projectSubTasks: TaskWithRelations[];
  onToggleExpand: (id: string, e: React.MouseEvent) => void;
  onSelectTask: (task: TaskWithRelations) => void;
}

export const TaskCard = memo(({
  task,
  index,
  isExpanded,
  columnColor,
  projectSubTasks,
  onToggleExpand,
  onSelectTask,
}: TaskCardProps) => {
  const totalSubs = projectSubTasks.length;
  const completedSubs = projectSubTasks.filter(s => s.status === "HECHO").length;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(taskDrag, taskDragSnapshot) => (
        <div
          ref={taskDrag.innerRef}
          {...taskDrag.draggableProps}
          {...taskDrag.dragHandleProps}
          onClick={() => onSelectTask(task)}
          className={`bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer transition-all ${
            taskDragSnapshot.isDragging
              ? "shadow-xl rotate-1 scale-[1.02]"
              : "hover:shadow-md hover:-translate-y-0.5"
          } ${task.status === "HECHO" ? "grayscale opacity-75 bg-gray-50 border-gray-300" : ""} ${
            task.status === "CANCELADO" ? "opacity-50" : ""
          }`}
        >
          <div className="p-3">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {task.isAssembly && <Package size={13} className="text-purple-500 shrink-0 mt-0.5" />}
                <p className="font-semibold text-sm text-gray-900 leading-tight truncate">{task.name}</p>
                <div className="shrink-0 flex items-center h-full">
                  {task.status === "APROBADO" && <CheckCircle2 size={12} className="text-emerald-500" />}
                  {task.status === "EN_PROCESO" && <PlayCircle size={12} className="text-blue-500" />}
                  {task.status === "CAMBIOS_SOLICITADOS" && <AlertCircle size={12} className="text-amber-500" />}
                  {task.status === "HECHO" && <CheckCheck size={12} className="text-gray-500" />}
                  {task.status === "CANCELADO" && <XCircle size={12} className="text-red-500" />}
                </div>
              </div>
              {totalSubs > 0 && (
                <button
                  onClick={(e) => onToggleExpand(task.id, e)}
                  className="text-gray-400 hover:text-gray-600 shrink-0 p-0.5 cursor-pointer"
                >
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
                    style={{ width: `${(completedSubs / totalSubs) * 100}%`, backgroundColor: columnColor }}
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

            {/* Progreso Manual */}
            <div className="mb-2.5">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span className="flex items-center gap-0.5"><Percent size={10} /> Progreso</span>
                <span className="font-bold text-gray-600">{task.progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    task.status === "HECHO" ? "bg-green-500" : task.status === "CANCELADO" ? "bg-gray-400" : "bg-blue-600"
                  }`}
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
                      style={{ backgroundColor: columnColor }}
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
});

TaskCard.displayName = "TaskCard";
