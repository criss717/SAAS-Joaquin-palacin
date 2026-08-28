"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkSchedule, Holiday } from "@prisma/client";
import { upsertWorkSchedule, deleteWorkSchedule, createHoliday, createHolidayBatch, deleteHoliday } from "@/lib/actions/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Calendar, Clock, Check, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Swal from "sweetalert2";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  initialSchedules: WorkSchedule[];
  initialHolidays: Holiday[];
};

function toCalendarInput(d: Date | string): string {
  if (!d) return "";
  if (typeof d === "string") {
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
}

function formatCalendarDisplay(d: Date | string, fmt: string = "dd MMM yyyy"): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return format(date, fmt, { locale: es });
}

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
  const [holidayMode, setHolidayMode] = useState<"single" | "range" | "months" | "multi">("single");
  const [hMonths, setHMonths] = useState<string[]>([]);
  const [hMultiDates, setHMultiDates] = useState<string[]>([]);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const [schedPage, setSchedPage] = useState(1);
  const [holiPage, setHoliPage] = useState(1);
  const SCHED_PER_PAGE = 6;
  const HOLI_PER_PAGE = 12;

  const handleOpenNew = () => {
    setName("");
    setFrom("");
    setUntil("");
    setWorkingDays([1, 2, 3, 4, 5]);
    setShifts([{ start: "08:00", end: "14:00" }, { start: "16:00", end: "18:00" }]);
    setIsEditing("new");
  };

  const handleSaveSchedule = async () => {
    if (!name || !from || !until) return toast.error("Completa los campos básicos.");

    const res = await upsertWorkSchedule({
      id: (isEditing && isEditing !== "new") ? isEditing : undefined,
      name,
      validFrom: from,
      validUntil: until,
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
    if (!hName) return toast.error("Falta el nombre del festivo.");

    if (holidayMode === "multi" && hMultiDates.length > 0) {
      const dates = hMultiDates.map(d => ({ start: d }));
      const res = await createHolidayBatch(hName, dates);
      if (res.success) {
        toast.success(`${hMultiDates.length} festivos añadidos.`);
        setHName(""); setHMultiDates([]);
        router.refresh();
      } else {
        toast.error(res.error || "Error al añadir festivos.");
      }
      return;
    }

    if (holidayMode === "months" && hMonths.length > 0) {
      const dates = hMonths.map(m => {
        const [year, month] = m.split("-").map(Number);
        const lastDay = new Date(year, month + 1, 0).getDate();
        const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        return { start, end };
      });
      const res = await createHolidayBatch(hName, dates);
      if (res.success) {
        toast.success(`${hMonths.length} festivos añadidos.`);
        setHName(""); setHMonths([]);
        router.refresh();
      } else {
        toast.error(res.error || "Error al añadir festivos.");
      }
      return;
    }

    if (holidayMode === "range" && hDate && hEndDate) {
      const res = await createHoliday(hName, hDate, hEndDate);
      if (res.success) {
        toast.success("Festivo (rango) añadido.");
        setHName(""); setHDate(""); setHEndDate("");
        router.refresh();
      } else {
        toast.error(res.error || "Error al añadir festivo.");
      }
      return;
    }

    if (!hDate) return toast.error("Falta la fecha del festivo.");
    const res = await createHoliday(hName, hDate);
    if (res.success) {
      toast.success("Festivo añadido.");
      setHName(""); setHDate(""); setHEndDate("");
      router.refresh();
    } else {
      toast.error(res.error || "Error al añadir festivo.");
    }
  };

  return (
    <div className="space-y-12">
      {/* MODAL DIALOG PARA EDITAR / CREAR TEMPORADA */}
      <Dialog open={Boolean(isEditing)} onOpenChange={(open) => !open && setIsEditing(null)}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader className="border-b border-gray-100 pb-3">
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
              <Clock className="text-blue-500" size={16} />
              {isEditing === "new" ? "Configurar Nueva Temporada" : "Editar Temporada"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-500">Nombre de la Temporada</Label>
                <Input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: Verano 2026"
                  className="rounded-xl border-gray-200"
                />
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

            <div className="space-y-3">
              <Label className="text-xs font-bold text-gray-500 uppercase">Días Laborables</Label>
              <div className="flex flex-wrap gap-2">
                {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setWorkingDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx])}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all cursor-pointer ${workingDays.includes(idx) ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100" : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"}`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-gray-500 uppercase">Tramos de Jornada (Shifts)</Label>
              <div className="space-y-3">
                {shifts.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-[10px] font-bold text-gray-400">INICIO</span>
                      <Input
                        type="time"
                        value={s.start}
                        onChange={e => {
                          const newShifts = [...shifts];
                          newShifts[idx].start = e.target.value;
                          setShifts(newShifts);
                        }}
                        className="bg-white rounded-lg h-8 border-gray-200"
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-[10px] font-bold text-gray-400">FIN</span>
                      <Input
                        type="time"
                        value={s.end}
                        onChange={e => {
                          const newShifts = [...shifts];
                          newShifts[idx].end = e.target.value;
                          setShifts(newShifts);
                        }}
                        className="bg-white rounded-lg h-8 border-gray-200"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShifts(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-600 h-8 w-8 p-0 cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShifts([...shifts, { start: "08:00", end: "14:00" }])}
                  className="w-full border-dashed border-2 border-blue-200 text-blue-600 font-bold py-3.5 rounded-2xl hover:bg-blue-50 transition-all cursor-pointer"
                >
                  <Plus size={16} className="mr-2" /> Añadir Tramo (ej. turno tarde)
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsEditing(null)} className="rounded-xl font-bold text-gray-500 cursor-pointer">Cancelar</Button>
              <Button type="button" onClick={handleSaveSchedule} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-8 font-black shadow-lg shadow-blue-200 cursor-pointer">
                <Check size={18} className="mr-2" /> Guardar Temporada
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SECCIÓN TEMPORADAS */}
      <section className="space-y-6 min-h-[700px]">
        <header className="flex items-center justify-between border-b pb-4 border-gray-100">
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <Clock className="text-blue-500" /> Temporadas y Turnos
          </h2>
          <Button onClick={handleOpenNew} size="sm" className="rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-600 font-bold cursor-pointer">
            <Plus size={16} className="mr-2" /> Nueva Temporada
          </Button>
        </header>

        <div className="flex flex-col min-h-[700px]">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-min">
            {initialSchedules.slice((schedPage - 1) * SCHED_PER_PAGE, schedPage * SCHED_PER_PAGE).map(s => (
              <Card key={s.id} className="group hover:border-blue-400 transition-all border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 bg-gray-50/50 flex items-center justify-between border-b border-gray-100">
                  <div className="font-black text-gray-900">{s.name}</div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setIsEditing(s.id);
                      setName(s.name);
                      setFrom(toCalendarInput(s.validFrom));
                      setUntil(toCalendarInput(s.validUntil));
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
                        cancelButtonText: "Cancelar",
                        heightAuto: false
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
                    {formatCalendarDisplay(s.validFrom)} - {formatCalendarDisplay(s.validUntil)}
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

          {(() => {
            const totalSchedPages = Math.ceil(initialSchedules.length / SCHED_PER_PAGE);
            if (totalSchedPages <= 1) return null;
            return (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button variant="outline" size="sm" onClick={() => setSchedPage(p => Math.max(1, p - 1))} disabled={schedPage === 1} className="h-7 w-7 p-0 rounded-lg border-gray-200 text-gray-500">
                  <ChevronLeft size={14} />
                </Button>
                {Array.from({ length: totalSchedPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setSchedPage(p)} className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${schedPage === p ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>{p}</button>
                ))}
                <Button variant="outline" size="sm" onClick={() => setSchedPage(p => Math.min(totalSchedPages, p + 1))} disabled={schedPage === totalSchedPages} className="h-7 w-7 p-0 rounded-lg border-gray-200 text-gray-500">
                  <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}
        </div>
      </section>

      {/* SECCIÓN FESTIVOS */}
      <section className="space-y-6 pt-12 border-t border-gray-100">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <Calendar className="text-purple-500" /> Festivos y No Laborables
        </h2>

        <Card className="rounded-2xl border-gray-200 shadow-sm overflow-hidden bg-gray-50/20">
          <CardContent className="p-6">
            <div className="flex gap-2 mb-4">
              {[
                { id: "single", label: "Día único" },
                { id: "range", label: "Rango de fechas" },
                { id: "multi", label: "Días sueltos" },
                { id: "months", label: "Meses completos" },
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setHolidayMode(mode.id as typeof holidayMode)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${holidayMode === mode.id ? "bg-purple-100 border-purple-300 text-purple-700" : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"}`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-500 uppercase">Nombre del Festivo</Label>
                <Input value={hName} onChange={e => setHName(e.target.value)} placeholder="Ej: Feria de Abril" className="h-11 rounded-xl bg-white" />
              </div>

              {holidayMode === "multi" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-gray-500 uppercase">Días seleccionados ({hMultiDates.length})</Label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCalendarYear(prev => prev - 1)} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-bold">&lt; {calendarYear - 1}</button>
                      <span className="text-sm font-black text-gray-700">{calendarYear}</span>
                      <button onClick={() => setCalendarYear(prev => prev + 1)} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer font-bold">{calendarYear + 1} &gt;</button>
                    </div>
                  </div>
                  {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map((monthName, monthIdx) => {
                    const daysInMonth = new Date(calendarYear, monthIdx + 1, 0).getDate();
                    const firstDayOfWeek = new Date(calendarYear, monthIdx, 1).getDay();
                    const days = [];
                    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
                    for (let d = 1; d <= daysInMonth; d++) days.push(d);

                    return (
                      <details key={monthIdx} className="group">
                        <summary className="text-[10px] font-bold text-gray-500 cursor-pointer hover:text-gray-700 py-1 px-2 rounded-lg hover:bg-gray-100">{monthName} {calendarYear}</summary>
                        <div className="grid grid-cols-7 gap-0.5 mt-1 p-1 bg-gray-50 rounded-xl">
                          {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"].map(day => (
                            <div key={day} className="text-[8px] text-gray-400 font-bold text-center py-0.5">{day}</div>
                          ))}
                          {days.map((d, i) => {
                            if (d === null) return <div key={`e-${i}`} />;
                            const dateStr = `${calendarYear}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                            const isSelected = hMultiDates.includes(dateStr);
                            return (
                              <button
                                key={dateStr}
                                onClick={() => setHMultiDates(prev => prev.includes(dateStr) ? prev.filter(x => x !== dateStr) : [...prev, dateStr])}
                                className={`text-[9px] font-bold rounded-md py-1 text-center transition-all cursor-pointer ${isSelected ? "bg-purple-500 text-white shadow-sm" : "hover:bg-white text-gray-600"}`}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : holidayMode === "months" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500 uppercase">Meses (selección múltiple)</Label>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto kanban-scroll p-2 bg-white rounded-xl border border-gray-200">
                    {(() => {
                      const currentYear = new Date().getFullYear();
                      const months = [];
                      for (let y = currentYear - 1; y <= currentYear + 2; y++) {
                        for (let m = 0; m < 12; m++) {
                          const key = `${y}-${String(m).padStart(2, "0")}`;
                          const label = `${["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m]} ${y}`;
                          months.push(
                            <button
                              key={key}
                              onClick={() => setHMonths(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${hMonths.includes(key) ? "bg-purple-100 border-purple-300 text-purple-700" : "bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200"}`}
                            >
                              {label}
                            </button>
                          );
                        }
                      }
                      return months;
                    })()}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500 uppercase">Inicio</Label>
                    <Input type="date" value={hDate} onChange={e => setHDate(e.target.value)} className="h-11 rounded-xl bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-500 uppercase">{holidayMode === "range" ? "Fin" : "Fin (Opcional)"}</Label>
                    <Input type="date" value={hEndDate} onChange={e => setHEndDate(e.target.value)} className="h-11 rounded-xl bg-white" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-4">
              <Button onClick={handleAddHoliday} className="rounded-xl bg-purple-600 hover:bg-purple-700 font-black px-6">
                <Plus size={14} className="mr-1" /> Añadir {holidayMode === "months" ? "Meses" : holidayMode === "multi" ? "Días" : "Festivo"}
              </Button>
            </div>

            <div className="mt-8 flex flex-col min-h-[240px]">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-min">
                {initialHolidays.slice((holiPage - 1) * HOLI_PER_PAGE, holiPage * HOLI_PER_PAGE).map(h => (
                  <div key={h.id} className="flex items-center justify-between bg-white border border-gray-100 p-3 rounded-2xl shadow-sm group">
                    <div>
                      <div className="text-xs font-black text-gray-800 uppercase">{h.name}</div>
                      <div className="text-[10px] text-gray-400 font-bold">
                        {formatCalendarDisplay(h.startDate, "dd MMM")}
                        {h.endDate && toCalendarInput(h.startDate) !== toCalendarInput(h.endDate) && (
                          <> - {formatCalendarDisplay(h.endDate, "dd MMM")}</>
                        )}
                        {", " + formatCalendarDisplay(h.startDate, "yyyy")}
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
                        cancelButtonText: "Volver",
                        heightAuto: false
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

              {(() => {
                const totalHoliPages = Math.ceil(initialHolidays.length / HOLI_PER_PAGE);
                if (totalHoliPages <= 1) return null;
                return (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <Button variant="outline" size="sm" onClick={() => setHoliPage(p => Math.max(1, p - 1))} disabled={holiPage === 1} className="h-7 w-7 p-0 rounded-lg border-gray-200 text-gray-500">
                      <ChevronLeft size={14} />
                    </Button>
                    {Array.from({ length: totalHoliPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setHoliPage(p)} className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${holiPage === p ? 'bg-purple-500 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>{p}</button>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setHoliPage(p => Math.min(totalHoliPages, p + 1))} disabled={holiPage === totalHoliPages} className="h-7 w-7 p-0 rounded-lg border-gray-200 text-gray-500">
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
