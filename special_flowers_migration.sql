-- Bloom Special Flowers migration
ALTER TABLE flowers ADD COLUMN IF NOT EXISTS is_special BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE flowers ADD COLUMN IF NOT EXISTS shop_price INTEGER;
ALTER TABLE flowers ADD COLUMN IF NOT EXISTS is_full_bouquet BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO flowers (name, emoji, rarity, sell_value, is_special, shop_price) VALUES
('Moonlit Lotus','🪷','legendary',180,TRUE,5000),
('Crystal Rose','🌹','legendary',220,TRUE,7500),
('Aurora Bloom','🌸','legendary',300,TRUE,12000),
('Eternal Golden Rose','🌹','legendary',500,TRUE,25000)
ON CONFLICT (name) DO UPDATE SET
  emoji = EXCLUDED.emoji,
  rarity = EXCLUDED.rarity,
  sell_value = EXCLUDED.sell_value,
  is_special = EXCLUDED.is_special,
  shop_price = EXCLUDED.shop_price;


-- Celestial Bloom: one flower visually becomes a full bouquet when gifted.
INSERT INTO flowers (name, emoji, rarity, sell_value, is_special, shop_price, is_full_bouquet) VALUES
('Celestial Bloom','🌌','legendary',1000,TRUE,50000,TRUE)
ON CONFLICT (name) DO UPDATE SET
  emoji = EXCLUDED.emoji,
  rarity = EXCLUDED.rarity,
  sell_value = EXCLUDED.sell_value,
  is_special = EXCLUDED.is_special,
  shop_price = EXCLUDED.shop_price,
  is_full_bouquet = EXCLUDED.is_full_bouquet;
