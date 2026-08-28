import { WorkSchedule, Holiday } from "@prisma/client";

/**
 * Horario base por defecto de respaldo.
 * Se utiliza si un proyecto tiene fechas fuera de los horarios configurados
 * o si la base de datos no tiene horarios registrados aún.
 */
const DEFAULT_FALLBACK_SCHEDULE: WorkSchedule = {
  id: "default-fallback",
  name: "Horario General (Estándar)",
  validFrom: new Date("1970-01-01T00:00:00.000Z"),
  validUntil: new Date("2099-12-31T23:59:59.999Z"),
  workingDays: JSON.stringify([1, 2, 3, 4, 5]), // Lunes a Viernes
  shifts: JSON.stringify([
    { start: "08:00", end: "14:00" },
    { start: "16:00", end: "18:00" }
  ]),
  createdAt: new Date(),
  updatedAt: new Date()
};

/**
 * Motor de Tiempo Industrial Unificado.
 * Modela el calendario laboral de la fábrica respetando turnos (shifts),
 * temporadas, horas extras (sábados o tramos especiales), festivos y periodos no laborables.
 */
export class TimeEngine {
  private schedules: WorkSchedule[];
  private holidays: Holiday[];

  constructor(schedules: WorkSchedule[], holidays: Holiday[]) {
    this.schedules = schedules;
    this.holidays = holidays;
  }

  /**
   * Obtiene la configuración de horario aplicable para una fecha dada.
   * Normaliza los límites de fecha (00:00:00.000 a 23:59:59.999) y prioriza
   * horarios específicos que marquen ese día de la semana como laborable (ej. horas extras en sábado).
   */
  getScheduleForDate(date: Date): WorkSchedule | null {
    const dateTime = date.getTime();
    const day = date.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb

    // 1. Filtrar temporadas cuyo rango abarque la fecha consultada (con límites de día completo)
    const matching = this.schedules.filter(s => {
      const from = new Date(s.validFrom);
      from.setHours(0, 0, 0, 0);
      const until = new Date(s.validUntil);
      until.setHours(23, 59, 59, 999);
      return dateTime >= from.getTime() && dateTime <= until.getTime();
    });

    if (matching.length > 0) {
      // Si hay varias temporadas vigentes en esa fecha, preferir la que active este día específico
      const matchingWorkingDay = matching.find(s => {
        try {
          const days = JSON.parse(s.workingDays) as number[];
          return Array.isArray(days) && days.includes(day);
        } catch {
          return false;
        }
      });
      return matchingWorkingDay || matching[0];
    }

    // 2. Fallback resiliente: Si no hay horario específico para esta fecha/año,
    // usamos la plantilla general de los horarios existentes o el horario estándar base
    if (this.schedules.length > 0) {
      // Buscar horario general existente que incluya este día de la semana
      const generalSchedule = this.schedules.find(s => {
        try {
          const days = JSON.parse(s.workingDays) as number[];
          return Array.isArray(days) && days.includes(day);
        } catch {
          return false;
        }
      });
      return generalSchedule || this.schedules[0];
    }

    // 3. Fallback absoluto
    return DEFAULT_FALLBACK_SCHEDULE;
  }

  /**
   * Comprueba si una fecha coincide con algún festivo registrado en la BD.
   */
  isHoliday(date: Date): boolean {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const targetMidnight = d.getTime();

    return this.holidays.some(h => {
      const start = new Date(h.startDate);
      start.setHours(0, 0, 0, 0);
      const end = h.endDate ? new Date(h.endDate) : new Date(h.startDate);
      end.setHours(23, 59, 59, 999);
      return targetMidnight >= start.getTime() && targetMidnight <= end.getTime();
    });
  }

  /**
   * Comprueba si un día de la semana es laborable según el horario proporcionado.
   */
  isWorkingDay(date: Date, schedule: WorkSchedule | null): boolean {
    if (!schedule) return false;
    try {
      const day = date.getDay();
      const workingDays = JSON.parse(schedule.workingDays) as number[];
      return Array.isArray(workingDays) && workingDays.includes(day);
    } catch {
      return false;
    }
  }

