-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "estimatedHours" DOUBLE PRECISION DEFAULT 8;

-- CreateTable
CREATE TABLE "MachineCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogPart" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "parentId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CatalogPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogOperation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "estimatedHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CatalogOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "workingDays" TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
    "shifts" TEXT NOT NULL DEFAULT '[{"start": "08:00", "end": "14:00"}, {"start": "16:00", "end": "18:00"}]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CatalogPart" ADD CONSTRAINT "CatalogPart_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "MachineCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPart" ADD CONSTRAINT "CatalogPart_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogOperation" ADD CONSTRAINT "CatalogOperation_partId_fkey" FOREIGN KEY ("partId") REFERENCES "CatalogPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
