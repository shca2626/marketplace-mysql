-- CreateIndex
CREATE INDEX `Product_status_createdAt_idx` ON `Product`(`status`, `createdAt`);

-- CreateIndex
CREATE INDEX `Product_status_price_idx` ON `Product`(`status`, `price`);
