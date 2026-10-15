-- CreateEnum
CREATE TYPE "client_type" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "type" "client_type" NOT NULL,
    "document" VARCHAR(14) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "trade_name" VARCHAR(200),
    "contact_name" VARCHAR(200),
    "contact_document" VARCHAR(11),
    "phone" VARCHAR(20),
    "whatsapp" VARCHAR(20) NOT NULL,
    "email" VARCHAR(254),
    "zip_code" VARCHAR(8),
    "street" VARCHAR(200),
    "number" VARCHAR(20),
    "district" VARCHAR(100),
    "city" VARCHAR(100),
    "state" CHAR(2),
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_document_key" ON "clients"("document");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "clients_city_idx" ON "clients"("city");
