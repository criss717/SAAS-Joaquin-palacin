"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createTask, TaskWithRelations } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";
import { Calendar, Clock, Package, Plus, CheckCircle2, PlayCircle, CheckCheck, GitBranch, UserPlus, Check } from "lucide-react";
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
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);
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
        parentId: parentId || undefined,
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
        assignees: users.filter((u: User) => assigneeIds.includes(u.id)).map((u: User) => ({ id: u.id, name: u.name })),
        subTasks: [],
        predecessors: predecessorIds.map((id: string) => ({ predecessor: { id, name: allTasks.find((t: TaskWithRelations) => t.id === id)?.name || "" } })),
        successors: [],
      };

      onTaskCreated(newTask);
      // Reset
      setName(""); setIsAssembly(false); setStartDate(""); setEndDate(""); setAssigneeIds([]);
      setPredecessorIds([]); setParentId(null); setSelectedStatus("EN_PROCESO"); setProgress(0);
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">Nueva Tarea</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          {/* Columna Izquierda: Datos Básicos */}
          <div className="space-y-5">
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border-2 transition-all cursor-pointer ${selectedStage === s.name ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
                  >
                    {s.name}
                  </button>
                ))}
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

            {/* Estado Operativo y Progreso */}
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-gray-700">Estado inicial</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'APROBADO', label: 'Aprobado', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { id: 'EN_PROCESO', label: 'En proceso', icon: PlayCircle, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { id: 'HECHO', label: 'Hecho', icon: CheckCheck, color: 'text-gray-600', bg: 'bg-gray-100' },
                  ].map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusChange(status.id as TaskStatus)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${selectedStatus === status.id
                        ? `${status.bg} ${status.color} border-blue-400`
                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <status.icon size={13} />
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-gray-700">Progreso inicial</Label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={progress}
                      onChange={e => setProgress(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-16 h-8 text-xs font-bold text-center"
                    />
                    <span className="text-xs font-bold text-gray-400">%</span>
                  </div>
                  <div className="flex gap-1">
                    {[0, 50, 100].map(v => (
                      <button
                        key={v}
                        onClick={() => setProgress(v)}
                        className="px-2 py-1 rounded border border-gray-200 text-xs hover:bg-white bg-transparent font-medium cursor-pointer"
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
          </div>

          {/* Columna Derecha: Relaciones */}
          <div className="space-y-5">
            {/* Tarea Padre (Proyecto/Ensamble) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <Package size={14} className="text-purple-500" /> Tarea Padre / Ensamble (opcional)
              </Label>
              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1">
                {allTasks.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic">No hay tareas disponibles</p>
                ) : (
                  <>
                    <button
                      onClick={() => setParentId(null)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${parentId === null
                        ? "bg-purple-100 border-purple-200 text-purple-800"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                    >
                      <span>(Ninguno - Nivel Raíz)</span>
                      {parentId === null && <CheckCircle2 size={12} />}
                    </button>
                    {allTasks.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setParentId(t.id)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${parentId === t.id
                          ? "bg-purple-100 border-purple-200 text-purple-800"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {t.isAssembly && <Package size={12} className="text-purple-400 shrink-0" />}
                          <span className="truncate">{t.name}</span>
                        </div>
                        {parentId === t.id && <CheckCircle2 size={12} className="shrink-0" />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Dependencias (Predecesoras) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <GitBranch size={14} className="text-blue-500" /> Depende de... (opcional)
              </Label>
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100">
                {allTasks.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic">No hay tareas disponibles</p>
                ) : (
                  allTasks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setPredecessorIds(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium border transition-all ${predecessorIds.includes(t.id)
                        ? "bg-blue-100 border-blue-200 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {t.isAssembly && <Package size={12} className="text-purple-400 shrink-0" />}
                        <span className="truncate">{t.name}</span>
                      </div>
                      {predecessorIds.includes(t.id) && <CheckCircle2 size={12} className="shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Asignados */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700">Asignados (opcional)</Label>
              <div className="flex flex-wrap gap-2 items-center">
                
                {/* Botón para añadir */}
                <Popover>
                  <PopoverTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs font-semibold text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer">
                    <UserPlus size={14} /> Añadir Asignado
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0 rounded-xl shadow-lg border-gray-100" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar usuario..." className="text-xs h-9" />
                      <CommandList>
                        <CommandEmpty className="py-2 px-4 text-xs text-gray-500">No hay usuarios.</CommandEmpty>
                        <CommandGroup>
                          {users.map(u => (
                            <CommandItem
                              key={u.id}
                              value={u.name}
                              onSelect={() => toggleAssignee(u.id)}
                              className="cursor-pointer text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${assigneeIds.includes(u.id) ? "bg-blue-500" : "bg-gray-400"}`}>
                                  {u.name.charAt(0)}
                                </div>
                                <span className="font-semibold">{u.name.split(" ")[0]}</span>
                              </div>
                              <Check className={cn("ml-auto h-3 w-3 text-blue-500", assigneeIds.includes(u.id) ? "opacity-100" : "opacity-0")} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Mostrar los seleccionados como badges */}
                {assigneeIds.map(id => {
                  const u = users.find(x => x.id === id);
                  if (!u) return null;
                  return (
                    <div key={u.id} className="flex items-center gap-1 shrink-0 px-2 py-1 bg-blue-50 text-blue-800 rounded-lg border border-blue-200 text-[11px] font-bold">
                      <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[8px] mr-0.5">{u.name.charAt(0)}</div>
                      {u.name.split(" ")[0]}
                      <button onClick={(e) => { e.stopPropagation(); toggleAssignee(u.id); }} className="ml-0.5 text-blue-400 hover:text-blue-600 cursor-pointer">✕</button>
                    </div>
                  );
                })}

              </div>
            </div>
          </div>
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
