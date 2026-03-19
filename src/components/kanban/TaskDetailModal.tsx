"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TaskWithRelations, TaskAssignee, updateTaskStage, updateTaskDates, updateTaskAssignees, updateTaskStatus, updateTaskProgress, createTask } from "@/lib/actions/tasks";
import { Calendar, Package, GitBranch, Clock, Plus, X, CheckCircle2, PlayCircle, AlertCircle, CheckCheck, XCircle, Percent } from "lucide-react";
import { TaskStatus } from "@prisma/client";

type Stage = { id: string; name: string; color: string }
type User = { id: string; name: string; email: string; role: string }

type Props = {
  task: TaskWithRelations | null
  stages: Stage[]
  users: User[]
  onClose: () => void
  onTaskUpdated: (updated: TaskWithRelations) => void
}

/** Convierte un Date o string ISO a input[type=date] value (YYYY-MM-DD, UTC) */
function toDateInputValue(d: Date | string): string {
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return ""
    // Usamos ISO para mantener UTC y evitar desfase de zona horaria
    return date.toISOString().split("T")[0]
  } catch {
    return ""
  }
}

/** Construye un Date a mediodía UTC para evitar desfases de timezone */
function fromDateInput(str: string): Date {
  return new Date(`${str}T12:00:00.000Z`)
}

