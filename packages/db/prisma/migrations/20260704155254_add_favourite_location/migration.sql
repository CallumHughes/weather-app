-- CreateTable
CREATE TABLE "favourite_location" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourite_location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favourite_location_userId_sortOrder_createdAt_idx" ON "favourite_location"("userId", "sortOrder", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "favourite_location_userId_lat_lon_key" ON "favourite_location"("userId", "lat", "lon");

-- AddForeignKey
ALTER TABLE "favourite_location" ADD CONSTRAINT "favourite_location_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
