"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { updateTaskStage, updateTaskDates, updateTaskAssignees, updateTaskStatus, updateTaskProgress, createTask, updateTaskPredecessors, updateTaskParent, type TaskWithRelations, type TaskAssignee } from "@/lib/actions/tasks";
import { Package, GitBranch, Clock, Plus, X, CheckCircle2, PlayCircle, CheckCheck, XCircle, Percent } from "lucide-react";
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

export function TaskDetailModal({ task, stages, users, allTasks, onClose, onTaskUpdated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedStage, setSelectedStage] = useState(task?.stage ?? "");
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(task?.status ?? "EN_PROCESO");
  const [localProgress, setLocalProgress] = useState(task?.progress ?? 0);
  const [startDate, setStartDate] = useState(() => toDateTimeLocalValue(task?.startDate ?? ""));
  const [endDate, setEndDate] = useState(() => toDateTimeLocalValue(task?.endDate ?? ""));
  const [selectedAssignees, setSelectedAssignees] = useState<TaskAssignee[]>(task?.assignees ?? []);
  const [predecessorIds, setPredecessorIds] = useState<string[]>(task?.predecessors.map(p => p.predecessor.id) ?? []);
  const [parentId, setParentId] = useState<string | null>(task?.parentId ?? null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [newSubTaskName, setNewSubTaskName] = useState("");

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

  const handleSave = () => {
    startTransition(async () => {
      const updates: Promise<unknown>[] = [];

      if (selectedStage !== task.stage) {
        updates.push(updateTaskStage(task.id, selectedStage));
      }

      if (selectedStatus !== task.status) {
        updates.push(updateTaskStatus(task.id, selectedStatus));
      }

      if (localProgress !== task.progress) {
        updates.push(updateTaskProgress(task.id, localProgress));
      }

      // Solo actualizar fechas si son válidas (no vacías) y han cambiado
      if (startDate && endDate) {
        const origStart = toDateTimeLocalValue(task.startDate);
        const origEnd = toDateTimeLocalValue(task.endDate);
        if (startDate !== origStart || endDate !== origEnd) {
          updates.push(updateTaskDates(task.id, fromDateTimeInput(startDate), fromDateTimeInput(endDate)));
        }
      }

      const origIds = task.assignees.map((a: TaskAssignee) => a.id).sort().join(",");
      const newIds = selectedAssignees.map(a => a.id).sort().join(",");
      if (origIds !== newIds) {
        updates.push(updateTaskAssignees(task.id, selectedAssignees.map(a => a.id)));
      }

      // Nuevas actualizaciones: Dependencias y Padre
      const origPredIds = task.predecessors.map(p => p.predecessor.id).sort().join(",");
      const newPredIds = [...predecessorIds].sort().join(",");
      if (origPredIds !== newPredIds) {
        updates.push(updateTaskPredecessors(task.id, predecessorIds));
      }

      if (parentId !== task.parentId) {
        updates.push(updateTaskParent(task.id, parentId));
      }

      await Promise.all(updates);

      onTaskUpdated({
        ...task,
        stage: selectedStage,
        status: selectedStatus,
        progress: localProgress,
        startDate: startDate ? fromDateTimeInput(startDate) : task.startDate,
        endDate: endDate ? fromDateTimeInput(endDate) : task.endDate,
        assignees: selectedAssignees,
        parentId: parentId,
        predecessors: predecessorIds.map(id => ({ predecessor: { id, name: allTasks.find((t: TaskWithRelations) => t.id === id)?.name || "" } })),
      });
      onClose();
    });
  };

  const completedSubs = task.subTasks.filter(s => s.status === "HECHO").length;
  const totalSubs = task.subTasks.length;

  const availableUsers = users.filter(u => !selectedAssignees.some(a => a.id === u.id));

  return (
    <Dialog open={!!task} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {task.isAssembly && (
              <span className="flex items-center gap-1 text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold uppercase">
                <Package size={10} /> Ensamble
              </span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${selectedStatus === 'HECHO' ? 'bg-green-100 text-green-700' : selectedStatus === 'CANCELADO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {selectedStatus.replace('_', ' ')}
            </span>
          </div>
          <DialogTitle className="text-lg font-bold text-gray-900">
            {task.name}
          </DialogTitle>
          <DialogDescription className="sr-only">Detalles de la tarea {task.name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">

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

            {/* Sub-tareas Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <GitBranch size={14} className="text-blue-500" /> Sub-tareas
                </Label>
                <div className="text-[10px] font-bold text-gray-400">
                  {completedSubs}/{totalSubs} completadas
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Nueva sub-tarea..."
                  value={newSubTaskName}
                  onChange={e => setNewSubTaskName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCreateSubTask()}
                  className="h-9 text-sm rounded-xl"
                />
                <Button
                  size="sm"
                  onClick={handleCreateSubTask}
                  disabled={!newSubTaskName.trim() || isPending}
                  className="h-9 px-3 rounded-xl cursor-pointer"
                >
                  <Plus size={16} />
                </Button>
              </div>

              <div className="bg-gray-50 rounded-xl p-2 border border-gray-100 max-h-48 overflow-y-auto space-y-1">
                {task.subTasks.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic text-center py-2">No hay sub-tareas</p>
                ) : (
                  task.subTasks.map(sub => (
                    <div key={sub.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <div className={`w-2 h-2 rounded-full ${sub.status === "HECHO" ? "bg-green-500" : "bg-blue-400"}`} />
                        <span className="text-[11px] font-medium text-gray-700 truncate">{sub.name}</span>
                      </div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">{sub.stage}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Inicio</Label>
                <Input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm h-9 rounded-xl border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Fin</Label>
                <Input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm h-9 rounded-xl border-gray-200" />
              </div>
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

            {/* Tarea Padre / Ensamble */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <Package size={14} className="text-purple-500" /> Tarea Padre / Ensamble
              </Label>
              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1">
                <button
                  onClick={() => setParentId(null)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${parentId === null
                    ? "bg-purple-50 border-purple-300 text-purple-700"
                    : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                    }`}
                >
                  <span>(Sin Tarea Superior)</span>
                  {parentId === null && <CheckCircle2 size={12} />}
                </button>
                {allTasks.filter((t: TaskWithRelations) => t.id !== task.id).map((t: TaskWithRelations) => (
                  <button
                    key={t.id}
                    onClick={() => setParentId(t.id)}
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

            {/* Dependencias */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <GitBranch size={14} className="text-blue-500" /> Dependencias
              </Label>
              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1">
                {allTasks.filter((t: TaskWithRelations) => t.id !== task.id).map((t: TaskWithRelations) => (
                  <button
                    key={t.id}
                    onClick={() => setPredecessorIds(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
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

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isPending} className="rounded-xl cursor-pointer">
            Cerrar sin guardar
          </Button>
          <Button onClick={handleSave} disabled={isPending} className="rounded-xl bg-blue-600 text-white font-bold px-6 shadow-lg shadow-blue-100 cursor-pointer">
            {isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
