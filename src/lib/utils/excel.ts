import { TaskWithRelations } from "@/lib/actions/tasks";
import Swal from "sweetalert2";

/** Genera y descarga un archivo Excel con el resumen de materiales proporcionado */
export async function downloadMaterialReport(summary: any[], title: string) {
  try {
    const exceljs = await import("exceljs");
    const workbook = new exceljs.Workbook();
    const sheet = workbook.addWorksheet("Materiales");

    // Estilos de cabecera
    sheet.getRow(1).font = { bold: true, size: 12 };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E7FF' } // Light blue
    };

    sheet.columns = [
      { header: "Material", key: "name", width: 30 },
      { header: "Cantidad Total", key: "totalQty", width: 20 },
      { header: "Unidad", key: "unit", width: 15 },
    ];

    summary.forEach(m => {
      sheet.addRow({
        name: m.name,
        totalQty: Number(m.totalQty.toFixed(2)),
        unit: m.unit
      });
    });

    // Añadir detalle de piezas
    sheet.addRow([]);
    const detailRow = sheet.addRow(["DETALLE POR PIEZA"]);
    detailRow.font = { bold: true };
    
    sheet.addRow(["Material", "Pieza", "Cant x Und", "Und Piezas", "Total"]);
    
    summary.forEach(m => {
      m.parts.forEach((p: any) => {
        sheet.addRow([
          m.name,
          p.name,
          p.qtyPerUnit,
          p.pieceQty,
          p.total
        ]);
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error al exportar materiales:", error);
    Swal.fire("Error", "No se pudo generar el Excel de materiales.", "error");
  }
}
