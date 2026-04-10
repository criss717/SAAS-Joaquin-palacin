"use server";

import prisma from "@/lib/prisma";
import { TimeEngine } from "@/lib/time-engine";

/**
 * Obtiene o inicializa la instancia unificada del TimeEngine industrial,
 * inyectando los calendarios y festivos almacenados en la base de datos.
 */
async function getEngine(): Promise<TimeEngine> {
  let schedules = await prisma.workSchedule.findMany({ orderBy: { validFrom: "asc" } });
  const holidays = await prisma.holiday.findMany();

  // Prevención de fallback en caso de instalación limpia sin horarios aún configurados.
  if (schedules.length === 0) {
    const defaultSchedule = await prisma.workSchedule.create({
      data: {
        name: "Horario General (Default Autogenerado)",
        validFrom: new Date("2020-01-01"),
        validUntil: new Date("2050-12-31"),
        workingDays: "[1,2,3,4,5]",
        shifts: JSON.stringify([{ start: "08:00", end: "14:00" }, { start: "16:00", end: "18:00" }])
      }
    });
    schedules = [defaultSchedule];
  }

  return new TimeEngine(schedules, holidays);
}

/**
 * Dada una fecha de inicio y una volumetría de horas estimadas,
 * calcula algorítmicamente y retorna la fecha industrial de finalización pura.
 */
export async function calculateEndDateAction(startDate: Date, hours: number): Promise<Date> {
  // Guard Clauses de validación de datos
  if (!startDate || isNaN(startDate.getTime())) throw new Error("Fecha de inicio inválida para cálculo motor.");
  if (typeof hours !== "number" || hours <= 0) return startDate;

  const engine = await getEngine();
  return engine.addBusinessHours(startDate, hours);
}

/**
 * Calculadora temporal inversa. Permite suministrar 2 fechas y obtiene
 * la carga total horaria que representan descontando tiempos inactivos.
 */
export async function calculateHoursAction(startDate: Date, endDate: Date): Promise<number> {
  // Guard Clauses de validación de entradas
  if (!startDate || !endDate) return 0;
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 0;
  if (startDate >= endDate) return 0;

  const engine = await getEngine();
  return engine.calculateBusinessHours(startDate, endDate);
}

/**
 * Calcula el inicio de la siguiente jornada laborable tras una fecha de referencia.
 */
export async function getNextWorkingDayAction(date: Date): Promise<Date> {
  if (!date || isNaN(date.getTime())) throw new Error("Fecha de referencia inválida.");
  const engine = await getEngine();
  return engine.getNextWorkingDayStart(date);
}
