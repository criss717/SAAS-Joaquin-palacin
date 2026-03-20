import { getWorkSchedules, getHolidays } from "@/lib/actions/schedule";
import { ScheduleClient } from "./ScheduleClient";
import { Calendar, Clock, Settings2 } from "lucide-react";

export default async function AdminSchedulePage() {
  const [schedules, holidays] = await Promise.all([
    getWorkSchedules(),
    getHolidays()
  ]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Settings2 className="text-blue-600" size={32} />
            Configuración de Planta
          </h1>
          <p className="text-gray-500 font-medium">Gestiona horarios estacionales y festivos del calendario industrial.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <ScheduleClient initialSchedules={schedules} initialHolidays={holidays} />
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
            <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-3">
              <Clock size={18} /> ¿Cómo funciona?
            </h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              El motor calcula el fin de las tareas basándose en estos turnos.
              Si una tarea dura 20h y atraviesa un fin de semana o un festivo,
              el Gantt saltará esos días automáticamente.
            </p>
          </div>

          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-6">
            <h3 className="font-bold text-purple-900 flex items-center gap-2 mb-3">
              <Calendar size={18} /> Temporadas
            </h3>
            <p className="text-sm text-purple-800 leading-relaxed">
              Puedes definir tramos (ej: Sept-Jun) para el Horario de Invierno
              y otro para Verano. El sistema cambiará de turno automáticamente
              según la fecha de la tarea.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
