# Plan: Pedidos Externos — Días Naturales + UI "Semanas Entrega"

## Resumen
- Cambiar el cálculo de fechas de pedidos externos de días laborables (Lun-Vie) a días naturales (Lun-Dom), saltando todo agosto
- Si la fecha final cae en Sáb/Dom → mover al Lunes siguiente
- Corregir el bug de horas: pedidos externos deben tener `estimatedHours = 0` y `unitEstimatedHours = 0`
- UI dual en TaskDetailModal: "Semanas Entrega" para pedidos externos, "Horas Totales" para el resto

---

## Archivos a modificar (5)

### 1. `src/lib/external-calendar.ts` — Añadir `addCalendarDays`

```typescript
/**
 * Avanza N días NATURALES desde una fecha, saltando TODO agosto.
 * Si la fecha final cae en Sábado o Domingo (o en agosto), se mueve al siguiente Lunes hábil.
 */
export function addCalendarDays(startDate: Date, days: number): Date {
  if (days <= 0) return new Date(startDate);

  let added = 0;
  const current = new Date(startDate);

  while (added < days) {
    current.setDate(current.getDate() + 1);
    if (current.getMonth() !== 7) { // saltar agosto
      added++;
    }
  }

  // Normalizar Sáb(6) / Dom(0) → Lunes, saltando agosto si hace falta
  while (current.getDay() === 0 || current.getDay() === 6 || current.getMonth() === 7) {
    current.setDate(current.getDate() + 1);
  }

  current.setHours(17, 0, 0, 0);
  return current;
}
```

Mantener `addExternalDays` (deprecado, por si algo más lo usa).

---

### 2. `src/lib/actions/catalog.ts` — `launchMachineToProject` / `clonePart`

**Línea 308** (finalEstimatedHours):
```
Antes: let finalEstimatedHours = (unitEstimatedHours || 8) * totalQuantity;
Después: let finalEstimatedHours = (isExternal ? 0 : (unitEstimatedHours || 8)) * totalQuantity;
```

**Línea 314-318** (cálculo fechas):
```
Antes:
  if (isExternal && (part.deliveryDays || 0) > 0) {
    taskEndDate = addExternalDays(projectStartDate, part.deliveryDays!);
    finalEstimatedHours = engine.calculateBusinessHours(projectStartDate, taskEndDate);
  }

Después:
  if (isExternal && (part.deliveryDays || 0) > 0) {
    taskEndDate = addCalendarDays(projectStartDate, part.deliveryDays!);
    // NO recalcular horas con el engine → quedan en 0
  }
```

**Línea 336** (unitEstimatedHours):
```
Antes: unitEstimatedHours: unitEstimatedHours || 8,
Después: unitEstimatedHours: isExternal ? 0 : (unitEstimatedHours || 8),
```

**Import**: Añadir `addCalendarDays` al import de `external-calendar`.

---

### 3. `src/lib/actions/tasks.ts` — Cascade `updateTaskDatesAndCascade`

**Líneas 358-360**:
```
Antes:
  const newEnd = isExternal
    ? addExternalDays(new Date(newStart), currentTask.deliveryDays!)
    : engine.addBusinessHours(new Date(newStart), hours)

Después:
  const newEnd = isExternal
    ? addCalendarDays(new Date(newStart), currentTask.deliveryDays!)
    : engine.addBusinessHours(new Date(newStart), hours)
```

**Añadir al final** nueva acción:
```typescript
export async function updateTaskDeliveryDays(taskId: string, deliveryDays: number) {
  await requireAuth();
  await prisma.task.update({ where: { id: taskId }, data: { deliveryDays } });
  revalidatePath("/gantt");
  revalidatePath("/kanban");
}
```

**Import**: Añadir `addCalendarDays` al import de `external-calendar`.

---

### 4. `src/components/kanban/TaskDetailModal.tsx` — UI dual

**Nuevo estado**:
```typescript
const isExternal = task?.deliveryDays ? true : false;
const [localDeliveryDays, setLocalDeliveryDays] = useState(task?.deliveryDays ?? 0);
```

**Reemplazar la sección "Horas Totales"** con lógica condicional:

Si `isExternal`:
- Label: **"Semanas Entrega"**
- Input: `localDeliveryDays / 7` (entero)
- Texto ayuda: `({localDeliveryDays} días naturales)`
- Al cambiar → `setLocalDeliveryDays(val * 7)`

Si NO es externo:
- Comportamiento actual (Horas Totales, unitHours, etc.)

**handleSave**:  
Si `localDeliveryDays !== task.deliveryDays` → `await updateTaskDeliveryDays(task.id, localDeliveryDays)`

**handleStatusChange**:  
Si el usuario cambia la etapa a "Pedido Externo" → mostrar semanas.  
Si cambia a otra etapa → volver a horas.

---

### 5. Compilación

Ejecutar `npx tsc --noEmit` para verificar.