export function TaskDetailModal({ task, stages, users, onClose, onTaskUpdated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedStage, setSelectedStage] = useState(task?.stage ?? "");
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(task?.status ?? "EN_PROCESO");
  const [localProgress, setLocalProgress] = useState(task?.progress ?? 0);
  const [startDate, setStartDate] = useState(() => toDateInputValue(task?.startDate ?? ""));
  const [endDate, setEndDate] = useState(() => toDateInputValue(task?.endDate ?? ""));
  const [selectedAssignees, setSelectedAssignees] = useState<TaskAssignee[]>(task?.assignees ?? []);
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
        const origStart = toDateInputValue(task.startDate);
        const origEnd = toDateInputValue(task.endDate);
        if (startDate !== origStart || endDate !== origEnd) {
          updates.push(updateTaskDates(task.id, fromDateInput(startDate), fromDateInput(endDate)));
        }
      }

      const origIds = task.assignees.map(a => a.id).sort().join(",");
      const newIds = selectedAssignees.map(a => a.id).sort().join(",");
      if (origIds !== newIds) {
        updates.push(updateTaskAssignees(task.id, selectedAssignees.map(a => a.id)));
      }

      await Promise.all(updates);

      onTaskUpdated({
        ...task,
        stage: selectedStage,
        status: selectedStatus,
        progress: localProgress,
        startDate: startDate ? fromDateInput(startDate) : task.startDate,
        endDate: endDate ? fromDateInput(endDate) : task.endDate,
        assignees: selectedAssignees,
      });
      onClose();
    });
  };

  const completedSubs = task.subTasks.filter(s => s.status === "HECHO").length;
  const totalSubs = task.subTasks.length;

  const availableUsers = users.filter(u => !selectedAssignees.some(a => a.id === u.id));

  return (
    <Dialog open={!!task} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1 flex-wrap text-left">
            {task.isAssembly && (
              <span className="flex items-center gap-1 text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                <Package size={10} /> Ensamble
              </span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${selectedStatus === 'HECHO' ? 'bg-green-100 text-green-700' : selectedStatus === 'CANCELADO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {selectedStatus.replace('_', ' ')}
            </span>
          </div>
          <DialogTitle className="text-xl font-black text-gray-900 leading-tight">
            {task.name}
          </DialogTitle>
          <DialogDescription className="sr-only">Detalles de la tarea {task.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Sub-tareas Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <GitBranch size={16} className="text-blue-500" />
                Sub-piezas / Tareas internas
              </Label>
              <Badge variant="secondary" className="bg-gray-100 text-gray-600 font-bold">
                {completedSubs}/{totalSubs}
              </Badge>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Nueva sub-pieza..."
                value={newSubTaskName}
                onChange={e => setNewSubTaskName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateSubTask()}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                onClick={handleCreateSubTask}
                disabled={!newSubTaskName.trim() || isPending}
                className="h-9 px-3"
              >
                <Plus size={16} />
              </Button>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              {task.subTasks.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-2">No hay sub-tareas definidas</p>
              ) : (
                <ul className="space-y-2">
                  {task.subTasks.map(sub => (
                    <li key={sub.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${sub.status === "HECHO" ? "bg-green-500" : "bg-blue-400"}`} />
                        <span className="text-xs font-medium text-gray-700">{sub.name}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] py-0 h-4 border-gray-200 text-gray-400">
                        {sub.stage}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <Separator className="bg-gray-100" />
        </div>

        {/* Progreso */}
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <Percent size={14} /> Progreso Manual
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={100}
                value={localProgress}
                onChange={e => setLocalProgress(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-16 h-8 text-right text-xs font-bold"
              />
              <span className="text-xs font-bold text-gray-400">%</span>
            </div>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${selectedStatus === 'HECHO' ? 'bg-green-500' : selectedStatus === 'CANCELADO' ? 'bg-gray-400' : 'bg-blue-600'}`}
              style={{ width: `${localProgress}%` }}
            />
          </div>

          <div className="flex justify-between gap-1 overflow-x-auto pb-1">
            {[0, 25, 50, 75, 100].map(val => (
              <button
                key={val}
                onClick={() => setLocalProgress(val)}
                className={`flex-1 py-1 rounded border text-[10px] font-medium transition-all ${localProgress === val ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              >
                {val}%
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Estado Operativo Manual */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-700">Estado Operativo</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'APROBADO', label: 'Aprobado', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
              { id: 'EN_PROCESO', label: 'En proceso', icon: PlayCircle, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
              { id: 'CAMBIOS_SOLICITADOS', label: 'Cambios', icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
              { id: 'HECHO', label: 'Hecho', icon: CheckCheck, color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-300' },
              { id: 'CANCELADO', label: 'Cancelado', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
            ].map((status) => (
              <button
                key={status.id}
                onClick={() => handleStatusChange(status.id as TaskStatus)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${selectedStatus === status.id
                  ? `${status.bg} ${status.color} ${status.border} ring-2 ring-offset-1 ring-blue-400 shadow-sm`
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
              >
                <status.icon size={14} className={selectedStatus === status.id ? status.color : 'text-gray-400'} />
                {status.label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Etapa */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-700">Etapa (Columna Kanban)</Label>
          <div className="flex flex-wrap gap-2">
            {stages.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStage(s.name)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${selectedStage === s.name ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                style={selectedStage === s.name ? { borderColor: s.color, backgroundColor: `${s.color}18`, color: s.color } : {}}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Fechas */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Calendar size={13} /> Inicio</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Clock size={13} /> Fin</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm" />
          </div>
        </div>

        {/* Asignados */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-700">Asignados</Label>
          <div className="flex flex-wrap gap-2 items-center">
            {selectedAssignees.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-[9px]">
                  {a.name.charAt(0)}
                </div>
                <span className="text-xs font-medium text-blue-800">{a.name.split(" ")[0]}</span>
                <button onClick={() => setSelectedAssignees(prev => prev.filter(p => p.id !== a.id))} className="text-blue-400 hover:text-red-500 ml-0.5">
                  <X size={11} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setShowUserPicker(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 rounded-full px-2.5 py-1 hover:border-blue-400 transition-colors"
            >
              <Plus size={11} /> Añadir
            </button>
          </div>

          {showUserPicker && availableUsers.length > 0 && (
            <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
              {availableUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => { toggleAssignee(u); setShowUserPicker(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-bold">
                    {u.name.charAt(0)}
                  </div>
                  <span>{u.name}</span>
                  <span className="ml-auto text-xs text-gray-400">{u.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>


        {/* Dependencias */}
        {task.predecessors.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1"><GitBranch size={13} /> Depende de</Label>
            <div className="flex flex-wrap gap-1.5">
              {task.predecessors.map(p => (
                <Badge key={p.predecessor.id} variant="secondary" className="text-xs">{p.predecessor.name}</Badge>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
