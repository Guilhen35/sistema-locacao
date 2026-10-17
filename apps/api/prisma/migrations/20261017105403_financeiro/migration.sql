-- CreateEnum
CREATE TYPE "entry_kind" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" UUID NOT NULL,
    "kind" "entry_kind" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "supplier" VARCHAR(200),
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "payment_method",
    "paid_at" DATE,
    "contract_id" UUID,
    "installment_number" INTEGER,
    "installment_count" INTEGER,
    "maintenance_id" UUID,
    "notes" VARCHAR(1000),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_maintenance_id_key" ON "financial_entries"("maintenance_id");

-- CreateIndex
CREATE INDEX "financial_entries_kind_due_date_idx" ON "financial_entries"("kind", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_contract_id_installment_number_key" ON "financial_entries"("contract_id", "installment_number");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "maintenances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_amount_positive" CHECK (amount > 0);
