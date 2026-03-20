"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkSchedule, Holiday } from "@prisma/client";
import { upsertWorkSchedule, deleteWorkSchedule, createHoliday, deleteHoliday } from "@/lib/actions/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Calendar, Clock, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Swal from "sweetalert2";

type Props = {
  initialSchedules: WorkSchedule[];
  initialHolidays: Holiday[];
};

export function ScheduleClient({ initialSchedules, initialHolidays }: Props) {
  const router = useRouter();

  // States for Schedule Form
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [shifts, setShifts] = useState<{ start: string; end: string }[]>([{ start: "08:00", end: "14:00" }, { start: "16:00", end: "18:00" }]);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // States for Holiday Form
  const [hName, setHName] = useState("");
  const [hDate, setHDate] = useState("");
  const [hEndDate, setHEndDate] = useState("");

  const handleSaveSchedule = async () => {
    if (!name || !from || !until) return toast.error("Completa los campos básicos.");

    const res = await upsertWorkSchedule({
      id: (isEditing && isEditing !== "new") ? isEditing : undefined,
      name,
      validFrom: new Date(from),
      validUntil: new Date(until),
      workingDays,
      shifts
    });

    if (res.success) {
      toast.success("Horario guardado correctamente.");
      setIsEditing(null);
      router.refresh();
    } else {
      toast.error(res.error || "Error al guardar el horario.");
    }
  };

  const handleAddHoliday = async () => {
    if (!hName || !hDate) return toast.error("Faltan datos del festivo.");
    const res = await createHoliday(hName, new Date(hDate), hEndDate ? new Date(hEndDate) : undefined);
    if (res.success) {
      toast.success("Festivo añadido.");
      setHName("");
      setHDate("");
      setHEndDate("");
      router.refresh();
    } else {
      toast.error(res.error || "Error al añadir festivo.");
    }
  };

  return (
    <div className="space-y-12">
      {/* SECCIÓN TEMPORADAS */}
      <section className="space-y-6">
        <header className="flex items-center justify-between border-b pb-4 border-gray-100">
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <Clock className="text-blue-500" /> Temporadas y Turnos
          </h2>
          {!isEditing && (
            <Button onClick={() => setIsEditing("new")} size="sm" className="rounded-xl bg-blue-600">
              <Plus size={16} className="mr-2" /> Nueva Temporada
            </Button>
          )}
        </header>

        {isEditing && (
          <Card className="border-2 border-blue-200 shadow-xl bg-blue-50/30 rounded-2xl overflow-hidden">
            <CardHeader className="bg-white/50 border-b border-blue-100">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-blue-900">
                {isEditing === "new" ? "Configurar Nueva Temporada" : "Editar Temporada"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Nombre de la Temporada</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Verano 2026" className="rounded-xl border-gray-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Desde</Label>
                  <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded-xl border-gray-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500">Hasta</Label>
                  <Input type="date" value={until} onChange={e => setUntil(e.target.value)} className="rounded-xl border-gray-200" />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-xs font-bold text-gray-500 uppercase">Días Laborables</Label>
                <div className="flex flex-wrap gap-2">
                  {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day, idx) => (
                    <button
                      key={idx}
                      onClick={() => setWorkingDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx])}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${workingDays.includes(idx) ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-xs font-bold text-gray-500 uppercase">Tramos de Jornada (Shifts)</Label>
                <div className="space-y-3">
                  {shifts.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-blue-100 shadow-sm">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-[10px] font-bold text-gray-400">INICIO</span>
                        <Input type="time" value={s.start} onChange={e => {
                          const newShifts = [...shifts];
                          newShifts[idx].start = e.target.value;
                          setShifts(newShifts);
                        }} className="border-none bg-gray-50 rounded-lg h-8" />
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-[10px] font-bold text-gray-400">FIN</span>
                        <Input type="time" value={s.end} onChange={e => {
                          const newShifts = [...shifts];
                          newShifts[idx].end = e.target.value;
                          setShifts(newShifts);
                        }} className="border-none bg-gray-50 rounded-lg h-8" />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setShifts(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 h-8 w-8 p-0">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setShifts([...shifts, { start: "08:00", end: "14:00" }])} className="w-full border-dashed border-2 border-blue-200 text-blue-600 font-bold py-4 rounded-2xl hover:bg-blue-50 transition-all">
                    <Plus size={16} className="mr-2" /> Añadir Tramo (ej. turno tarde)
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-blue-100 mt-4">
                <Button variant="ghost" onClick={() => setIsEditing(null)} className="rounded-xl font-bold text-gray-500">Cancelar</Button>
                <Button onClick={handleSaveSchedule} className="rounded-xl bg-blue-600 px-8 font-black shadow-lg shadow-blue-200">
                  <Check size={18} className="mr-2" /> Guardar Temporada
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initialSchedules.map(s => (
            <Card key={s.id} className="group hover:border-blue-400 transition-all border-gray-100 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-4 bg-gray-50/50 flex items-center justify-between border-b border-gray-100">
                <div className="font-black text-gray-900">{s.name}</div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => {
                    setIsEditing(s.id);
                    setName(s.name);
                    setFrom(format(new Date(s.validFrom), "yyyy-MM-dd"));
                    setUntil(format(new Date(s.validUntil), "yyyy-MM-dd"));
                    setWorkingDays(JSON.parse(s.workingDays));
                    setShifts(JSON.parse(s.shifts));
                  }} className="text-gray-400 hover:text-blue-600 p-0.5 h-8 w-8"><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    const result = await Swal.fire({
                      title: "¿Eliminar temporada?",
                      text: `Se borrará "${s.name}" y no se podrá recuperar.`,
                      icon: "warning",
                      showCancelButton: true,
                      confirmButtonColor: "#ef4444",
                      cancelButtonColor: "#94a3b8",
                      confirmButtonText: "Sí, eliminar",
                      cancelButtonText: "Cancelar"
                    });

                    if (result.isConfirmed) {
                      const res = await deleteWorkSchedule(s.id);
                      if (res.success) {
                        toast.success("Temporada eliminada");
                        router.refresh();
                      } else {
                        toast.error(res.error || "Error al eliminar");
                      }
                    }
                  }} className="text-gray-400 hover:text-red-500 p-0.5 h-8 w-8"><Trash2 size={14} /></Button>
                </div>
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-500 bg-white border border-gray-100 rounded-lg p-2">
                  <Calendar size={12} className="text-blue-500" />
                  {format(new Date(s.validFrom), "dd MMM yyyy", { locale: es })} - {format(new Date(s.validUntil), "dd MMM yyyy", { locale: es })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {JSON.parse(s.shifts).map((sh: { start: string; end: string }, i: number) => (
                    <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-black border border-blue-100">
                      {sh.start} - {sh.end}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* SECCIÓN FESTIVOS */}
      <section className="space-y-6 pt-12 border-t border-gray-100">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <Calendar className="text-purple-500" /> Festivos y No Laborables
        </h2>

        <Card className="rounded-2xl border-gray-200 shadow-sm overflow-hidden bg-gray-50/20">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-8 gap-4 items-end">
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs font-bold text-gray-500 uppercase">Nombre del Festivo</Label>
                <Input value={hName} onChange={e => setHName(e.target.value)} placeholder="Ej: Feria de Abril" className="h-11 rounded-xl bg-white" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-bold text-gray-500 uppercase">Inicio</Label>
                <Input type="date" value={hDate} onChange={e => setHDate(e.target.value)} className="h-11 rounded-xl bg-white" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-bold text-gray-500 uppercase">Fin (Opcional)</Label>
                <Input type="date" value={hEndDate} onChange={e => setHEndDate(e.target.value)} className="h-11 rounded-xl bg-white" />
              </div>
              <Button onClick={handleAddHoliday} className="h-11 sm:col-span-1 rounded-xl bg-blue-600 hover:bg-blue-700 font-black">
                Añadir
              </Button>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {initialHolidays.map(h => (
                <div key={h.id} className="flex items-center justify-between bg-white border border-gray-100 p-3 rounded-2xl shadow-sm group">
                  <div>
                    <div className="text-xs font-black text-gray-800 uppercase">{h.name}</div>
                    <div className="text-[10px] text-gray-400 font-bold">
                      {format(new Date(h.startDate), "dd MMM", { locale: es })}
                      {h.endDate && format(new Date(h.startDate), "yyyy-MM-dd") !== format(new Date(h.endDate), "yyyy-MM-dd") && (
                        <> - {format(new Date(h.endDate), "dd MMM", { locale: es })}</>
                      )}
                      {", " + format(new Date(h.startDate), "yyyy")}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    const result = await Swal.fire({
                      title: "¿Eliminar festivo?",
                      text: `Se borrará "${h.name}"`,
                      icon: "question",
                      showCancelButton: true,
                      confirmButtonColor: "#ef4444",
                      confirmButtonText: "Eliminar",
                      cancelButtonText: "Volver"
                    });

                    if (result.isConfirmed) {
                      const res = await deleteHoliday(h.id);
                      if (res.success) {
                        toast.success("Festivo eliminado");
                        router.refresh();
                      } else {
                        toast.error(res.error || "Error al eliminar");
                      }
                    }
                  }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 h-8 w-8 p-0">
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
