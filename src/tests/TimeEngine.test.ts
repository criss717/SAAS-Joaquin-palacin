import { describe, it, expect, beforeEach } from 'vitest';
import { WorkSchedule, Holiday } from "@prisma/client";
import { TimeEngine } from '../lib/time-engine';

describe('TimeEngine - Motor de Tiempo Industrial', () => {
    let engine: TimeEngine;

    const mockSchedules: Partial<WorkSchedule>[] = [
        {
            id: "1",
            name: "Horario General",
            validFrom: new Date('2026-01-01T00:00:00Z'),
            validUntil: new Date('2026-12-31T00:00:00Z'), // Guardado con medianoche
            workingDays: JSON.stringify([1, 2, 3, 4, 5]), // Lunes a Viernes
            shifts: JSON.stringify([
                { start: "08:00", end: "14:00" },
                { start: "16:00", end: "18:00" }
            ]),
        },
        {
            id: "2",
            name: "Horas Extras Sabados Mayo",
            validFrom: new Date('2026-05-01T00:00:00Z'),
            validUntil: new Date('2026-05-31T00:00:00Z'),
            workingDays: JSON.stringify([6]), // Sábados
            shifts: JSON.stringify([
                { start: "08:00", end: "13:00" } // 5 horas
            ])
        }
    ];

    const mockHolidays: Partial<Holiday>[] = [{
        id: "h1",
        startDate: new Date('2026-05-01T00:00:00Z'), // 1 de Mayo (Viernes)
        endDate: new Date('2026-05-01T00:00:00Z'),
        name: "Fiesta del Trabajo"
    }];

    beforeEach(() => {
        engine = new TimeEngine(mockSchedules as WorkSchedule[], mockHolidays as Holiday[]);
    });

    it('debería sumar 4 horas dentro del turno de la mañana', () => {
        const inicio = new Date('2026-05-04T08:00:00'); // Lunes 8:00 AM
        const resultado = engine.addBusinessHours(inicio, 4);

        expect(resultado.getHours()).toBe(12);
        expect(resultado.getDate()).toBe(4);
    });

    it('debería saltar la pausa de comida (14:00 a 16:00)', () => {
        const inicio = new Date('2026-05-04T12:00:00'); // Lunes 12:00
        // 2h hasta las 14:00, luego pausa 14:00-16:00, luego 1h de 16:00 a 17:00
        const resultado = engine.addBusinessHours(inicio, 3);

        expect(resultado.getDate()).toBe(4);
        expect(resultado.getHours()).toBe(17);
        expect(resultado.getMinutes()).toBe(0);
    });

    it('si la fecha de inicio es a las 18:00 (fin de jornada), debe saltar a las 08:00 del siguiente día hábil', () => {
        const finJornada = new Date('2026-05-04T18:00:00'); // Lunes 18:00
        const resultado = engine.addBusinessHours(finJornada, 2);

        // Debe empezar el Martes 5 a las 08:00 y terminar a las 10:00
        expect(resultado.getDate()).toBe(5);
        expect(resultado.getHours()).toBe(10);
    });

    it('debería aprovechar horas extras configuradas en sábado', () => {
        const viernesTarde = new Date('2026-05-08T17:00:00'); // Viernes 17:00 (queda 1h)
        // 1h consume viernes hasta las 18:00, la 2da hora debe consumirse el sábado 9 de mayo a las 09:00
        const resultado = engine.addBusinessHours(viernesTarde, 2);

        expect(resultado.getDay()).toBe(6); // Sábado
        expect(resultado.getDate()).toBe(9);
        expect(resultado.getHours()).toBe(9);
    });

    it('debería saltar un día festivo configurado (1 de Mayo)', () => {
        const jueves = new Date('2026-04-30T17:00:00'); // Jueves 30 de Abril a las 17:00 (queda 1h)
        // 1h consume el jueves. El viernes 1 es festivo. Salta al sábado 2 de Mayo (horas extras 8:00-13:00)
        const resultado = engine.addBusinessHours(jueves, 2);

        expect(resultado.getDate()).toBe(2); // Sábado 2 de Mayo
        expect(resultado.getHours()).toBe(9);
    });

    it('debería calcular correctamente en el límite de fin de año (31 de Diciembre)', () => {
        const finDeAno = new Date('2026-12-31T10:00:00'); // Jueves 31 de Diciembre a las 10:00
        // 4h de 10:00 a 14:00, luego pausa 14-16, 1h de 16:00 a 17:00 (total 5h)
        const resultado = engine.addBusinessHours(finDeAno, 5);

        expect(resultado.getFullYear()).toBe(2026);
        expect(resultado.getMonth()).toBe(11); // Diciembre
        expect(resultado.getDate()).toBe(31);
        expect(resultado.getHours()).toBe(17);
    });

    it('debería usar fallback coherente para fechas de años futuros sin colapsar a 2029', () => {
        const futuro = new Date('2028-03-01T08:00:00'); // Miércoles en 2028
        const resultado = engine.addBusinessHours(futuro, 8); // Jornada completa (6h mañana + 2h tarde)

        expect(resultado.getFullYear()).toBe(2028);
        expect(resultado.getMonth()).toBe(2); // Marzo
        expect(resultado.getDate()).toBe(1);
        expect(resultado.getHours()).toBe(18); // 18:00
    });

    it('calculateBusinessHours debe contar exactamente las horas trabajadas', () => {
        const inicio = new Date('2026-05-04T08:00:00'); // Lunes 08:00
        const fin = new Date('2026-05-05T10:00:00');    // Martes 10:00 (8h del lunes + 2h del martes = 10h)

        const horas = engine.calculateBusinessHours(inicio, fin);
        expect(horas).toBe(10);
    });

    it('getNextAvailableWorkingSlot durante el descanso de comida debe devolver las 16:00', () => {
        const descanso = new Date('2026-05-04T14:45:00'); // Lunes 14:45
        const slot = engine.getNextAvailableWorkingSlot(descanso);

        expect(slot.getDate()).toBe(4);
        expect(slot.getHours()).toBe(16);
        expect(slot.getMinutes()).toBe(0);
    });
});
