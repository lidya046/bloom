-- Add the expanded reaction set to existing Bloom databases.
ALTER TABLE bouquet_interactions
  DROP CONSTRAINT IF EXISTS bouquet_interactions_reaction_check;

ALTER TABLE bouquet_interactions
  ADD CONSTRAINT bouquet_interactions_reaction_check
  CHECK (reaction IS NULL OR reaction IN ('❤️','😍','🌸','🥹','😂','✨','😢','😭','😔','🤢','😒'));
