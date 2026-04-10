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
  /**
   * Calcula el número de horas laborables efectivas entre dos fechas.
   * Útil para la estimación inversa de horas al modificar fechas maestras.
   */
  calculateBusinessHours(startDate: Date, endDate: Date): number {
    if (startDate >= endDate) return 0;

    const current = new Date(startDate);

    let totalMs = 0;

    // Iterar cronológicamente día por día hasta superar endDate
    while (current < endDate) {
      const schedule = this.getScheduleForDate(current);
      if (!schedule || this.isHoliday(current) || !this.isWorkingDay(current, schedule)) {
        // Día inactivo: saltar directo al siguiente
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }

      const shifts = JSON.parse(schedule.shifts) as { start: string, end: string }[];
      
      // Analizar cada turno del día activo
      for (const shift of shifts) {
        const [startH, startM] = shift.start.split(':').map(Number);
        const [endH, endM] = shift.end.split(':').map(Number);

        const shiftStart = new Date(current);
        shiftStart.setHours(startH, startM, 0, 0);
        
        const shiftEnd = new Date(current);
        shiftEnd.setHours(endH, endM, 0, 0);

        if (current >= shiftEnd) continue; // Si current ya rebasó este turno, ignorar

        // Definir la intersección temporal [actualStart, actualEnd] real dentro de este turno
        const actualStart = current < shiftStart ? shiftStart : current;
        const actualEnd = endDate < shiftEnd ? endDate : shiftEnd;

        // Si hay una porción de tiempo válida en este turno, sumarla
        if (actualStart < actualEnd) {
          totalMs += actualEnd.getTime() - actualStart.getTime();
        }

        // Si ya alcanzamos el límite superior final, devolver resultado final
        if (endDate <= shiftEnd) {
          return Number((totalMs / (1000 * 60 * 60)).toFixed(2)); // Retornar en formato de horas exacto
        }
      }

      // Finalizó este día, ir al siguiente asumiendo carga a medianoche
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }

    return Number((totalMs / (1000 * 60 * 60)).toFixed(2));
  }

  getScheduleForDate(date: Date): WorkSchedule | null {
    return this.schedules.find(s => date >= s.validFrom && date <= s.validUntil) || null;
  }

  isHoliday(date: Date): boolean {
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

  isWorkingDay(date: Date, schedule: WorkSchedule | null): boolean {
    if (!schedule) return false;
    const day = date.getDay(); // 0=Dom, 1=Lun...
    const workingDays = JSON.parse(schedule.workingDays) as number[];
    return workingDays.includes(day);
  }

  /**
   * Encuentra el inicio de la siguiente jornada laborable tras una fecha dada.
   * Utilizado para programar tareas inmediatamente después de sus dependencias.
   */
  getNextWorkingDayStart(date: Date): Date {
    const d = new Date(date);
    let attempts = 0;
    
    // Si la fecha de referencia es, por ejemplo, viernes a las 18:00,
    // debemos saltar a lunes a las 08:00 (o la hora de inicio del primer turno).
    while (attempts < 365) {
      const schedule = this.getScheduleForDate(d);
      const shifts = schedule ? JSON.parse(schedule.shifts) as { start: string, end: string }[] : [];
      const firstShiftStart = shifts.length > 0 ? shifts[0].start : "08:00";
      const [hStart, mStart] = firstShiftStart.split(":").map(Number);

      // Si hoy es laborable y aún no hemos pasado la hora de inicio...
      // O si estamos normalizando desde el pasado. 
      // Pero usualmente queremos que empiece mañana si la dependencia termina hoy.
      
      // Lógica simple: avanzar al día siguiente a la hora de apertura
      d.setDate(d.getDate() + 1);
      d.setHours(hStart, mStart, 0, 0);

      const nextSchedule = this.getScheduleForDate(d);
      if (this.isWorkingDay(d, nextSchedule) && !this.isHoliday(d)) {
        return d;
      }
      attempts++;
    }
    return d;
  }
}
