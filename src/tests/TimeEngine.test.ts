import { describe, it, expect, beforeEach } from 'vitest';
import { WorkSchedule, Holiday } from "@prisma/client";
import { TimeEngine } from '../lib/time-engine';

describe('TimeEngine - Motor de Tiempo Industrial', () => {
    let engine: TimeEngine;

    // Estos son nuestros datos de prueba (Mocks)
    const mockSchedules: Partial<WorkSchedule>[] = [{
        id: "1",
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validUntil: new Date('2026-12-31T23:59:59Z'),
        workingDays: JSON.stringify([1, 2, 3, 4, 5]), // Lunes a Viernes
        shifts: JSON.stringify([{ start: "08:00", end: "17:00" }]),
    }];

    const mockHolidays: Partial<Holiday>[] = [{
        id: "h1",
        startDate: new Date('2026-05-01T00:00:00Z'), // 1 de Mayo (Viernes)
        endDate: new Date('2026-05-01T00:00:00Z'),
        name: "Fiesta del Trabajo"
    }];

    beforeEach(() => {
        // Inicializamos el motor antes de cada test
        engine = new TimeEngine(mockSchedules as WorkSchedule[], mockHolidays as Holiday[]);
    });

    // --- TEST 1: Sumar horas en el mismo día ---
    it('debería sumar 4 horas dentro del mismo turno', () => {
        const inicio = new Date('2026-05-04T08:00:00'); // Lunes 8:00 AM
        const resultado = engine.addBusinessHours(inicio, 4);

        // Esperamos las 12:00 PM del mismo día
        expect(resultado.getHours()).toBe(12);
        expect(resultado.getDate()).toBe(4);
    });

    // --- TEST 2: Saltar Fin de Semana ---
    it('debería saltar el fin de semana al añadir horas un viernes tarde', () => {
        const viernesTarde = new Date('2026-05-08T16:00:00'); // Viernes 4:00 PM (queda 1h)

        // Añadimos 2 horas. 1h consume el viernes, la otra debe ir al Lunes
        const resultado = engine.addBusinessHours(viernesTarde, 2);

        // Esperamos Lunes 11 de Mayo a las 09:00 AM
        expect(resultado.getDay()).toBe(1); // 1 = Lunes
        expect(resultado.getDate()).toBe(11);
        expect(resultado.getHours()).toBe(9);
    });

    // --- TEST 3: Ignorar Festivos ---
    it('debería saltar un día festivo configurado', () => {
        const jueves = new Date('2026-04-30T16:00:00'); // Jueves antes del festivo

        // Añadimos 2 horas. 1h el jueves, el viernes es festivo (1 Mayo), salta al lunes
        const resultado = engine.addBusinessHours(jueves, 2);

        expect(resultado.getDate()).toBe(4); // Lunes 4 de Mayo
        expect(resultado.getHours()).toBe(9);
    });
});