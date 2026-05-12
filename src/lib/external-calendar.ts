/**
 * Calendario genérico para proveedores externos.
 *
 * Reglas:
 * - Laborable: Lunes a Viernes
 * - Excluido: Todo el mes de Agosto (vacaciones genéricas de proveedores)
 *
 * Este motor es independiente del TimeEngine interno de la empresa.
 * Se usa automáticamente para toda tarea con deliveryDays > 0.
 */

/** Comprueba si un día es laborable para proveedores externos */
export function isExternalWorkingDay(date: Date): boolean {
  const day = date.getDay(); // 0=Dom, 6=Sáb
  if (day === 0 || day === 6) return false;
  if (date.getMonth() === 7) return false; // Agosto = mes índice 7
  return true;
}

/**
 * Avanza N días laborables desde una fecha usando el calendario de proveedores.
 * Cuenta solo Lun-Vie, salta fines de semana y todo agosto.
 * 
 * @deprecated Usar addCalendarDays para el nuevo comportamiento (días naturales).
 */
export function addExternalDays(startDate: Date, days: number): Date {
  if (days <= 0) return new Date(startDate);

  let remaining = days;
  const current = new Date(startDate);

  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    if (isExternalWorkingDay(current)) {
      remaining--;
    }
  }

  current.setHours(17, 0, 0, 0);
  return current;
}

/**
 * Avanza N días NATURALES desde una fecha, saltando TODO agosto.
 * Si la fecha final cae en Sábado o Domingo (o en agosto), se mueve al siguiente Lunes hábil.
 *
 * Ejemplo: 12 semanas = 84 días desde 1-junio
 *   → 84 - 61 (jun+jul) = 23 días desde 1-septiembre
 *   → fecha final: 23 de septiembre
 *
 * @param startDate - Fecha de inicio
 * @param days - Número de días naturales a avanzar (ej. 84 para 12 semanas)
 * @returns Fecha de entrega estimada (al cierre de jornada: 17:00)
 */
export function addCalendarDays(startDate: Date, days: number): Date {
  if (days <= 0) return new Date(startDate);

  let added = 0;
  const current = new Date(startDate);

  while (added < days) {
    current.setDate(current.getDate() + 1);
    if (current.getMonth() !== 7) { // saltar agosto completo
      added++;
    }
  }

  // Si cayó en Sáb(6), Dom(0) o dentro de agosto → avanzar al siguiente día hábil
  while (current.getDay() === 0 || current.getDay() === 6 || current.getMonth() === 7) {
    current.setDate(current.getDate() + 1);
  }

  current.setHours(17, 0, 0, 0);
  return current;
}

/**
 * Obtiene el siguiente día laborable del calendario de proveedores.
 * Útil para normalizar fechas de inicio de pedidos externos.
 *
 * @param date - Fecha de referencia
 * @returns Siguiente día laborable a las 08:00
 */
export function getNextExternalWorkingDay(date: Date): Date {
  const d = new Date(date);
  let attempts = 0;

  while (attempts < 400) {
    d.setDate(d.getDate() + 1);
    if (isExternalWorkingDay(d)) {
      d.setHours(8, 0, 0, 0);
      return d;
    }
    attempts++;
  }

  return d;
}
