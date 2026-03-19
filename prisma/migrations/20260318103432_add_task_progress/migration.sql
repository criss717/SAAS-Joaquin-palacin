-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "stage" SET DEFAULT 'Planeación';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0;