  /**
   * Obtiene los turnos configurados para un horario dado en formato ordenado.
   */
  private getParsedShifts(schedule: WorkSchedule | null): { startH: number; startM: number; endH: number; endM: number }[] {
    if (!schedule) return [];
    try {
      const rawShifts = JSON.parse(schedule.shifts) as { start: string; end: string }[];
      if (!Array.isArray(rawShifts) || rawShifts.length === 0) return [];

      return rawShifts
        .map(s => {
          const [startH, startM] = s.start.split(":").map(Number);
          const [endH, endM] = s.end.split(":").map(Number);
          return { startH, startM, endH, endM };
        })
        .sort((a, b) => (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
    } catch {
      return [];
    }
  }

  /**
   * Encuentra el siguiente momento laborable disponible a partir de una fecha.
   * - Si la fecha ya está dentro de un turno activo en un día laborable y no festivo, devuelve la misma fecha.
   * - Si está en descanso/pausa (ej. 14:30), devuelve el inicio del siguiente turno (ej. 16:00).
   * - Si ya terminó la jornada (ej. 18:00), o es festivo/fin de semana, busca el primer turno del siguiente día hábil.
   */
  getNextAvailableWorkingSlot(date: Date): Date {
    const current = new Date(date);
    let attempts = 0;

    while (attempts < 365) {
      const schedule = this.getScheduleForDate(current);
      const isLaborable = this.isWorkingDay(current, schedule) && !this.isHoliday(current);

      if (isLaborable && schedule) {
        const shifts = this.getParsedShifts(schedule);
        for (const shift of shifts) {
          const shiftStart = new Date(current);
          shiftStart.setHours(shift.startH, shift.startM, 0, 0);

          const shiftEnd = new Date(current);
          shiftEnd.setHours(shift.endH, shift.endM, 0, 0);

          // Si estamos antes del inicio de este turno hoy, el siguiente momento es el inicio del turno
          if (current.getTime() <= shiftStart.getTime()) {
            return shiftStart;
          }

          // Si estamos dentro del turno, podemos empezar/continuar inmediatamente
          if (current.getTime() < shiftEnd.getTime()) {
            return current;
          }
        }
      }

      // Si hoy no es laborable o ya pasaron todos los turnos del día, avanzar a mañana a las 00:00
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      attempts++;
    }

    return current;
  }

  /**
   * Encuentra el inicio de la siguiente jornada laborable (apertura del primer turno).
   * Usado cuando explícitamente se requiere saltar al siguiente día hábil.
   */
  getNextWorkingDayStart(date: Date): Date {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);
    return this.getNextAvailableWorkingSlot(nextDay);
  }

  /**
   * Añade X horas de trabajo a una fecha de inicio, saltando periodos no laborables y descansos.
   */
  addBusinessHours(startDate: Date, hoursToAdd: number): Date {
    if (hoursToAdd <= 0) return new Date(startDate);

    // 1. Normalizar fecha de inicio al primer minuto laborable real disponible
    let current = this.getNextAvailableWorkingSlot(new Date(startDate));
    let remainingMs = Math.round(hoursToAdd * 60 * 60 * 1000);
    let safetyCounter = 0;

    while (remainingMs > 0 && safetyCounter < 1000) {
      safetyCounter++;
      const schedule = this.getScheduleForDate(current);

      if (!schedule || this.isHoliday(current) || !this.isWorkingDay(current, schedule)) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        current = this.getNextAvailableWorkingSlot(current);
        continue;
      }

      const shifts = this.getParsedShifts(schedule);
      if (shifts.length === 0) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }

      for (const shift of shifts) {
        const shiftStart = new Date(current);
        shiftStart.setHours(shift.startH, shift.startM, 0, 0);

        const shiftEnd = new Date(current);
        shiftEnd.setHours(shift.endH, shift.endM, 0, 0);

        // Si current ya rebasó este turno, continuar al siguiente turno
        if (current.getTime() >= shiftEnd.getTime()) continue;

        // El inicio real en este turno es el mayor entre shiftStart y current
        const actualStart = current.getTime() < shiftStart.getTime() ? shiftStart : current;
        const availableMs = shiftEnd.getTime() - actualStart.getTime();

        if (remainingMs <= availableMs) {
          // El trabajo finaliza dentro de este turno
          return new Date(actualStart.getTime() + remainingMs);
        } else {
          // Consumir el turno completo y avanzar el tiempo
          remainingMs -= availableMs;
          current = shiftEnd;
        }
      }

      // Si quedan horas por consumir tras los turnos del día, avanzar al día siguiente
      if (remainingMs > 0) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        current = this.getNextAvailableWorkingSlot(current);
      }
    }

    return current;
  }

  /**
   * Calcula el número de horas laborables efectivas entre dos fechas.
   * Utilizado para la estimación inversa de horas al modificar fechas en el modal o Kanban.
   */
  calculateBusinessHours(startDate: Date, endDate: Date): number {
    if (startDate.getTime() >= endDate.getTime()) return 0;

    let current = new Date(startDate);
    const end = new Date(endDate);
    let totalMs = 0;
    let safetyCounter = 0;

    while (current.getTime() < end.getTime() && safetyCounter < 1000) {
      safetyCounter++;
      const schedule = this.getScheduleForDate(current);

      if (!schedule || this.isHoliday(current) || !this.isWorkingDay(current, schedule)) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }

      const shifts = this.getParsedShifts(schedule);
      if (shifts.length === 0) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }

      for (const shift of shifts) {
        const shiftStart = new Date(current);
        shiftStart.setHours(shift.startH, shift.startM, 0, 0);

        const shiftEnd = new Date(current);
        shiftEnd.setHours(shift.endH, shift.endM, 0, 0);

        if (current.getTime() >= shiftEnd.getTime()) continue;

        const actualStart = current.getTime() < shiftStart.getTime() ? shiftStart : current;
        const actualEnd = end.getTime() < shiftEnd.getTime() ? end : shiftEnd;

        if (actualStart.getTime() < actualEnd.getTime()) {
          totalMs += actualEnd.getTime() - actualStart.getTime();
        }

        if (end.getTime() <= shiftEnd.getTime()) {
          return Number((totalMs / (1000 * 60 * 60)).toFixed(2));
        }
      }

      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }

    return Number((totalMs / (1000 * 60 * 60)).toFixed(2));
  }
}
