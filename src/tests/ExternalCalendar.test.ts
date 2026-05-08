import { describe, it, expect, beforeEach } from 'vitest';
import { WorkSchedule, Holiday } from "@prisma/client";
import { TimeEngine } from '../lib/time-engine';
import { addExternalDays, isExternalWorkingDay, getNextExternalWorkingDay } from '../lib/external-calendar';

/**
 * Test Sofisticado: Doble Motor de Cálculo de Fechas
 *
 * Simula el comportamiento real del sistema donde:
 * - Piezas de FABRICACIÓN (deliveryDays === 0) → TimeEngine interno (calendario empresa)
 * - Piezas de PEDIDO EXTERNO (deliveryDays > 0) → Calendario genérico (sin agosto)
 */

// ──────────────────────────────────────────────
//  Helpers para simular tareas
// ──────────────────────────────────────────────

interface MockTask {
  name: string;
  deliveryDays: number;
  estimatedHours: number;
  stage: string;
}

/** Decide qué motor usar según el tipo de tarea y calcula la fecha de fin */
function calcularFechaFin(
  task: MockTask,
  startDate: Date,
  engine: TimeEngine
): Date {
  if (task.deliveryDays > 0) {
    // PEDIDO EXTERNO → Calendario genérico de proveedores
    return addExternalDays(startDate, task.deliveryDays);
  } else {
    // FABRICACIÓN → TimeEngine interno de la empresa
    return engine.addBusinessHours(startDate, task.estimatedHours);
  }
}

// ══════════════════════════════════════════════
//  TESTS
// ══════════════════════════════════════════════

