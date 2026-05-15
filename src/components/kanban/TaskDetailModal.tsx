"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { updateTaskStage, updateTaskDatesAndCascade, updateTaskAssignees, updateTaskStatus, updateTaskProgress, updateTaskPredecessors, updateTaskParent, updateTaskName, type TaskWithRelations, type TaskAssignee, deleteTask, deleteTaskOrphanChildren, updateTaskQuantity, updateTaskIsAssembly, getProjectMaterialsSummary, addMaterialToTask, removeMaterialFromTask, updateTaskDeliveryDays } from "@/lib/actions/tasks";
import { updateCatalogFromTask, updateCatalogMaterialsFromTask } from "@/lib/actions/catalog";
import { calculateEndDateAction, calculateHoursAction, getNextWorkingDayAction } from "@/lib/actions/time";
import { downloadMaterialReport } from "@/lib/utils/excel";
import { addCalendarDays } from "@/lib/external-calendar";
import { Package, Layers, GitBranch, Clock, CheckCircle2, PlayCircle, CheckCheck, XCircle, Percent, Trash2, X, Loader2, Hash, RefreshCw, Download, Save, UserPlus, Check } from "lucide-react";
import Swal from "sweetalert2";
import { TaskStatus } from "@prisma/client";
import { toast } from "sonner";

type Stage = { id: string; name: string; color: string }
type User = { id: string; name: string; email: string; role: string }

type Props = {
  task: TaskWithRelations | null
  stages: Stage[]
  users: User[]
  allTasks: TaskWithRelations[]
  onClose: () => void
  onTaskUpdated: (updated: TaskWithRelations) => void
  onCreateSubTask?: (parentId: string) => void
  onDeleteTask: (taskId: string, orphanChildren?: boolean) => void
  materials: { id: string; name: string }[]
  unitTypes: { id: string; name: string }[]
}

/** Convierte un Date o string ISO a input[type=datetime-local] value (YYYY-MM-DDTHH:mm) */
function toDateTimeLocalValue(d: Date | string): string {
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return ""
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  } catch {
    return ""
  }
}

