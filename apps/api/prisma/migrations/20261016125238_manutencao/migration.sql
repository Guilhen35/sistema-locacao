-- CreateEnum
CREATE TYPE "maintenance_kind" AS ENUM ('PREVENTIVE', 'CORRECTIVE');

-- CreateEnum
CREATE TYPE "maintenance_status" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "maintenances" (
    "id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "kind" "maintenance_kind" NOT NULL,
    "status" "maintenance_status" NOT NULL DEFAULT 'OPEN',
    "date" DATE NOT NULL,
    "hour_meter" INTEGER,
    "description" VARCHAR(2000) NOT NULL,
    "blocks_machine" BOOLEAN NOT NULL DEFAULT true,
    "supplier" VARCHAR(200),
    "payment_method" "payment_method",
    "due_date" DATE,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "send_to_finance" BOOLEAN NOT NULL DEFAULT true,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_items" (
    "id" UUID NOT NULL,
    "maintenance_id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "maintenance_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenances_machine_id_date_idx" ON "maintenances"("machine_id", "date");

-- CreateIndex
CREATE INDEX "maintenances_status_idx" ON "maintenances"("status");

-- AddForeignKey
ALTER TABLE "maintenances" ADD CONSTRAINT "maintenances_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "maintenances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
