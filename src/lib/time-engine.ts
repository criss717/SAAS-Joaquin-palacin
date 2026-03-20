import { WorkSchedule, Holiday } from "@prisma/client";

/**
 * Motor de tiempo para cálculo de fechas industriales (Gantt ERP).
 * Maneja saltos de fines de semana, festivos y tramos de jornada (temporadas).
 */
export class TimeEngine {
  private schedules: WorkSchedule[];
  private holidays: Holiday[];

  constructor(schedules: WorkSchedule[], holidays: Holiday[]) {
    this.schedules = schedules;
    this.holidays = holidays;
  }

  /**
   * Añade X horas de trabajo a una fecha de inicio, saltando periodos no laborables.
   */
  addBusinessHours(startDate: Date, hoursToAdd: number): Date {
    let current = new Date(startDate);
    let remaining = hoursToAdd;

    // Lógica simplificada inicial: Si no hay horas que añadir, devolver inicio
    if (remaining <= 0) return current;

    // Iterar hasta consumir todas las horas
    while (remaining > 0) {
      const schedule = this.getScheduleForDate(current);
      if (!schedule || this.isHoliday(current) || !this.isWorkingDay(current, schedule)) {
        // Ir al inicio del día siguiente (00:00)
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }

      const shifts = JSON.parse(schedule.shifts) as { start: string, end: string }[];
      // Iterar por cada turno del horario actual

      for (const shift of shifts) {
        const [startH, startM] = shift.start.split(':').map(Number);
        const [endH, endM] = shift.end.split(':').map(Number);

        const shiftStart = new Date(current);
        shiftStart.setHours(startH, startM, 0, 0);
        
        const shiftEnd = new Date(current);
        shiftEnd.setHours(endH, endM, 0, 0);

        // Si ya pasó el fin de este turno, saltar
        if (current >= shiftEnd) continue;

        // Si estamos antes del inicio del turno, empezar en el inicio del turno
        const actualStart = current < shiftStart ? shiftStart : current;
        
        // Calcular tiempo disponible en este turno (en milisegundos)
        const availableMs = shiftEnd.getTime() - actualStart.getTime();
        const availableHours = availableMs / (1000 * 60 * 60);

        if (remaining <= availableHours) {
          // La tarea termina en este turno
          current = new Date(actualStart.getTime() + remaining * 60 * 60 * 1000);
          remaining = 0;
          break;
        } else {
          // Consumir el turno entero y seguir
          remaining -= availableHours;
          current = shiftEnd;
        }
      }

      if (remaining > 0) {
        // Si después de todos los turnos del día sigue quedando tiempo, saltar al día siguiente
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }
    }

    return current;
  }

  private getScheduleForDate(date: Date): WorkSchedule | null {
    return this.schedules.find(s => date >= s.validFrom && date <= s.validUntil) || null;
  }

  private isHoliday(date: Date): boolean {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const midnight = d.getTime();

    return this.holidays.some(h => {
      const start = new Date(h.startDate);
      start.setHours(0, 0, 0, 0);
      const end = h.endDate ? new Date(h.endDate) : start;
      end.setHours(0, 0, 0, 0);
      return midnight >= start.getTime() && midnight <= end.getTime();
    });
  }

  private isWorkingDay(date: Date, schedule: WorkSchedule): boolean {
    const day = date.getDay(); // 0=Dom, 1=Lun...
    const workingDays = JSON.parse(schedule.workingDays) as number[];
    return workingDays.includes(day);
  }
}
