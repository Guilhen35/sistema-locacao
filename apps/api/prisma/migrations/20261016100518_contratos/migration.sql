-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('DRAFT', 'ACTIVE', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('PIX', 'BOLETO', 'CARD', 'CASH', 'TRANSFER');

-- CreateEnum
CREATE TYPE "signature_status" AS ENUM ('PENDING', 'DIGITAL', 'SCANNED');

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "client_id" UUID NOT NULL,
    "status" "contract_status" NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "site_name" VARCHAR(200),
    "site_zip_code" VARCHAR(8),
    "site_street" VARCHAR(200),
    "site_number" VARCHAR(20),
    "site_district" VARCHAR(100),
    "site_city" VARCHAR(100),
    "site_state" CHAR(2),
    "payment_method" "payment_method" NOT NULL DEFAULT 'PIX',
    "installments" INTEGER NOT NULL DEFAULT 1,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(2000),
    "signature_status" "signature_status" NOT NULL DEFAULT 'PENDING',
    "activated_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_items" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "daily_rate" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reserved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contract_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");

-- CreateIndex
CREATE INDEX "contracts_client_id_idx" ON "contracts"("client_id");

-- CreateIndex
CREATE INDEX "contracts_status_start_date_idx" ON "contracts"("status", "start_date");

-- CreateIndex
CREATE INDEX "contract_items_machine_id_start_date_idx" ON "contract_items"("machine_id", "start_date");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Período válido: o fim vem depois do início
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_period_check" CHECK ("end_date" > "start_date");
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_period_check" CHECK ("end_date" > "start_date");

-- Trava de agenda: a mesma máquina não pode ter dois itens reservados com datas que se cruzam.
-- O fim é exclusivo: devolve dia 15 de manhã, pode sair para outro cliente no dia 15.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "contract_items"
  ADD CONSTRAINT "contract_items_no_overlap"
  EXCLUDE USING gist ("machine_id" WITH =, daterange("start_date", "end_date", '[)') WITH &&)
  WHERE ("reserved");
