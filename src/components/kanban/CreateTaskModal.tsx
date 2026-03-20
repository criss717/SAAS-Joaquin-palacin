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
import { Clock, Package, Plus, CheckCircle2, PlayCircle, CheckCheck, GitBranch, UserPlus, Check } from "lucide-react";
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

function fromDateTimeInput(str: string): Date {
  // datetime-local retorna YYYY-MM-DDTHH:mm, lo manejamos como local
  return new Date(str)
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
        startDate: fromDateTimeInput(startDate),
        endDate: fromDateTimeInput(endDate),
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
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900 px-1">Nueva Tarea</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          {/* Columna Izquierda: Datos Básicos */}
          <div className="space-y-5">
            {/* Nombre */}
            <div className="space-y-1.5 px-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nombre *</Label>
              <Input
                placeholder="Ej: Mecanizado de tambor…"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                autoFocus
                className="rounded-xl border-gray-200 h-11"
              />
            </div>

            {/* Tipo */}
            <div className="flex items-center gap-3 px-1">
              <button
                onClick={() => setIsAssembly(false)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase transition-all border-2 cursor-pointer ${!isAssembly ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200"}`}
              >
                Pieza / Operación
              </button>
              <button
                onClick={() => setIsAssembly(true)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 border-2 cursor-pointer ${isAssembly ? "border-purple-500 bg-purple-50 text-purple-700 shadow-sm" : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200"}`}
              >
                <Package size={14} /> Ensamble
              </button>
            </div>

            {/* Etapa */}
            <div className="space-y-1.5 px-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Etapa inicial</Label>
              <div className="flex flex-wrap gap-1.5">
                {stages.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStage(s.name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-2 cursor-pointer ${selectedStage === s.name ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-100 bg-white text-gray-400 hover:border-gray-200"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3 px-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Inicio *</Label>
                <Input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm h-11 rounded-xl border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Clock size={12} className="text-blue-500" /> Fin *</Label>
                <Input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm h-11 rounded-xl border-gray-200" />
              </div>
            </div>

            {/* Estado Operativo y Progreso */}
            <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100 space-y-5 mx-1">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Estado inicial</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'APROBADO', label: 'Aprobado', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { id: 'EN_PROCESO', label: 'En proceso', icon: PlayCircle, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { id: 'HECHO', label: 'Hecho', icon: CheckCheck, color: 'text-gray-600', bg: 'bg-gray-100' },
                  ].map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusChange(status.id as TaskStatus)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border-2 cursor-pointer ${selectedStatus === status.id
                        ? `${status.bg} ${status.color} border-blue-400 shadow-sm`
                        : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'
                        }`}
                    >
                      <status.icon size={14} />
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Progreso inicial</Label>
                  <span className="text-xs font-bold text-blue-600">{progress}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 50, 100].map(v => (
                      <button
                        key={v}
                        onClick={() => setProgress(v)}
                        className="px-2.5 py-1 rounded-lg border border-gray-200 text-[10px] font-bold hover:bg-white bg-transparent text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all cursor-pointer"
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-red-500 font-bold px-1">{error}</p>}
          </div>

          {/* Columna Derecha: Relaciones */}
          <div className="space-y-5">
            {/* Tarea Padre (Proyecto/Ensamble) */}
            <div className="space-y-1.5 px-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Package size={14} className="text-purple-500" /> Tarea Padre / Ensamble (opcional)
              </Label>
              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-2xl border border-gray-100 space-y-1">
                {allTasks.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic p-2">No hay tareas disponibles</p>
                ) : (
                  <>
                    <button
                      onClick={() => setParentId(null)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${parentId === null
                        ? "bg-purple-50 border-purple-300 text-purple-700 shadow-sm"
                        : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                        }`}
                    >
                      <span>(Ninguno - Nivel Raíz)</span>
                      {parentId === null && <CheckCircle2 size={12} />}
                    </button>
                    {allTasks.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setParentId(t.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${parentId === t.id
                          ? "bg-purple-50 border-purple-300 text-purple-700 shadow-sm"
                          : "bg-white border-gray-100 text-gray-500 hover:border-purple-200"
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
            <div className="space-y-1.5 px-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <GitBranch size={14} className="text-blue-500" /> Depende de... (opcional)
              </Label>
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded-2xl border border-gray-100">
                {allTasks.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic p-2">No hay tareas disponibles</p>
                ) : (
                  allTasks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setPredecessorIds(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${predecessorIds.includes(t.id)
                        ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm"
                        : "bg-white border-gray-100 text-gray-500 hover:border-blue-200"
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
            <div className="space-y-1.5 px-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Asignados (opcional)</Label>
              <div className="flex flex-wrap gap-2 items-center p-2 bg-gray-50 rounded-2xl border border-gray-100 min-h-[50px]">
                
                {/* Botón para añadir */}
                <Popover>
                  <PopoverTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-white transition-all cursor-pointer">
                    <UserPlus size={14} /> Añadir
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0 rounded-2xl shadow-xl border-gray-100" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar usuario..." className="text-xs h-10" />
                      <CommandList>
                        <CommandEmpty className="py-2 px-4 text-xs text-gray-500">No hay usuarios.</CommandEmpty>
                        <CommandGroup>
                          {users.map(u => (
                            <CommandItem
                              key={u.id}
                              value={u.name}
                              onSelect={() => toggleAssignee(u.id)}
                              className="cursor-pointer text-xs p-2"
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${assigneeIds.includes(u.id) ? "bg-blue-500" : "bg-gray-400"}`}>
                                  {u.name.charAt(0)}
                                </div>
                                <span className="font-bold">{u.name.split(" ")[0]}</span>
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
                    <div key={u.id} className="flex items-center gap-2 shrink-0 px-2.5 py-1.5 bg-white text-gray-700 rounded-xl border border-gray-200 text-xs font-bold shadow-sm">
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-black">{u.name.charAt(0)}</div>
                      {u.name.split(" ")[0]}
                      <button onClick={(e) => { e.stopPropagation(); toggleAssignee(u.id); }} className="ml-1 text-gray-300 hover:text-red-500 transition-colors cursor-pointer text-sm">✕</button>
                    </div>
                  );
                })}

              </div>
            </div>
          </div>
        </div>

        <Separator className="my-2 bg-gray-100" />

        <div className="flex gap-3 justify-end px-1 pb-1">
          <Button variant="outline" onClick={onClose} disabled={isPending} className="rounded-xl border-gray-200 font-bold px-6 cursor-pointer">
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isPending || !name.trim()} className="rounded-xl bg-blue-600 text-white font-black px-8 shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all cursor-pointer">
            {isPending ? "Creando…" : <><Plus size={16} className="mr-2" strokeWidth={3} /> Crear Tarea</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
