-- Bloom Special Flowers migration
ALTER TABLE flowers ADD COLUMN IF NOT EXISTS is_special BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE flowers ADD COLUMN IF NOT EXISTS shop_price INTEGER;

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