function fromDateTimeInput(str: string): Date {
  return new Date(str)
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function TaskDetailModal({ task, stages, users, allTasks, onClose, onTaskUpdated, onCreateSubTask, onDeleteTask, materials, unitTypes }: Props) {
  const [isPending, startTransition] = useTransition();
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const isClosingRef = useRef(false);

  // Calcular unitHours inicial una sola vez
  const initialUnitHours = task?.unitEstimatedHours ?? ((task?.estimatedHours ?? 0) / (task?.quantity || 1));

  // Estados inicializados directamente desde task.
  // Gracias a key={selectedTask?.id} en KanbanBoard, este componente se
  // DESTRUYE y RECREA cada vez que cambias de tarea, así que useState
  // se ejecuta fresco cada vez. No hace falta useEffect de sincronización.
  const [localName, setLocalName] = useState(task?.name ?? "");
  const [selectedStage, setSelectedStage] = useState(task?.stage ?? "");
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(task?.status ?? "EN_PROCESO");
  const [localProgress, setLocalProgress] = useState(task?.progress ?? 0);
  const [startDate, setStartDate] = useState(() => toDateTimeLocalValue(task?.startDate ?? ""));
  const [endDate, setEndDate] = useState(() => toDateTimeLocalValue(task?.endDate ?? ""));
  const [estimatedHours, setEstimatedHours] = useState<number>(() => {
    const h = task?.estimatedHours ?? 0;
    if (task?.stage !== "Pedido Externo" && task?.stage !== "Entregado Externo" && h === 0 && task?.startDate && task?.endDate) {
      const start = new Date(task.startDate);
      const end = new Date(task.endDate);
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(1, Math.round(diffDays * 8));
    }
    return h;
  });
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<TaskAssignee[]>(task?.assignees ?? []);
  const [predecessorIds, setPredecessorIds] = useState<string[]>(task?.predecessors?.map(p => p.predecessor.id) ?? []);
  const [parentId, setParentId] = useState<string | null>(task?.parentId ?? null);
  const [localQuantity, setLocalQuantity] = useState(task?.quantity ?? 1);
  const [localIsAssembly, setLocalIsAssembly] = useState(task?.isAssembly ?? false);
  const [unitHours, setUnitHours] = useState(initialUnitHours);
  const [localDeliveryDays, setLocalDeliveryDays] = useState(() => {
    const d = task?.deliveryDays ?? 0;
    const isExt = task?.stage === "Pedido Externo" || task?.stage === "Entregado Externo";
    if (!isExt && d > 0) return 0;
    if (isExt && d === 0 && task?.startDate && task?.endDate) {
      const start = new Date(task.startDate);
      const end = new Date(task.endDate);
      return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }
    return d;
  });
  const [displayWeeks, setDisplayWeeks] = useState(() =>
    localDeliveryDays > 0 ? (localDeliveryDays / 7).toFixed(1) : ""
  );

  // Sincronizar displayWeeks cuando localDeliveryDays cambia externamente (useEffect, handleStageChange)
  useEffect(() => {
    setDisplayWeeks(localDeliveryDays > 0 ? (localDeliveryDays / 7).toFixed(1) : "");
  }, [localDeliveryDays]);

  // Nuevo material temporal
  const [newMaterialId, setNewMaterialId] = useState<string | null>(null);
  const [newMaterialQty, setNewMaterialQty] = useState(0);
  const [newUnitTypeId, setNewUnitTypeId] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");

  // Auto-calcular al cambiar de etapa si no hay valor
  useEffect(() => {
    const isExt = selectedStage === "Pedido Externo" || selectedStage === "Entregado Externo";
    if (isExt && localDeliveryDays === 0 && startDate && endDate) {
      const start = fromDateTimeInput(startDate);
      const end = fromDateTimeInput(endDate);
      const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      setLocalDeliveryDays(diffDays);
    }
    if (!isExt && estimatedHours === 0 && startDate && endDate) {
      const start = fromDateTimeInput(startDate);
      const end = fromDateTimeInput(endDate);
      const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      setEstimatedHours(Math.round(diffDays * 8));
      setUnitHours(Math.round(diffDays * 8) / (localQuantity || 1));
    }
  }, [selectedStage]);

  // Detección de cambios: comparamos contra task original (inmutable durante la vida del modal)
  const hasChanges = () => {
    if (!task || isSyncingCatalog) return false;

    const origAssigneeIds = (task.assignees ?? []).map(a => a.id).sort().join(',');
    const curAssigneeIds = selectedAssignees.map(a => a.id).sort().join(',');

    const origPredIds = (task.predecessors ?? []).map(p => p.predecessor.id).sort().join(',');
    const curPredIds = [...predecessorIds].sort().join(',');

    return (
      localName !== (task.name ?? "") ||
      selectedStage !== (task.stage ?? "") ||
      selectedStatus !== (task.status ?? "EN_PROCESO") ||
      localProgress !== (task.progress ?? 0) ||
      localIsAssembly !== (task.isAssembly ?? false) ||
      localQuantity !== (task.quantity ?? 1) ||
      localDeliveryDays !== (task.deliveryDays ?? 0) ||
      (parentId ?? null) !== (task.parentId ?? null) ||
      startDate !== toDateTimeLocalValue(task.startDate) ||
      endDate !== toDateTimeLocalValue(task.endDate) ||
      Math.abs(unitHours - initialUnitHours) > 0.05 ||
      origAssigneeIds !== curAssigneeIds ||
      origPredIds !== curPredIds
    );
  };

  const handleCloseAttempt = async () => {
    if (isClosingRef.current) return;

    if (!hasChanges()) {
      onClose();
      return;
    }

    const result = await Swal.fire({
      title: '¿Salir sin guardar?',
      text: "Tienes cambios sin guardar que se perderán.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Seguir editando',
      confirmButtonColor: '#ef4444',
      heightAuto: false
    });

    if (result.isConfirmed) {
      isClosingRef.current = true;
      onClose();
      setTimeout(() => { isClosingRef.current = false; }, 500);
    }
  };

  const handlePredecessorChange = async (newIds: string[]) => {
    setPredecessorIds(newIds);
    if (newIds.length === 0) return;

    const selectedDeps = allTasks.filter(t => newIds.includes(t.id));
    if (selectedDeps.length === 0) return;

    const maxEnd = new Date(Math.max(...selectedDeps.map(d => new Date(d.endDate).getTime())));

    setIsCalculating(true);
    try {
      const nextStart = await getNextWorkingDayAction(maxEnd);
      setStartDate(toDateTimeLocalValue(nextStart));
      const newEnd = await calculateEndDateAction(nextStart, estimatedHours);
      setEndDate(toDateTimeLocalValue(newEnd));
    } catch (err) {
      console.error("Error al recalcular fechas por dependencias:", err);
    } finally {
      setIsCalculating(false);
    }
  };
  const [showUserPicker, setShowUserPicker] = useState(false);
  const calcHoursTimer = useRef<NodeJS.Timeout | null>(null);
  const calcEndTimer = useRef<NodeJS.Timeout | null>(null);
  const [error, setError] = useState("");

  const handleCalculateEndDate = useCallback(async (startVal: string, hoursVal: number) => {
    if (!startVal || !hoursVal || hoursVal <= 0) return;
    setIsCalculating(true);
    try {
      const newEnd = await calculateEndDateAction(fromDateTimeInput(startVal), hoursVal);
      setEndDate(toDateTimeLocalValue(newEnd));
      setError("");
    } catch {
      // Silencioso
    } finally {
      setIsCalculating(false);
    }
  }, []);

  const handleCalculateHours = useCallback(async (startVal: string, endVal: string) => {
    if (!startVal || !endVal || startVal.length < 16 || endVal.length < 16) return;
    setIsCalculating(true);
    try {
      const start = fromDateTimeInput(startVal);
      const end = fromDateTimeInput(endVal);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
      const hours = await calculateHoursAction(start, end);
      setEstimatedHours(Number(hours.toFixed(1)));
      setUnitHours(Number((hours / (localQuantity || 1)).toFixed(1)));
      setError("");
    } catch {
      // Silencioso
    } finally {
      setIsCalculating(false);
    }
  }, [localQuantity]);

  const onStartDateChange = (val: string) => {
    setStartDate(val);
    if (calcEndTimer.current) clearTimeout(calcEndTimer.current);
    const isExt = selectedStage === "Pedido Externo" || selectedStage === "Entregado Externo";
    if (isExt && localDeliveryDays > 0) {
      const newEnd = addCalendarDays(fromDateTimeInput(val), localDeliveryDays);
      setEndDate(toDateTimeLocalValue(newEnd));
    } else {
      calcEndTimer.current = setTimeout(() => handleCalculateEndDate(val, estimatedHours), 500);
    }
  };

  const onEndDateChange = (val: string) => {
    setEndDate(val);
    const isExt = selectedStage === "Pedido Externo" || selectedStage === "Entregado Externo";
    if (isExt && startDate) {
      const start = fromDateTimeInput(startDate);
      const end = fromDateTimeInput(val);
      const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      setLocalDeliveryDays(diffDays);
      setDisplayWeeks((diffDays / 7).toFixed(1));
    } else {
      if (calcHoursTimer.current) clearTimeout(calcHoursTimer.current);
      calcHoursTimer.current = setTimeout(() => handleCalculateHours(startDate, val), 500);
    }
  };

  const onHoursChange = (val: number) => {
    setEstimatedHours(val);
    // Recalcular unitHours para que el label (unit x quantity) se actualice
    setUnitHours(Number((val / (localQuantity || 1)).toFixed(1)));
    if (calcEndTimer.current) clearTimeout(calcEndTimer.current);
    calcEndTimer.current = setTimeout(() => handleCalculateEndDate(startDate, val), 500);
  };

  const handleDownloadMaterials = async () => {
    if (!task) return;
    try {
      const summary = await getProjectMaterialsSummary(task.projectId, task.id);
      await downloadMaterialReport(summary, task.name);
    } catch (error) {
      console.error("Error al exportar materiales:", error);
      Swal.fire("Error", "No se pudo generar el Excel de materiales.", "error");
    }
  };

  const handleSyncMaterials = async () => {
    if (!task) return;
    if (!task.materials || task.materials.length === 0) {
      Swal.fire("Sin materiales", "No hay materiales para sincronizar.", "info");
      return;
    }
    Swal.fire({
      title: "Sincronizar materiales",
      text: "Esto actualizará los materiales en el catálogo maestro. ¿Continuar?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sincronizar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3b82f6"
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await updateCatalogMaterialsFromTask(task.id);
          toast.success("Materiales sincronizados correctamente");
        } catch (err) {
          toast.error("Error al sincronizar materiales");
          console.error(err);
        }
      }
    });
  };

  // Estados para búsqueda
  const [parentSearch, setParentSearch] = useState("");
  const [depSearch, setDepSearch] = useState("");

  if (!task) return null;

  const toggleAssignee = (user: User) => {
    setSelectedAssignees(prev => {
      const exists = prev.some(a => a.id === user.id);
      return exists ? prev.filter(a => a.id !== user.id) : [...prev, { id: user.id, name: user.name }];
    });
  };

  const handleStatusChange = (status: TaskStatus) => {
    setSelectedStatus(status);
    // Sugerencias automáticas de progreso
    if (status === "HECHO") setLocalProgress(100);
    else if (status === "EN_PROCESO") setLocalProgress(40);
    else if (status === "APROBADO") setLocalProgress(10);
    else if (status === "CANCELADO") setLocalProgress(0);
  };

  const handleStageChange = (stage: string) => {
    setSelectedStage(stage);
    if (stage === "Pedido Externo" || stage === "Entregado Externo") {
      if (startDate && endDate) {
        const start = fromDateTimeInput(startDate);
        const end = fromDateTimeInput(endDate);
        const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        setLocalDeliveryDays(diffDays);
      } else {
        setLocalDeliveryDays(localDeliveryDays > 0 ? localDeliveryDays : 7);
      }
    } else {
      if (startDate && endDate) {
        const start = fromDateTimeInput(startDate);
        const end = fromDateTimeInput(endDate);
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const diffHours = Math.max(1, Math.round(diffDays * 8));
        setEstimatedHours(diffHours);
        setUnitHours(diffHours / (localQuantity || 1));
      }
      setLocalDeliveryDays(0);
    }
  };

  const handleAddMaterial = async () => {
    if (!task || !newMaterialId) return;
    if (newMaterialQty <= 0) {
      setError("La cantidad de material debe ser mayor a 0");
      return;
    }
    if (!newUnitTypeId) {
      setError("Seleccione una unidad de medida para añadir el material");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await addMaterialToTask({
        taskId: task.id,
        materialId: newMaterialId,
        quantityPerUnit: newMaterialQty,
        unitTypeId: newUnitTypeId
      });
      if (res.success && res.link) {
        const mat = materials.find(m => m.id === newMaterialId);
        const ut = unitTypes.find(u => u.id === newUnitTypeId);

        const newMatLink = {
          id: res.link.id,
          material: { id: newMaterialId, name: mat?.name || "" },
          quantityPerUnit: newMaterialQty,
          unitType: ut ? { id: ut.id, name: ut.name } : null
        };

        const updatedTask = {
          ...task,
          materials: [...(task.materials || []), newMatLink]
        };
        onTaskUpdated(updatedTask);
        setNewMaterialId(null);
        setNewMaterialQty(0);
        setNewUnitTypeId(null);
        toast.success("Material añadido");
      } else {
        toast.error("Error al añadir material");
      }
    });
  };

  const handleRemoveMaterial = async (linkId: string) => {
    if (!task) return;
    startTransition(async () => {
      const res = await removeMaterialFromTask(linkId);
      if (res.success) {
        const updatedTask = {
          ...task,
          materials: (task.materials || []).filter(m => m.id !== linkId)
        };
        onTaskUpdated(updatedTask);
        toast.success("Material eliminado");
      } else {
        toast.error("Error al eliminar material");
      }
    });
  };

  const handleSave = async () => {
    if (!localName.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    if (!startDate) {
      setError("La fecha de inicio es obligatoria");
      return;
    }
    if (!endDate) {
      setError("La fecha de fin es obligatoria");
      return;
    }
    if (estimatedHours <= 0 && selectedStage !== "Pedido Externo" && selectedStage !== "Entregado Externo") {
      setError("Las horas deben ser mayor a 0");
      return;
    }
    if (localQuantity < 1) {
      setError("La cantidad debe ser mayor a 0");
      return false;
    }
    if (newMaterialId) {
      setError("Material seleccionado no agregado.")
      return
    }

    const success = await new Promise<boolean>((resolve) => {
      startTransition(async () => {
        setError("");
        const updates: Promise<unknown>[] = [];

        if (localName !== task.name) {
          updates.push(updateTaskName(task.id, localName));
        }

        if (selectedStage !== task.stage) {
          updates.push(updateTaskStage(task.id, selectedStage));
        }

        if (selectedStatus !== task.status) {
          updates.push(updateTaskStatus(task.id, selectedStatus));
        }

        if (localProgress !== task.progress) {
          updates.push(updateTaskProgress(task.id, localProgress));
        }

        let cascadedUpdates: TaskWithRelations[] = []
        if (startDate && endDate) {
          const origStart = toDateTimeLocalValue(task.startDate);
          const origEnd = toDateTimeLocalValue(task.endDate);
          if (startDate !== origStart || endDate !== origEnd || estimatedHours !== task.estimatedHours) {
            // Usamos cascade: actualiza la tarea y propaga a sucesoras
            const result = await updateTaskDatesAndCascade(
              task.id,
              fromDateTimeInput(startDate),
              fromDateTimeInput(endDate),
              estimatedHours,
              unitHours
            );
            cascadedUpdates = result.updated;
          }
        }

        const origIds = task.assignees.map((a: TaskAssignee) => a.id).sort().join(",");
        const newIds = selectedAssignees.map(a => a.id).sort().join(",");

        if (origIds !== newIds) {
          updates.push(updateTaskAssignees(task.id, selectedAssignees.map(a => a.id)));
        }

        const origPredIds = task.predecessors.map(p => p.predecessor.id).sort().join(",");
        const newPredIds = [...predecessorIds].sort().join(",");
        if (origPredIds !== newPredIds) {
          updates.push(updateTaskPredecessors(task.id, predecessorIds));
        }

        if (parentId !== task.parentId) {
          updates.push(updateTaskParent(task.id, parentId));
        }

        if (localQuantity !== task.quantity) {
          // updateTaskQuantity ya maneja el cascade internamente
          const res = await updateTaskQuantity(task.id, localQuantity);
          cascadedUpdates = [...cascadedUpdates, ...res.updated];
        }

        if (localDeliveryDays !== (task.deliveryDays ?? 0)) {
          updates.push(updateTaskDeliveryDays(task.id, localDeliveryDays));
        }

        if (localIsAssembly !== task.isAssembly) {
          const updatedTaskAssembly = await updateTaskIsAssembly(task.id, localIsAssembly);
          // Actualizamos la referencia local para que onTaskUpdated tenga el dato correcto
          onTaskUpdated(updatedTaskAssembly as TaskWithRelations);
        }

        // ASEGURAR QUE EL TIEMPO UNITARIO SE GUARDE SIEMPRE (especialmente para tareas antiguas con null)
        if (unitHours !== task.unitEstimatedHours) {
          // Si no hay una acción específica, podemos usar updateTaskDatesAndCascade con las fechas actuales
          // para forzar la actualización del campo unitEstimatedHours
          const res = await updateTaskDatesAndCascade(
            task.id,
            fromDateTimeInput(startDate),
            fromDateTimeInput(endDate),
            estimatedHours,
            unitHours
          );
          cascadedUpdates = [...cascadedUpdates, ...res.updated];
        }

        await Promise.all(updates);

        const updatedTask: TaskWithRelations = {
          ...task,
          name: localName,
          stage: selectedStage,
          status: selectedStatus,
          progress: localProgress,
          startDate: fromDateTimeInput(startDate),
          endDate: fromDateTimeInput(endDate),
          estimatedHours,
          unitEstimatedHours: unitHours,
          quantity: localQuantity,
          isAssembly: localIsAssembly,
          parentId,
          deliveryDays: localDeliveryDays,
          assignees: selectedAssignees,
          predecessors: predecessorIds.map(id => ({ predecessor: { id, name: allTasks.find(at => at.id === id)?.name || "" } }))
        };

        // Primero notificar la tarea principal con todos los datos locales actualizados
        onTaskUpdated(updatedTask);

        // Luego notificar cada tarea cascadeada (sucesoras que se movieron)
        for (const cascaded of cascadedUpdates.slice(1)) {
          onTaskUpdated(cascaded);
        }

        // Notificar al padre si cambió
        if (parentId !== task.parentId) {
          // Quitar del padre anterior
          if (task.parentId) {
            const oldParent = allTasks.find(t => t.id === task.parentId);
            if (oldParent) {
              const updatedOldParent = {
                ...oldParent,
                predecessors: oldParent.predecessors.filter(
                  (p: { predecessor: { id: string } }) => p.predecessor.id !== task.id
                ),
                subTasks: oldParent.subTasks.filter(
                  (s: { id: string }) => s.id !== task.id
                )
              };
              onTaskUpdated(updatedOldParent);
            }
          }
          // Añadir al nuevo padre
          if (parentId) {
            const parentTask = allTasks.find(t => t.id === parentId);
            if (parentTask) {
              const alreadyHasPred = parentTask.predecessors.some(
                (p: { predecessor: { id: string } }) => p.predecessor.id === task.id
              );
              const alreadyHasSub = parentTask.subTasks.some(
                (s: { id: string }) => s.id === task.id
              );
              const updatedParent = {
                ...parentTask,
                predecessors: alreadyHasPred
                  ? parentTask.predecessors
                  : [...parentTask.predecessors, { predecessor: { id: task.id, name: localName } }],
                subTasks: alreadyHasSub
                  ? parentTask.subTasks
                  : [...parentTask.subTasks, { id: task.id, name: localName, stage: selectedStage, status: selectedStatus }]
              };
              onTaskUpdated(updatedParent);
            }
          }
        }

        resolve(true);
      });
    });
    return success;
  };

  const handleSyncCatalog = async () => {
    if (!task) return;

    const isNew = !task.catalogPartId && !task.catalogOperationId;

    const result = await Swal.fire({
      title: isNew ? '¿Crear en catálogo?' : '¿Guardar como estándar?',
      text: isNew
        ? "Se creará una nueva pieza en el catálogo maestro con los datos de esta tarea."
        : "Este tiempo se guardará en el catálogo maestro para futuras producciones de esta pieza.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: isNew ? 'Sí, crear' : 'Sí, sincronizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#3b82f6',
    });

    if (result.isConfirmed) {
      setIsSyncingCatalog(true);
      try {
        // 1. AUTOSAVE: Asegurar que todo esté en DB
        await handleSave();

        // 2. ACTUALIZAR CATÁLOGO
        const syncRes = await updateCatalogFromTask(task.id);

        // 3. Si se creó una nueva pieza, notificar al kanban
        if (isNew && syncRes.catalogPartId) {
          onTaskUpdated({ ...task, catalogPartId: syncRes.catalogPartId } as TaskWithRelations);
        }

        // 4. Notificar al kanban sobre las dependencias que se actualizaron
        if (syncRes.updatedPredTaskIds?.length) {
          for (const predId of syncRes.updatedPredTaskIds) {
            const predTask = allTasks.find(t => t.id === predId);
            if (predTask) {
              onTaskUpdated({ ...predTask } as TaskWithRelations);
            }
          }
        }

        Swal.fire({
          title: isNew ? '¡Creado en Catálogo!' : '¡Maestro Actualizado!',
          text: isNew
            ? 'La pieza se ha creado en el catálogo maestro con sus materiales y datos.'
            : 'Se han guardado los cambios y el tiempo estándar en el catálogo.',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al sincronizar catálogo';
        Swal.fire('Error', message, 'error');
      } finally {
        setIsSyncingCatalog(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!task) return;

    const childrenCount = task.subTasks?.length || 0;

    if (childrenCount > 0) {
      const result = await Swal.fire({
        title: "¿Eliminar esta tarea?",
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
        // Eliminar todo (padre + hijos por cascade)
        startTransition(async () => {
          onDeleteTask(task.id);
          await deleteTask(task.id);
          onClose();
        });
      } else if (result.isDenied) {
        // Solo eliminar el padre, desvincular hijos
        startTransition(async () => {
          onDeleteTask(task.id, true);
          await deleteTaskOrphanChildren(task.id);
          onClose();
        });
      }
      // Cancelar → no hace nada
      return;
    }

    // Sin hijos: eliminación simple
    const result = await Swal.fire({
      title: "¿Eliminar esta tarea?",
      text: "Esta acción eliminará la pieza definitivamente.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      heightAuto: false
    });

    if (result.isConfirmed) {
      startTransition(async () => {
        onDeleteTask(task.id);
        await deleteTask(task.id);
        onClose();
      });
    }
  };

  const availableUsers = users.filter(u => !selectedAssignees.some(a => a.id === u.id));

  // Lógica de filtrado y ordenación para Tarea Padre
  const otherTasks = allTasks.filter(t => t.id !== task.id);

  const filteredParentTasks = otherTasks
    .filter(t => normalize(t.name).includes(normalize(parentSearch)))
    .sort((a, b) => {
      if (a.id === parentId) return -1;
      if (b.id === parentId) return 1;
      return a.name.localeCompare(b.name);
    });

  // Lógica de filtrado y ordenación para Dependencias
  const filteredDepTasks = otherTasks
    .filter(t => normalize(t.name).includes(normalize(depSearch)))
    .sort((a, b) => {
      const aSel = predecessorIds.includes(a.id);
      const bSel = predecessorIds.includes(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <Dialog open={!!task} onOpenChange={(open) => {
      // Si intentan cerrar (open=false) y hay una tarea activa, disparamos nuestra lógica
      if (!open && task) {
        handleCloseAttempt();
      }
    }}>
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto rounded-3xl kanban-scroll">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-4 justify-between">
            <div className="w-full flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLocalIsAssembly(!localIsAssembly)}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase transition-all cursor-pointer ${localIsAssembly === true ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-200'}`}
                title="Haz clic para cambiar entre Pieza y Ensamble"
              >
                <Package size={16} className={localIsAssembly === true ? "text-violet-500" : "text-blue-400"} /> {localIsAssembly ? 'Ensamble' : 'Pieza'}
              </button>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase bg-gray-100 text-gray-700 border border-gray-200`}>
                {selectedStatus.replace('_', ' ')}
              </span>
              {error && !error.includes("material") ? <p className="text-[12px] text-red-500 font-bold px-2 py-2 bg-red-50 rounded-xl  animate-pulse">{error}</p> : null}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 gap-2 cursor-pointer h-7 text-xs font-bold mx-2"
                >
                  <Trash2 size={16} />
                  Eliminar {task.isAssembly ? 'Ensamble' : 'Pieza'}
                </Button>
                {!task.catalogPartId && !task.catalogOperationId && (
                  <Button
                    variant="outline"
                    title="Crear pieza/ensamble con todas sus dependencias, materiales en catalogo maestro"
                    onClick={handleSyncCatalog}
                    disabled={isPending || isSyncingCatalog}
                    className="rounded-xl text-xs font-bold text-gray-500 hover:text-blue-600 hover:bg-blue-50 gap-1 cursor-pointer h-7 mx-2"
                  >
                    <RefreshCw size={12} />
                    Crear en catálogo
                  </Button>
                )}
              </div>
              <div className="flex gap-3 mr-8">
                <Button
                  onClick={async () => {
                    const ok = await handleSave();
                    if (ok) onClose();
                  }}
                  disabled={isPending}
                  className="rounded-xl bg-blue-100 hover:bg-blue-300 text-blue-600 font-bold px-4 cursor-pointer h-7 border-none"
                >
                  <Save />{isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
          <DialogTitle className="text-[11px] uppercase font-black tracking-wider text-gray-800 flex items-start gap-2 ml-3 flex-col">
            Nombre de la tarea / Pieza / Ensamble:
            <Input
              value={localName}
              onChange={e => setLocalName(e.target.value.toUpperCase())}
              className="font-semibold ml-[-2px] tracking-normal text-gray-500 border-none shadow-none focus-visible:ring-1 focus-visible:ring-blue-300 px-3 h-8 bg-transparent hover:bg-gray-100 transition-colors"
              placeholder="Nombre de la tarea..."
            />
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* COLUMNA IZQUIERDA: Progreso y Sub-tareas */}
          <div className="space-y-5">
            {/* Progreso */}
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-[11px] font-black tracking-wider uppercase text-gray-800 flex items-center gap-2">
                  <Percent size={12} className="text-blue-500" /> Progreso
                </Label>
                <span className="text-sm font-bold text-blue-600">{localProgress}%</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 bg-blue-600`}
                  style={{ width: `${localProgress}%` }}
                />
              </div>

              <div className="flex justify-between gap-1">
                {[0, 25, 50, 75, 100].map(val => (
                  <button
                    key={val}
                    onClick={() => setLocalProgress(val)}
                    className={`flex-1 py-1 rounded-md border text-[10px] font-medium transition-all cursor-pointer ${localProgress === val ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Estimación, Cantidad y Fechas */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800 flex items-center gap-1">
                  <Hash size={12} className="text-blue-500" /> Cantidad
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={localQuantity}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    if (isNaN(val)) {
                      setLocalQuantity(1);
                      return;
                    }
                    const q = Math.max(1, val);
                    setLocalQuantity(q);
                    if (q > 0) {
                      const newTotal = Number((q * unitHours).toFixed(1));
                      setEstimatedHours(newTotal);
                      handleCalculateEndDate(startDate, newTotal);
                    }
                  }}
                  className="text-sm h-9 rounded-xl text-gray-500 border-gray-200"
                />
              </div>

              <div className="space-y-1.5">
                {selectedStage === "Pedido Externo" || selectedStage === "Entregado Externo" ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800">
                        Semanas Entrega
                      </Label>
                      {task.catalogPartId && (
                        <button
                          type="button"
                          onClick={handleSyncCatalog}
                          disabled={isSyncingCatalog}
                          title="Actualizar las semanas en el catálogo maestro"
                          className="text-[10px] text-red-600 hover:text-red-800 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {isSyncingCatalog ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                          Sincronizar
                        </button>
                      )}
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={displayWeeks}
                      onChange={e => setDisplayWeeks(e.target.value)}
                      onBlur={e => {
                        const weeks = parseFloat(e.target.value);
                        if (!isNaN(weeks) && weeks >= 0.1) {
                          const days = Math.round(weeks * 7);
                          setLocalDeliveryDays(days);
                          setDisplayWeeks((days / 7).toFixed(1));
                          if (startDate) {
                            const newEnd = addCalendarDays(fromDateTimeInput(startDate), days);
                            setEndDate(toDateTimeLocalValue(newEnd));
                          }
                        } else {
                          setDisplayWeeks(localDeliveryDays > 0 ? (localDeliveryDays / 7).toFixed(1) : "");
                        }
                      }}
                      className="text-sm h-9 text-gray-500 rounded-xl border-gray-200"
                    />
                    <p className="text-[9px] text-gray-500 mt-1">({localDeliveryDays.toFixed(0)} días naturales · proveedor)</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800">
                        Horas Totales
                      </Label>
                      {(task.catalogPartId || task.catalogOperationId) && (
                        <button
                          type="button"
                          onClick={handleSyncCatalog}
                          disabled={isSyncingCatalog}
                          title="Actualizar las horas en el catálogo maestro para futuros despieces"
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {isSyncingCatalog ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                          Sincronizar
                        </button>
                      )}
                    </div>
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={estimatedHours || ""}
                      onChange={e => {
                        onHoursChange(Math.max(0, Number(Number(e.target.value).toFixed(1))))
                      }}
                      className="text-sm h-9 text-gray-500 rounded-xl border-gray-200"
                    />
                    <p className="text-[9px] text-gray-500 mt-1">({unitHours.toFixed(1)}h x 1 ud)</p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800 flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Inicio</Label>
                <Input type="datetime-local" value={startDate} onChange={e => onStartDateChange(e.target.value)} className="text-sm h-9 text-gray-500 rounded-xl border-gray-200 px-2 w-full" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-black tracking-wider text-gray-800 flex items-center justify-between">
                  <span className="flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Fin</span>
                </Label>
                <Input type="datetime-local" value={endDate} onChange={e => onEndDateChange(e.target.value)} className="text-sm h-9 text-gray-500 rounded-xl border-gray-200 px-2 w-full" />
              </div>
            </div>

            {/* SECCIÓN DE MATERIALES (LISTA) */}
            <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 space-y-4 sm:h-[370px] h-full">
              <div className="flex justify-between">
                <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                  <Package size={14} className="text-blue-500" /> Lista de Materiales Requeridos
                </Label>
                <div className="flex gap-2">
                  {task.catalogPartId && (
                    <button onClick={() => handleSyncMaterials()}
                      title="Actualizar los materiales de esta pieza en el catálogo maestro"
                      className="bg-purple-100 text-purple-800 hover:bg-purple-200 px-3 py-2 rounded-xl font-bold text-xs transition-colors flex items-center gap-1"
                      disabled={task?.materials?.length === 0}>
                      <RefreshCw size={12} /> Sincronizar
                    </button>
                  )}
                  <button onClick={() => handleDownloadMaterials()}
                    title="Descargar materiales"
                    className="bg-green-100 text-green-800 hover:bg-green-200 px-4 py-2 rounded-xl font-bold text-xs transition-colors flex items-center gap-2"
                    disabled={task?.materials?.length === 0}>
                    <Download size={12} /> Descargar
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-30 overflow-y-auto kanban-scroll pr-2">
                {task?.materials?.map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm transition-all hover:border-blue-200">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-gray-800">{m.material.name}</span>
                      <span className="text-[10px] text-gray-500 font-medium">{m.quantityPerUnit} {m.unitType?.name || "uds"} x unidad</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveMaterial(m.id)} className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                {(!task?.materials || task.materials.length === 0) && (
                  <div className="text-center py-6 px-4 bg-white/50 rounded-xl border border-dashed border-gray-200">
                    <Package size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 italic font-medium">No hay materiales asignados a esta tarea.</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 grid grid-cols-1 gap-4">
                <div className="space-y-1.5 w-full relative">
                  <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Añadir Material</Label>
                  <Input
                    placeholder="Buscar material (escribe para ver opciones)..."
                    value={materialSearch || materials.find(m => m.id === newMaterialId)?.name || ""}
                    onChange={(e) => {
                      setMaterialSearch(e.target.value.toUpperCase());
                      if (!e.target.value) setNewMaterialId("");
                    }}
                    onFocus={() => setMaterialSearch("")}
                    className="h-9 text-xs bg-white text-gray-700 font-medium border-gray-200"
                  />
                  {(materialSearch || newMaterialId) && (
                    <button
                      type="button"
                      title="Limpiar selección"
                      onClick={() => { setMaterialSearch(""); setNewMaterialId(null); }}
                      className="absolute right-2 top-7 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md p-0.5 transition-all cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}

                  {materialSearch && (
                    <div className="absolute z-20 mt-1 sm:w-[400px] w-full max-h-32 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-1 kanban-scroll">
                      {materials
                        .filter(m => normalize(m.name).includes(normalize(materialSearch)))
                        .map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { setNewMaterialId(m.id); setMaterialSearch(""); }}
                            className="w-full text-left px-3 py-1.5 text-[11px] font-medium hover:bg-gray-100 text-gray-700 transition-colors border-b last:border-0 border-gray-50"
                          >
                            {m.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-center items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cantidad x Unidad</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={newMaterialQty || ""}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setNewMaterialQty(isNaN(val) ? 0 : Number(val.toFixed(2)));
                      }}
                      className="h-8 border-gray-200 rounded-xl text-xs font-medium"
                    />
                  </div>
                  <div className="sm:w-[200px] w-full">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tipo Unidad</Label>
                    <Select value={unitTypes.find(u => u.id === newUnitTypeId)?.name || ""} onValueChange={setNewUnitTypeId}>
                      <SelectTrigger className="h-8 rounded-xl border-gray-200 text-xs font-medium w-full">
                        <SelectValue placeholder="seleccione..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl shadow-xl border-gray-100">
                        {unitTypes.map(u => (
                          <SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddMaterial} disabled={!newMaterialId || isPending} className="h-8 rounded-xl self-end cursor-pointer bg-blue-100 hover:bg-blue-300 text-blue-600 font-bold px-6 transition-all active:scale-95">
                    {isPending ? <Loader2 size={16} className="animate-spin" /> : "+Agr. Material"}
                  </Button>
                </div>
                {error.includes("material") && <p className="text-[12px] text-red-500 font-bold px-2 py-2 bg-red-50 rounded-xl  animate-pulse">{error}</p>}
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: Configuración y Relaciones */}
          <div className="space-y-5">
            {/* Estado y Etapa */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider">Estado</Label>
                <div className="grid grid-cols-1 gap-1">
                  {[
                    { id: 'APROBADO', label: 'Aprobado', icon: CheckCircle2, color: 'text-gray-900', bg: 'bg-white' },
                    { id: 'EN_PROCESO', label: 'En proceso', icon: PlayCircle, color: 'text-gray-900', bg: 'bg-white' },
                    { id: 'HECHO', label: 'Hecho', icon: CheckCheck, color: 'text-gray-900', bg: 'bg-white' },
                    { id: 'CANCELADO', label: 'Cancelado', icon: XCircle, color: 'text-gray-900', bg: 'bg-white' },
                  ].map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusChange(status.id as TaskStatus)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${selectedStatus === status.id
                        ? `bg-blue-50 text-blue-700 border-blue-200 shadow-sm`
                        : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'
                        }`}
                    >
                      <status.icon size={12} />
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider">Etapa</Label>
                <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto kanban-scroll">
                  {stages.map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleStageChange(s.name)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${selectedStage === s.name
                        ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                        : "bg-white text-gray-400 border-gray-100 hover:border-gray-200"
                        }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pertenece a: (Padre/Ensamble) */}
            <div className="space-y-1.5 mt-6">
              <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-1">
                <Layers size={14} className="text-blue-500" /> Pertenece a:
              </Label>

              <Input
                placeholder="Buscar ensamble o pieza padre..."
                value={parentSearch}
                onChange={e => setParentSearch(e.target.value)}
                className="h-8 text-[11px] rounded-lg border-gray-100"
              />

              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1 kanban-scroll">
                <button
                  onClick={() => setParentId(null)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${parentId === null
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                    }`}
                >
                  <span>(Ninguno)</span>
                  {parentId === null && <CheckCircle2 size={12} />}
                </button>
                {filteredParentTasks.map((t: TaskWithRelations) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (predecessorIds.includes(t.id)) {
                        Swal.fire('Error', 'No puedes pertenecer a una pieza que es tu propia dependencia.', 'error');
                        return;
                      }
                      setParentId(t.id);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${parentId === t.id
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-100 text-gray-500 hover:border-blue-200"
                      }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {t.isAssembly && <Package size={11} className="text-blue-400 shrink-0" />}
                      <span className="truncate">{t.name}</span>
                    </div>
                    {parentId === t.id && <CheckCircle2 size={11} className="shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Depende de: (Predecesores) */}
            <div className="space-y-1.5 mt-6">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-1">
                  <GitBranch size={14} className="text-blue-500" /> Depende de:
                </Label>
                <button
                  onClick={() => {
                    if (task && onCreateSubTask) {
                      onCreateSubTask(task.id);
                      onClose(); // Cerramos el actual para abrir el de creación
                    }
                  }}
                  className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                >
                  + Añadir nueva
                </button>
              </div>

              <Input
                placeholder="Buscar pieza de la que depende..."
                value={depSearch}
                onChange={e => setDepSearch(e.target.value)}
                className="h-8 text-[11px] rounded-lg border-gray-100"
              />

              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1 kanban-scroll">
                {filteredDepTasks.map((t: TaskWithRelations) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (parentId === t.id) {
                        Swal.fire('Error', 'No puedes depender de la pieza a la que perteneces.', 'error');
                        return;
                      }
                      handlePredecessorChange(predecessorIds.includes(t.id) ? predecessorIds.filter(x => x !== t.id) : [...predecessorIds, t.id]);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${predecessorIds.includes(t.id)
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-white border-gray-100 text-gray-500 hover:border-gray-200"
                      }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {t.isAssembly && <Package size={11} className="text-blue-400 shrink-0" />}
                      <span className="truncate">{t.name}</span>
                    </div>
                    {predecessorIds.includes(t.id) && <CheckCircle2 size={11} className="shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Asignados */}
            <div className="space-y-1.5 px-1 mt-8">
              <Label className="text-[11px] font-black text-gray-800 uppercase tracking-wider">Asignados</Label>
              <div className="flex flex-wrap gap-2 items-center p-2 bg-gray-50 rounded-2xl border border-gray-100 min-h-[50px]">
                {selectedAssignees.map(a => {
                  const u = users.find(x => x.id === a.id);
                  if (!u) return null;
                  return (
                    <div key={a.id} className="flex items-center gap-2 shrink-0 px-2.5 py-1.5 bg-white text-gray-700 rounded-xl border border-gray-200 text-xs font-bold shadow-sm">
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-black">{u.name.charAt(0)}</div>
                      {u.name.split(" ")[0]}
                      <button type="button" onClick={() => setSelectedAssignees(prev => prev.filter(p => p.id !== a.id))} className="ml-1 text-gray-300 hover:text-red-500 transition-colors cursor-pointer">✕</button>
                    </div>
                  );
                })}
                <Popover>
                  <PopoverTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-700 hover:text-gray-900 hover:border-gray-400 hover:bg-white transition-all cursor-pointer">
                    <UserPlus size={14} /> Añadir
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0 rounded-2xl shadow-xl border-gray-100" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar usuario..." className="text-xs h-10" />
                      <CommandList className="kanban-scroll">
                        <CommandEmpty className="py-2 px-4 text-xs text-gray-500">No hay usuarios.</CommandEmpty>
                        <CommandGroup>
                          {availableUsers.map(u => (
                            <CommandItem
                              key={u.id}
                              value={u.name}
                              onSelect={() => toggleAssignee(u)}
                              className="cursor-pointer text-xs p-2"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold bg-gray-400">
                                  {u.name.charAt(0)}
                                </div>
                                <span className="font-bold">{u.name.split(" ")[0]}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>

        <Separator className="bg-gray-100" />
      </DialogContent>
    </Dialog>
  );
}
