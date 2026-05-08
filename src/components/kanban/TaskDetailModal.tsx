"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { updateTaskStage, updateTaskDatesAndCascade, updateTaskAssignees, updateTaskStatus, updateTaskProgress, createTask, updateTaskPredecessors, updateTaskParent, updateTaskName, type TaskWithRelations, type TaskAssignee, deleteTask, updateTaskQuantity, updateTaskIsAssembly } from "@/lib/actions/tasks";
import { updateCatalogFromTask } from "@/lib/actions/catalog";
import { calculateEndDateAction, calculateHoursAction, getNextWorkingDayAction } from "@/lib/actions/time";
import { Package, Layers, GitBranch, Clock, Plus, X, CheckCircle2, PlayCircle, CheckCheck, XCircle, Percent, Trash2, Calculator, Loader2, Hash, RefreshCw } from "lucide-react";
import Swal from "sweetalert2";
import { TaskStatus } from "@prisma/client";

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
  onDeleteTask: (taskId: string) => void
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

export function TaskDetailModal({ task, stages, users, allTasks, onClose, onTaskUpdated, onCreateSubTask, onDeleteTask }: Props) {
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
  const [estimatedHours, setEstimatedHours] = useState<number>(task?.estimatedHours ?? 0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<TaskAssignee[]>(task?.assignees ?? []);
  const [predecessorIds, setPredecessorIds] = useState<string[]>(task?.predecessors?.map(p => p.predecessor.id) ?? []);
  const [parentId, setParentId] = useState<string | null>(task?.parentId ?? null);
  const [localQuantity, setLocalQuantity] = useState(task?.quantity ?? 1);
  const [localIsAssembly, setLocalIsAssembly] = useState(task?.isAssembly ?? false);
  const [unitHours, setUnitHours] = useState(initialUnitHours);

  const hasHoursChanged = Math.abs(unitHours - initialUnitHours) > 0.05;

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
      (parentId ?? null) !== (task.parentId ?? null) ||
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
  const [newSubTaskName, setNewSubTaskName] = useState("");
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
      setEstimatedHours(hours);
      setUnitHours(hours / (localQuantity || 1));
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
    calcEndTimer.current = setTimeout(() => handleCalculateEndDate(val, estimatedHours), 500);
  };

  const onEndDateChange = (val: string) => {
    setEndDate(val);
    if (calcHoursTimer.current) clearTimeout(calcHoursTimer.current);
    calcHoursTimer.current = setTimeout(() => handleCalculateHours(startDate, val), 500);
  };

  const onHoursChange = (val: number) => {
    setEstimatedHours(val);
    // Recalcular unitHours para que el label (unit x quantity) se actualice
    setUnitHours(val / (localQuantity || 1));
    if (calcEndTimer.current) clearTimeout(calcEndTimer.current);
    calcEndTimer.current = setTimeout(() => handleCalculateEndDate(startDate, val), 500);
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

  const handleCreateSubTask = async () => {
    if (!newSubTaskName.trim()) return;
    startTransition(async () => {
      const sub = await createTask({
        name: newSubTaskName.trim(),
        projectId: task.projectId,
        parentId: task.id,
        stage: stages[0]?.name ?? "Pendiente",
        startDate: task.startDate,
        endDate: task.endDate,
        progress: 0,
        status: "EN_PROCESO"
      });

      // Notificar al tablero sobre la nueva sub-tarea
      onTaskUpdated(sub as unknown as TaskWithRelations);

      setNewSubTaskName("");
    });
  };

  const handleSave = async () => {
    return new Promise<TaskWithRelations[]>((resolve) => {
      startTransition(async () => {
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

        const updatedTask = {
          ...task,
          name: localName,
          stage: selectedStage,
          status: selectedStatus,
          progress: localProgress,
          isAssembly: localIsAssembly,
          estimatedHours: estimatedHours,
          startDate: startDate ? fromDateTimeInput(startDate) : task.startDate,
          endDate: endDate ? fromDateTimeInput(endDate) : task.endDate,
          assignees: selectedAssignees,
          parentId: parentId,
          quantity: localQuantity,
          unitEstimatedHours: unitHours,
          predecessors: predecessorIds.map(id => ({ predecessor: { id, name: allTasks.find((t: TaskWithRelations) => t.id === id)?.name || "" } })),
        };

        // Primero notificar la tarea principal con todos los datos locales actualizados
        onTaskUpdated(updatedTask);

        // Luego notificar cada tarea cascadeada (sucesoras que se movieron)
        for (const cascaded of cascadedUpdates.slice(1)) {
          onTaskUpdated(cascaded);
        }

        resolve([updatedTask, ...cascadedUpdates.slice(1)]);
      });
    });
  };

  const handleSyncCatalog = async () => {
    if (!task) return;

    const result = await Swal.fire({
      title: '¿Guardar como estándar?',
      text: "Este tiempo se guardará en el catálogo maestro para futuras producciones de esta pieza.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, sincronizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#3b82f6',
    });

    if (result.isConfirmed) {
      setIsSyncingCatalog(true);
      try {
        // 1. AUTOSAVE: Asegurar que todo esté en DB
        await handleSave();

        // 2. ACTUALIZAR CATÁLOGO
        await updateCatalogFromTask(task.id);

        Swal.fire({
          title: '¡Maestro Actualizado!',
          text: 'Se han guardado los cambios y el tiempo estándar en el catálogo.',
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

    const result = await Swal.fire({
      title: "¿Eliminar esta tarea?",
      text: task.isAssembly
        ? "¡Cuidado! Se eliminarán también todas las sub-piezas y tareas vinculadas a este ensamble."
        : "Esta acción eliminará la pieza definitivamente.",
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

  const completedSubs = task.subTasks.filter(s => s.status === "HECHO").length;
  const totalSubs = task.subTasks.length;

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
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => setLocalIsAssembly(!localIsAssembly)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase transition-all cursor-pointer ${localIsAssembly ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              title="Haz clic para cambiar entre Pieza y Ensamble"
            >
              <Package size={10} /> {localIsAssembly ? 'Ensamble' : 'Pieza'}
            </button>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${selectedStatus === 'HECHO' ? 'bg-green-100 text-green-700' : selectedStatus === 'CANCELADO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {selectedStatus.replace('_', ' ')}
            </span>
          </div>
          <DialogTitle className="text-lg font-bold text-gray-900 pr-8">
            <Input
              value={localName}
              onChange={e => setLocalName(e.target.value)}
              className="font-bold ml-1 text-lg border-none shadow-none focus-visible:ring-1 focus-visible:ring-blue-400 px-3 h-9 bg-transparent hover:bg-gray-100 transition-colors"
              placeholder="Nombre de la tarea..."
            />
          </DialogTitle>
          <DialogDescription className="sr-only">Detalles de la tarea {task.name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* COLUMNA IZQUIERDA: Progreso y Sub-tareas */}
          <div className="space-y-5">
            {/* Progreso */}
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Percent size={14} className="text-blue-500" /> Progreso
                </Label>
                <span className="text-sm font-bold text-blue-600">{localProgress}%</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${selectedStatus === 'HECHO' ? 'bg-green-500' : selectedStatus === 'CANCELADO' ? 'bg-gray-400' : 'bg-blue-500'}`}
                  style={{ width: `${localProgress}%` }}
                />
              </div>

              <div className="flex justify-between gap-1">
                {[0, 25, 50, 75, 100].map(val => (
                  <button
                    key={val}
                    onClick={() => setLocalProgress(val)}
                    className={`flex-1 py-1 rounded-md border text-[10px] font-medium transition-all cursor-pointer ${localProgress === val ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Estimación, Cantidad y Fechas */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Hash size={12} className="text-blue-500" /> Cantidad
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={localQuantity}
                  onChange={e => {
                    const q = Math.max(1, Number(e.target.value));
                    setLocalQuantity(q);
                    setEstimatedHours(Math.round(q * unitHours));
                    // No recalculamos fin aquí, se hará al guardar o si tocan fechas
                  }}
                  className="text-sm h-9 rounded-xl border-gray-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                  Horas Totales
                  <button type="button" onClick={() => handleCalculateHours(startDate, endDate)} disabled={isCalculating} className="text-blue-500 hover:text-blue-700 disabled:opacity-50 cursor-pointer" title="Calcular horas según fechas">
                    {isCalculating ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                  </button>
                </Label>
                <Input type="number" step="0.1" min="0" value={estimatedHours || ""} onChange={e => onHoursChange(Number(Number(e.target.value).toFixed(1)))} className="text-sm h-9 rounded-xl border-gray-200" />
                <p className="text-[9px] text-gray-400 mt-1">({unitHours.toFixed(1)}h x {localQuantity} ud)</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Inicio</Label>
                <Input type="datetime-local" value={startDate} onChange={e => onStartDateChange(e.target.value)} className="text-sm h-9 rounded-xl border-gray-200 px-2 w-full" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Fin</span>
                  <button type="button" onClick={() => handleCalculateEndDate(startDate, estimatedHours)} disabled={isCalculating} className="text-blue-500 hover:text-blue-700 disabled:opacity-50 cursor-pointer" title="Calcular fin según horas">
                    {isCalculating ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                  </button>
                </Label>
                <Input type="datetime-local" value={endDate} onChange={e => onEndDateChange(e.target.value)} className="text-sm h-9 rounded-xl border-gray-200 px-2 w-full" />
              </div>
            </div>
            {error && <p className="text-sm text-red-500 font-bold px-1">{error}</p>}
            {/* Asignados */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700">Asignados</Label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-xl border border-gray-100 min-h-[42px]">
                {selectedAssignees.map(a => (
                  <div key={a.id} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1 group">
                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-[8px]">
                      {a.name.charAt(0)}
                    </div>
                    <span className="text-[10px] font-medium text-gray-700">{a.name.split(" ")[0]}</span>
                    <button onClick={() => setSelectedAssignees(prev => prev.filter(p => p.id !== a.id))} className="text-gray-300 hover:text-red-500 transition-colors cursor-pointer">
                      <X size={10} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setShowUserPicker(v => !v)}
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:bg-blue-50 rounded-lg px-2 py-1 border border-dashed border-blue-200 transition-all cursor-pointer"
                >
                  <Plus size={12} /> Añadir
                </button>
              </div>

              {showUserPicker && availableUsers.length > 0 && (
                <div className="absolute z-10 mt-1 border border-gray-100 rounded-xl bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                  {availableUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { toggleAssignee(u); setShowUserPicker(false); }}
                      className="flex items-center gap-3 w-full px-4 py-2 hover:bg-blue-50 text-left transition-colors border-b last:border-0 border-gray-50 cursor-pointer"
                    >
                      <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-bold">
                        {u.name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-700">{u.name}</span>
                        <span className="text-[10px] text-gray-400">{u.role}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* COLUMNA DERECHA: Configuración y Relaciones */}
          <div className="space-y-5">
            {/* Estado y Etapa */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</Label>
                <div className="grid grid-cols-1 gap-1">
                  {[
                    { id: 'APROBADO', label: 'Aprobado', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { id: 'EN_PROCESO', label: 'En proceso', icon: PlayCircle, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { id: 'HECHO', label: 'Hecho', icon: CheckCheck, color: 'text-gray-600', bg: 'bg-gray-100' },
                    { id: 'CANCELADO', label: 'Cancelado', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
                  ].map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusChange(status.id as TaskStatus)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${selectedStatus === status.id
                        ? `${status.bg} ${status.color} border-blue-400 shadow-sm`
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
                <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Etapa</Label>
                <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto">
                  {stages.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStage(s.name)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${selectedStage === s.name
                        ? "bg-blue-50 border-blue-400 text-blue-700 shadow-sm"
                        : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                        }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pertenece a: (Padre/Ensamble) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <Layers size={14} className="text-purple-500" /> Pertenece a:
              </Label>

              <Input
                placeholder="Buscar ensamble o pieza padre..."
                value={parentSearch}
                onChange={e => setParentSearch(e.target.value)}
                className="h-8 text-[11px] rounded-lg border-gray-100"
              />

              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1">
                <button
                  onClick={() => setParentId(null)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${parentId === null
                    ? "bg-purple-50 border-purple-300 text-purple-700"
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
                      ? "bg-purple-50 border-purple-300 text-purple-700"
                      : "bg-white border-gray-100 text-gray-500 hover:border-purple-200"
                      }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {t.isAssembly && <Package size={11} className="text-purple-400 shrink-0" />}
                      <span className="truncate">{t.name}</span>
                    </div>
                    {parentId === t.id && <CheckCircle2 size={11} className="shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Depende de: (Predecesores) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <GitBranch size={14} className="text-blue-500" /> Depende de:
                </Label>
                <button 
                  onClick={() => {
                    if (task && onCreateSubTask) {
                      onCreateSubTask(task.id);
                      onClose(); // Cerramos el actual para abrir el de creación
                    }
                  }}
                  className="text-[10px] text-blue-500 font-bold hover:underline cursor-pointer"
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

              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1">
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
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-100 text-gray-500 hover:border-blue-200"
                      }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {t.isAssembly && <Package size={11} className="text-purple-400 shrink-0" />}
                      <span className="truncate">{t.name}</span>
                    </div>
                    {predecessorIds.includes(t.id) && <CheckCircle2 size={11} className="shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Separator className="bg-gray-100" />

        <div className="flex items-center justify-between gap-3 p-4 bg-gray-50/50 rounded-xl">
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 gap-2 cursor-pointer h-9 text-xs"
            >
              <Trash2 size={16} />
              Eliminar {task.isAssembly ? 'Ensamble' : 'Pieza'}
            </Button>

            {(task.catalogPartId || task.catalogOperationId) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSyncCatalog}
                disabled={isSyncingCatalog}
                title="Actualizar este tiempo en el catálogo maestro para futuros despieces"
                className="text-xs h-9 gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 ml-2 rounded-xl transition-all"
              >
                {isSyncingCatalog ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} className={hasHoursChanged ? "animate-pulse" : ""} />
                )}
                Horas Pieza
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCloseAttempt} disabled={isPending} className="rounded-xl cursor-pointer">
              Cerrar sin guardar
            </Button>
            <Button
              onClick={async () => {
                await handleSave();
                onClose();
              }}
              disabled={isPending}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 cursor-pointer"
            >
              {isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
