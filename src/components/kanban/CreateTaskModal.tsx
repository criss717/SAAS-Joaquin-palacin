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
import { calculateEndDateAction, calculateHoursAction, getNextWorkingDayAction } from "@/lib/actions/time";
import { cn } from "@/lib/utils";
import { Clock, Package, Plus, Layers, CheckCircle2, PlayCircle, CheckCheck, GitBranch, UserPlus, Check, Calculator, Loader2 } from "lucide-react";
import { TaskStatus } from "@prisma/client";
import { useCallback, useRef } from "react";

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
  initialParentId?: string | null
}

function fromDateTimeInput(str: string): Date {
  return new Date(str)
}

function toDateTimeLocalValue(d: Date | string): string {
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } catch {
    return "";
  }
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Returns today's date at 08:00 AM as a datetime-local string (YYYY-MM-DDTHH:MM) */
function getDefaultStartDate(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T08:00`;
}

export function CreateTaskModal({ open, projectId, stages, users, allTasks, initialStage, onClose, onTaskCreated, initialParentId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [isAssembly, setIsAssembly] = useState(false);
  const [selectedStage, setSelectedStage] = useState(initialStage ?? stages[0]?.name ?? "Pendiente");
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>("EN_PROCESO");
  const [progress, setProgress] = useState(0);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [predecessorIds, setPredecessorIds] = useState<string[]>([]);
  const [parentId, setParentId] = useState<string | null>(initialParentId ?? null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");

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

  const [parentSearch, setParentSearch] = useState("");
  const [depSearch, setDepSearch] = useState("");
  const calcHoursTimer = useRef<NodeJS.Timeout | null>(null);
  const calcEndTimer = useRef<NodeJS.Timeout | null>(null);

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
      setError("");
    } catch {
      // Silencioso
    } finally {
      setIsCalculating(false);
    }
  }, []);

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
    if (calcEndTimer.current) clearTimeout(calcEndTimer.current);
    calcEndTimer.current = setTimeout(() => handleCalculateEndDate(startDate, val), 500);
  };

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
        estimatedHours,
        assigneeIds,
        predecessorIds,
        parentId: parentId || undefined,
        quantity: quantity,
        unitEstimatedHours: estimatedHours / (quantity || 1)
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
        orderIndex: task.orderIndex,
        assignees: users.filter((u: User) => assigneeIds.includes(u.id)).map((u: User) => ({ id: u.id, name: u.name })),
        subTasks: [],
        predecessors: predecessorIds.map((id: string) => ({ predecessor: { id, name: allTasks.find((t: TaskWithRelations) => t.id === id)?.name || "" } })),
        successors: [],
        quantity: task.quantity,
        unitEstimatedHours: task.unitEstimatedHours,
      };

      onTaskCreated(newTask);
      // Reset
      setName(""); setIsAssembly(false); setStartDate(getDefaultStartDate()); setEndDate(""); setEstimatedHours(8); setAssigneeIds([]);
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

            {/* Estimación, Cantidad y Fecha */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 mx-1">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  Cantidad
                </Label>
                <Input type="number" min="1" value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))} className="text-sm h-9 rounded-xl border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                  Horas Totales
                  <button type="button" onClick={() => handleCalculateHours(startDate, endDate)} disabled={isCalculating} className="text-blue-500 hover:text-blue-700 disabled:opacity-50 cursor-pointer" title="Calcular horas según fechas">
                    {isCalculating ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                  </button>
                </Label>
                <Input type="number" step="0.5" min="0" value={estimatedHours || ""} onChange={e => onHoursChange(Number(e.target.value))} className="text-sm h-9 rounded-xl border-gray-200" />
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
            {/* Pertenece a: */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Layers size={12} className="text-purple-500" /> Pertenece a:
              </Label>

              <div className="flex gap-2">
                <Input
                  placeholder="Buscar padre..."
                  value={parentSearch}
                  onChange={e => setParentSearch(e.target.value)}
                  className="h-8 text-[11px] rounded-lg border-gray-100 flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[10px]"
                  onClick={() => setParentId(null)}
                >
                  Limpiar
                </Button>
              </div>

              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded-xl border border-gray-100 space-y-1">
                {parentId === null && (
                  <div className="text-[10px] text-gray-400 italic text-center py-1">Sin padre asignado</div>
                )}
                {allTasks
                  .filter(t => normalize(t.name).includes(normalize(parentSearch)))
                  .sort((a, b) => (a.id === parentId ? -1 : b.id === parentId ? 1 : 0))
                  .slice(0, 10)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
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
              <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <GitBranch size={12} className="text-blue-500" /> Depende de:
              </Label>
              <Input
                placeholder="Buscar dependencia..."
                value={depSearch}
                onChange={e => setDepSearch(e.target.value)}
                className="h-8 text-[11px] rounded-lg border-gray-100 mb-1"
              />
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded-2xl border border-gray-100">
                {allTasks.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic p-2">No hay tareas disponibles</p>
                ) : (
                  allTasks
                    .filter(t => normalize(t.name).includes(normalize(depSearch)))
                    .sort((a, b) => {
                      const aSel = predecessorIds.includes(a.id);
                      const bSel = predecessorIds.includes(b.id);
                      if (aSel && !bSel) return -1;
                      if (!aSel && bSel) return 1;
                      return a.name.localeCompare(b.name);
                    })
                    .map(t => (
                      <button
                        key={t.id}
                        onClick={() => handlePredecessorChange(predecessorIds.includes(t.id) ? predecessorIds.filter(x => x !== t.id) : [...predecessorIds, t.id])}
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
          <Button onClick={handleCreate} disabled={isPending || !name.trim()} className="rounded-xl bg-blue-100 text-blue-600 font-black px-8 hover:bg-blue-200 transition-all cursor-pointer">
            {isPending ? "Creando…" : <><Plus size={16} className="mr-2" strokeWidth={3} /> Crear Tarea</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
