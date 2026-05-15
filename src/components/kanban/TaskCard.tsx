"use client";

import React, { memo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Package, ChevronDown, ChevronUp, CheckCircle2, PlayCircle, AlertCircle, CheckCheck, XCircle, Percent, Trash2 } from "lucide-react";
import { TaskWithRelations, deleteTask, deleteTaskOrphanChildren } from "@/lib/actions/tasks";
import Swal from "sweetalert2";

interface TaskCardProps {
  task: TaskWithRelations;
  index: number;
  isExpanded: boolean;
  columnColor: string;
  projectSubTasks: TaskWithRelations[];
  allTasks: TaskWithRelations[]; // Añadimos allTasks para el 2do nivel
  onToggleExpand: (id: string, e: React.MouseEvent) => void;
  onSelectTask: (task: TaskWithRelations) => void;
  onDeleteTask: (taskId: string, orphanChildren?: boolean) => void;
}

export const TaskCard = memo(({
  task,
  index,
  isExpanded,
  columnColor,
  projectSubTasks,
  allTasks,
  onToggleExpand,
  onSelectTask,
  onDeleteTask,
}: TaskCardProps) => {
  const totalSubs = projectSubTasks.length;

  // Cálculo de Progreso Real basado en Horas
  const subTasksHours = projectSubTasks.reduce((acc, s) => acc + (s.estimatedHours || 0), 0);
  const subTasksDoneHours = projectSubTasks.reduce((acc, s) => acc + (s.status === "HECHO" ? (s.estimatedHours || 0) : 0), 0);

  const selfHours = task.estimatedHours || 0;
  const selfDoneHours = (task.progress / 100) * selfHours;

  const totalGroupHours = subTasksHours + selfHours;
  const totalGroupDoneHours = subTasksDoneHours + selfDoneHours;

  const realProgress = totalGroupHours > 0
    ? Math.round((totalGroupDoneHours / totalGroupHours) * 100)
    : task.progress;

  const completedSubs = projectSubTasks.filter(s => s.status === "HECHO").length;

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    const childrenCount = task.subTasks?.length || 0;

    if (childrenCount > 0) {
      const result = await Swal.fire({
        title: "¿Eliminar tarea?",
        html: `Esta tarea tiene <strong>${childrenCount} sub-tarea(s)</strong>.<br/><br/>¿Qué deseas hacer con ellas?`,
        icon: "warning",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: "Eliminar todo",
        denyButtonText: "Solo esta tarea",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#ef4444",
        denyButtonColor: "#f59e0b",
        heightAuto: false
      });

      if (result.isConfirmed) {
        onDeleteTask(task.id);
        await deleteTask(task.id);
      } else if (result.isDenied) {
        onDeleteTask(task.id, true);
        await deleteTaskOrphanChildren(task.id);
      }
      return;
    }

    const result = await Swal.fire({
      title: "¿Eliminar tarea?",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      heightAuto: false
    });

    if (result.isConfirmed) {
      onDeleteTask(task.id);
      await deleteTask(task.id);
    }
  };

  return (
    <Draggable draggableId={task.id} index={index}>
      {(taskDrag, taskDragSnapshot) => (
        <div
          ref={taskDrag.innerRef}
          {...taskDrag.draggableProps}
          {...taskDrag.dragHandleProps}
          onClick={() => onSelectTask(task)}
          className={`bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer transition-all ${taskDragSnapshot.isDragging
            ? "shadow-xl rotate-1 scale-[1.02]"
            : "hover:shadow-md hover:-translate-y-0.5"
            } ${task.status === "HECHO" ? "grayscale opacity-75 bg-gray-50 border-gray-300" : ""} ${task.status === "CANCELADO" ? "opacity-50" : ""
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
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleDeleteClick}
                  className="text-gray-300 hover:text-red-500 rounded p-0.5 transition-colors cursor-pointer"
                  title="Eliminar tarea"
                >
                  <Trash2 size={13} />
                </button>
                {totalSubs > 0 && (
                  <button
                    onClick={(e) => onToggleExpand(task.id, e)}
                    className="text-gray-400 hover:text-gray-600 shrink-0 p-0.5 cursor-pointer"
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap items-center mb-1.5">
              {task.isAssembly && (
                <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  Ensamble
                </span>
              )}
              {task.quantity > 1 && (
                <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                  x{task.quantity}
                </span>
              )}
            </div>

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
                <ul className="mt-2 space-y-1">
                  {projectSubTasks.slice(0, isExpanded ? undefined : 2).map(sub => {
                    // Buscar sub-dependencias (2do nivel)
                    const subSubIds = sub.predecessors.map(p => p.predecessor.id);
                    const subSubTasks = allTasks.filter(t => subSubIds.includes(t.id));

                    return (
                      <div key={sub.id} className="flex flex-col">
                        <li
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTask(sub);
                          }}
                          className="flex items-center justify-between gap-1.5 text-[11px] text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors group/sub"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${sub.status === "HECHO" ? "bg-green-500" : "bg-gray-300"}`} />
                            <span className="truncate group-hover/sub:text-blue-600 transition-colors font-medium">
                              {sub.isAssembly && <Package size={10} className="inline mr-1 text-purple-400" />}
                              {sub.name}
                            </span>
                          </div>
                          {sub.assignees.length > 0 && (
                            <div className="flex gap-[1.1px] shrink-0 ml-1.5">
                              {sub.assignees.slice(0, 3).map(a => (
                                <div
                                  key={a.id}
                                  title={a.name}
                                  className="w-[16px] h-[16px] rounded-full ring-1 ring-white flex items-center justify-center text-white font-bold text-[8px] shadow-sm"
                                  style={{ backgroundColor: columnColor }}
                                >
                                  {a.name.charAt(0)}
                                </div>
                              ))}
                            </div>
                          )}
                        </li>

                        {/* 2do Nivel de Anidación */}
                        {isExpanded && subSubTasks.length > 0 && (
                          <div className="ml-4 border-l-2 border-gray-100 pl-2 mt-0.5 space-y-0.5 mb-1">
                            {subSubTasks.slice(0, 3).map(ss => (
                              <div
                                key={ss.id}
                                className="flex items-center gap-1.5 text-[9px] text-gray-400 hover:text-blue-500 transition-colors cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); onSelectTask(ss); }}
                              >
                                <div className={`w-1 h-1 rounded-full ${ss.status === "HECHO" ? "bg-green-400" : "bg-gray-200"}`} />
                                <span className="truncate max-w-[150px]">{ss.name}</span>
                              </div>
                            ))}
                            {subSubTasks.length > 3 && <span className="text-[8px] text-gray-300 ml-2">...</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!isExpanded && totalSubs > 2 && (
                    <li
                      className="text-[10px] text-gray-400 font-medium text-center pt-1 pb-0.5 cursor-pointer hover:text-gray-600 transition-colors"
                      onClick={(e) => onToggleExpand(task.id, e)}
                    >
                      + {totalSubs - 2} tareas más...
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Progreso Manual */}
            <div className="mb-2.5">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span className="flex items-center gap-0.5"><Percent size={10} /> Progreso</span>
                <span className="font-bold text-gray-600">{realProgress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${task.status === "HECHO" ? "bg-green-500" : task.status === "CANCELADO" ? "bg-gray-400" : "bg-blue-600"
                    }`}
                  style={{ width: `${realProgress}%` }}
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