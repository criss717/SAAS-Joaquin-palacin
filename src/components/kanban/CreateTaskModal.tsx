"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createTask, TaskWithRelations } from "@/lib/actions/tasks";
import { Calendar, Clock, Package, Plus, CheckCircle2, PlayCircle, CheckCheck, GitBranch } from "lucide-react";
import { TaskStatus } from "@prisma/client";

type Stage = { id: string; name: string; color: string }
type User = { id: string; name: string; email: string; role: string }

type Props = {
  open: boolean
  projectId: string
  stages: Stage[]
  users: User[]
  allTasks: TaskWithRelations[]
  initialStage?: string
  onClose: () => void
  onTaskCreated: (task: TaskWithRelations) => void
}

function fromDateInput(str: string): Date {
  return new Date(`${str}T12:00:00.000Z`)
}

export function CreateTaskModal({ open, projectId, stages, users, allTasks, initialStage, onClose, onTaskCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [isAssembly, setIsAssembly] = useState(false);
  const [selectedStage, setSelectedStage] = useState(initialStage ?? stages[0]?.name ?? "Pendiente");
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>("EN_PROCESO");
  const [progress, setProgress] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [predecessorIds, setPredecessorIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const toggleAssignee = (id: string) => {
    setAssigneeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleStatusChange = (status: TaskStatus) => {
    setSelectedStatus(status);
    if (status === "HECHO") setProgress(100);
    else if (status === "EN_PROCESO") setProgress(40);
    else if (status === "APROBADO") setProgress(10);
  };

  const handleCreate = () => {
    if (!name.trim()) { setError("El nombre es obligatorio"); return; }
    if (!startDate || !endDate) { setError("Las fechas son obligatorias"); return; }
    if (new Date(endDate) < new Date(startDate)) { setError("La fecha de fin debe ser posterior al inicio"); return; }
    setError("");

    startTransition(async () => {
      const task = await createTask({
        name: name.trim(),
        projectId,
        isAssembly,
        stage: selectedStage,
        status: selectedStatus,
        progress,
        startDate: fromDateInput(startDate),
        endDate: fromDateInput(endDate),
        assigneeIds,
        predecessorIds,
      });

      // Construir el objeto completo para el estado local
      const newTask: TaskWithRelations = {
        id: task.id,
        name: task.name,
        stage: task.stage,
        status: task.status as TaskStatus,
        progress: task.progress,
        isAssembly: task.isAssembly,
        startDate: task.startDate,
        endDate: task.endDate,
        projectId: task.projectId,
        parentId: task.parentId,
        assignees: users.filter(u => assigneeIds.includes(u.id)).map(u => ({ id: u.id, name: u.name })),
        subTasks: [],
        predecessors: predecessorIds.map(id => ({ predecessor: { id, name: allTasks.find(t => t.id === id)?.name || "" } })),
        successors: [],
      };

      onTaskCreated(newTask);
      // Reset
      setName(""); setIsAssembly(false); setStartDate(""); setEndDate(""); setAssigneeIds([]);
      setPredecessorIds([]); setSelectedStatus("EN_PROCESO"); setProgress(0);
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">Nueva Tarea</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">Nombre *</Label>
            <Input
              placeholder="Ej: Mecanizado de tambor…"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>

          {/* Tipo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAssembly(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${!isAssembly ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}
            >
              Pieza / Operación
            </button>
            <button
              onClick={() => setIsAssembly(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all flex items-center justify-center gap-1.5 ${isAssembly ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500"}`}
            >
              <Package size={13} /> Ensamble
            </button>
          </div>

          {/* Etapa */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">Etapa inicial</Label>
            <div className="flex flex-wrap gap-1.5">
              {stages.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStage(s.name)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border-2 transition-all ${selectedStage === s.name ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Estado Operativo y Progreso */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700">Estado inicial</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { id: 'APROBADO', label: 'Aprobado', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { id: 'EN_PROCESO', label: 'En proceso', icon: PlayCircle, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { id: 'HECHO', label: 'Hecho', icon: CheckCheck, color: 'text-gray-600', bg: 'bg-gray-100' },
                ].map((status) => (
                  <button
                    key={status.id}
                    onClick={() => handleStatusChange(status.id as TaskStatus)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${selectedStatus === status.id
                      ? `${status.bg} ${status.color} border-blue-400`
                      : 'bg-white text-gray-400 border-gray-200'
                      }`}
                  >
                    <status.icon size={11} />
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700">Progreso inicial</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={e => setProgress(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="h-9 text-xs font-bold"
                />
                <span className="text-xs font-bold text-gray-400">%</span>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {[0, 50, 100].map(v => (
                  <button
                    key={v}
                    onClick={() => setProgress(v)}
                    className="py-1 rounded border border-gray-200 text-[9px] hover:bg-gray-50 bg-white"
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Calendar size={12} /> Inicio *</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Clock size={12} /> Fin *</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm" />
            </div>
          </div>

          {/* Dependencias (Predecesoras) */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <GitBranch size={12} className="text-blue-500" /> Depende de... (opcional)
            </Label>
            <div className="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100">
              {allTasks.filter(t => !t.isAssembly).length === 0 ? (
                <p className="text-[10px] text-gray-400 italic">No hay otras tareas disponibles</p>
              ) : (
                allTasks.filter(t => !t.isAssembly).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setPredecessorIds(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium border transition-all ${
                      predecessorIds.includes(t.id) 
                        ? "bg-blue-100 border-blue-200 text-blue-700" 
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <span>{t.name}</span>
                    {predecessorIds.includes(t.id) && <CheckCircle2 size={12} />}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Asignados */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">Asignados (opcional)</Label>
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => toggleAssignee(u.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left ${assigneeIds.includes(u.id)
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${assigneeIds.includes(u.id) ? "bg-blue-500" : "bg-gray-400"}`}>
                    {u.name.charAt(0)}
                  </div>
                  <span className="truncate">{u.name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <Separator />

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
            {isPending ? "Creando…" : <><Plus size={14} className="mr-1" /> Crear Tarea</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