describe('Doble Motor: Fabricación vs Pedido Externo', () => {
  let engine: TimeEngine;

  // Calendario interno de la empresa (con festivos propios)
  const mockSchedules: Partial<WorkSchedule>[] = [{
    id: "s1",
    validFrom: new Date('2026-01-01T00:00:00'),
    validUntil: new Date('2027-12-31T23:59:59'),
    workingDays: JSON.stringify([1, 2, 3, 4, 5]), // Lun-Vie
    shifts: JSON.stringify([{ start: "08:00", end: "17:00" }]), // 9h/día
  }];

  const mockHolidays: Partial<Holiday>[] = [
    { id: "h1", startDate: new Date('2026-05-01'), endDate: new Date('2026-05-01'), name: "Día del Trabajo" },
    { id: "h2", startDate: new Date('2026-12-25'), endDate: new Date('2026-12-25'), name: "Navidad" },
  ];

  beforeEach(() => {
    engine = new TimeEngine(mockSchedules as WorkSchedule[], mockHolidays as Holiday[]);
  });

  // ─────────────────────────────────────────
  //  Calendario Externo: isExternalWorkingDay
  // ─────────────────────────────────────────

  describe('isExternalWorkingDay', () => {
    it('un lunes de marzo es laborable', () => {
      expect(isExternalWorkingDay(new Date('2026-03-02'))).toBe(true); // Lunes
    });

    it('un sábado NO es laborable', () => {
      expect(isExternalWorkingDay(new Date('2026-03-07'))).toBe(false); // Sábado
    });

    it('un domingo NO es laborable', () => {
      expect(isExternalWorkingDay(new Date('2026-03-08'))).toBe(false); // Domingo
    });

    it('cualquier día de agosto NO es laborable', () => {
      // Probamos varios días de agosto: lunes, miércoles, viernes
      expect(isExternalWorkingDay(new Date('2026-08-03'))).toBe(false); // Lunes
      expect(isExternalWorkingDay(new Date('2026-08-12'))).toBe(false); // Miércoles
      expect(isExternalWorkingDay(new Date('2026-08-28'))).toBe(false); // Viernes
    });

    it('1 de septiembre (martes) SÍ es laborable tras agosto', () => {
      expect(isExternalWorkingDay(new Date('2026-09-01'))).toBe(true); // Martes
    });
  });

  // ─────────────────────────────────────────
  //  Calendario Externo: addExternalDays
  // ─────────────────────────────────────────

  describe('addExternalDays', () => {
    it('5 días laborables desde un lunes = lunes de la semana siguiente', () => {
      const start = new Date('2026-03-02T08:00:00'); // Lunes
      const result = addExternalDays(start, 5);
      expect(result.getDay()).toBe(1); // Lunes
      expect(result.getDate()).toBe(9); // 9 de Marzo
    });

    it('7 días laborables saltan el fin de semana', () => {
      const start = new Date('2026-03-02T08:00:00'); // Lunes
      const result = addExternalDays(start, 7);
      expect(result.getDay()).toBe(3); // Miércoles
      expect(result.getDate()).toBe(11); // 11 de Marzo
    });

    it('0 días devuelve la misma fecha', () => {
      const start = new Date('2026-03-02T08:00:00');
      const result = addExternalDays(start, 0);
      expect(result.getDate()).toBe(start.getDate());
    });

    it('cruzando agosto: 10 días desde el 27 de julio salta todo agosto', () => {
      // 27 Jul (Lun) → quedan 4 días laborables en julio (28, 29, 30, 31)
      // Agosto entero se salta (0 días laborables)
      // Septiembre: necesitamos 6 días más → 1, 2, 3, 4, 7, 8 Sep
      const start = new Date('2026-07-27T08:00:00'); // Lunes 27 Jul
      const result = addExternalDays(start, 10);

      expect(result.getMonth()).toBe(8); // Septiembre (índice 8)
      // 4 días en julio (28-31) + 6 días en sept (1,2,3,4,7,8)
      expect(result.getDate()).toBe(8); // 8 de Septiembre (Martes)
    });

    it('inicio en agosto: los días se acumulan desde septiembre', () => {
      const start = new Date('2026-08-15T08:00:00'); // Mitad de agosto (Sábado)
      const result = addExternalDays(start, 3);

      // Agosto entero es no laborable, avanza hasta septiembre
      expect(result.getMonth()).toBe(8); // Septiembre
      expect(result.getDate()).toBe(3); // 3 de Septiembre (Jueves)
    });

    it('la hora de fin siempre es 17:00', () => {
      const start = new Date('2026-03-02T08:00:00');
      const result = addExternalDays(start, 1);
      expect(result.getHours()).toBe(17);
      expect(result.getMinutes()).toBe(0);
    });
  });

  // ─────────────────────────────────────────
  //  Calendario Externo: getNextExternalWorkingDay
  // ─────────────────────────────────────────

  describe('getNextExternalWorkingDay', () => {
    it('desde un viernes, el siguiente laborable es lunes', () => {
      const friday = new Date('2026-03-06T17:00:00');
      const result = getNextExternalWorkingDay(friday);
      expect(result.getDay()).toBe(1); // Lunes
      expect(result.getDate()).toBe(9);
      expect(result.getHours()).toBe(8);
    });

    it('desde el 31 de julio, el siguiente laborable es 1 de septiembre', () => {
      const julEnd = new Date('2026-07-31T17:00:00'); // Viernes
      const result = getNextExternalWorkingDay(julEnd);
      expect(result.getMonth()).toBe(8); // Septiembre
      expect(result.getDate()).toBe(1); // 1 Sep (Martes)
    });
  });

  // ─────────────────────────────────────────
  //  INTEGRACIÓN: Selector de Motor
  // ─────────────────────────────────────────

  describe('Selector de Motor según tipo de tarea', () => {
    const fabricacion: MockTask = {
      name: "Fabricar Eje Principal",
      deliveryDays: 0,
      estimatedHours: 18, // 2 jornadas de 9h
      stage: "Fabricación Taller",
    };

    const pedidoExterno: MockTask = {
      name: "Rodamientos SKF",
      deliveryDays: 14, // 2 semanas laborales (14 días = 2 sem × 7)
      estimatedHours: 0,
      stage: "Pedido Externo",
    };

    it('FABRICACIÓN: usa TimeEngine interno (9h/día, festivos empresa)', () => {
      const start = new Date('2026-05-04T08:00:00'); // Lunes
      const result = calcularFechaFin(fabricacion, start, engine);

      // 18h / 9h por día = 2 días laborables → Martes 5 de Mayo a las 17:00
      expect(result.getDay()).toBe(2); // Martes
      expect(result.getDate()).toBe(5);
      expect(result.getHours()).toBe(17);
    });

    it('PEDIDO EXTERNO: usa calendario genérico (sin agosto)', () => {
      const start = new Date('2026-05-04T08:00:00'); // Lunes
      const result = calcularFechaFin(pedidoExterno, start, engine);

      // 14 días laborables = 2 semanas + 4 días
      // Sem 1: 5,6,7,8,11 (5d) → faltan 9
      // Sem 2: 12,13,14,15,18 (5d) → faltan 4
      // Sem 3: 19,20,21,22 (4d) → listo
      expect(result.getDate()).toBe(22); // Viernes 22 de Mayo
      expect(result.getHours()).toBe(17);
    });

    it('FABRICACIÓN respeta festivos de la empresa, EXTERNO los ignora', () => {
      // 1 de Mayo es festivo SOLO para fabricación interna
      const start = new Date('2026-04-30T08:00:00'); // Jueves 30 Abril

      // Fabricación: 18h → 2 jornadas. Jueves (9h) + Viernes 1 Mayo = FESTIVO → Lunes 4 Mayo
      const fabResult = calcularFechaFin(fabricacion, start, engine);
      expect(fabResult.getDate()).toBe(4); // Lunes 4 (saltó festivo 1 Mayo)

      // Pedido externo: NO le afecta el festivo del 1 Mayo
      const extTask: MockTask = { ...pedidoExterno, deliveryDays: 2 };
      const extResult = calcularFechaFin(extTask, start, engine);
      // 2 días laborables desde 30 Abril: 1 Mayo (es Vie, laborable para proveedor) + 4 Mayo (Lun)
      expect(extResult.getMonth()).toBe(4); // Mayo (índice 4)
      expect(extResult.getDate()).toBe(4); // 4 de Mayo
    });

    it('PEDIDO EXTERNO cruzando agosto se retrasa correctamente', () => {
      // Pedido de 5 días que empieza el 30 de julio
      const extTask: MockTask = {
        name: "Tornillos especiales",
        deliveryDays: 5,
        estimatedHours: 0,
        stage: "Pedido Externo",
      };

      const start = new Date('2026-07-30T08:00:00'); // Jueves 30 Julio
      const result = calcularFechaFin(extTask, start, engine);

      // 30 Jul (Jue) → 31 Jul (Vie) = 1 día
      // Agosto completo = 0 días (saltado)
      // Sep: 1(Mar)=2, 2(Mié)=3, 3(Jue)=4, 4(Vie)=5 → ¡listo!
      expect(result.getMonth()).toBe(8); // Septiembre
      expect(result.getDate()).toBe(4);  // Viernes 4 Sep
    });

    it('FABRICACIÓN que cruza agosto NO se retrasa (usa calendario interno)', () => {
      // El TimeEngine interno NO tiene agosto bloqueado
      const start = new Date('2026-07-31T08:00:00'); // Viernes 31 Julio
      const fabResult = calcularFechaFin(fabricacion, start, engine);

      // 18h desde Viernes 31 Jul 08:00
      // Viernes: 9h → quedan 9h
      // Sábado/Domingo: salto
      // Lunes 3 Ago: 9h → terminado a las 17:00
      expect(fabResult.getMonth()).toBe(7); // Agosto (el TimeEngine NO bloquea agosto)
      expect(fabResult.getDate()).toBe(3);
    });
  });
});
