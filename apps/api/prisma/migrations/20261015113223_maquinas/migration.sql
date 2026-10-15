-- CreateEnum
CREATE TYPE "machine_category" AS ENUM ('SCISSOR', 'ARTICULATED', 'TELESCOPIC', 'MAST', 'OTHER');

-- CreateEnum
CREATE TYPE "power_source" AS ENUM ('ELECTRIC', 'DIESEL', 'HYBRID', 'GAS');

-- CreateTable
CREATE TABLE "machine_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" "machine_category" NOT NULL,
    "power_source" "power_source" NOT NULL,
    "working_height_m" DECIMAL(5,2) NOT NULL,
    "capacity_kg" INTEGER NOT NULL,
    "usage" VARCHAR(200),
    "daily_price" DECIMAL(10,2) NOT NULL,
    "weekly_price" DECIMAL(10,2),
    "monthly_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "machine_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "type_id" UUID NOT NULL,
    "manufacturer" VARCHAR(100),
    "model" VARCHAR(100),
    "year" INTEGER,
    "serial_number" VARCHAR(100),
    "asset_tag" VARCHAR(50),
    "hour_meter" INTEGER,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" VARCHAR(300),
    "show_on_website" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_photos" (
    "id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "storage_key" VARCHAR(100) NOT NULL,
    "position" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machine_types_name_key" ON "machine_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "machines_code_key" ON "machines"("code");

-- CreateIndex
CREATE INDEX "machines_type_id_idx" ON "machines"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "machine_photos_storage_key_key" ON "machine_photos"("storage_key");

-- CreateIndex
CREATE INDEX "machine_photos_machine_id_position_idx" ON "machine_photos"("machine_id", "position");

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "machine_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_photos" ADD CONSTRAINT "machine_photos_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
