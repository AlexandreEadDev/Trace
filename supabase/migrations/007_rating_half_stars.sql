-- Allow half-star ratings (0.5, 1.0, 1.5, … 5.0)
ALTER TABLE reviews
  ALTER COLUMN rating TYPE NUMERIC(3,1) USING rating::NUMERIC(3,1);

ALTER TABLE reviews
  DROP CONSTRAINT IF EXISTS reviews_rating_check;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_check
  CHECK (rating >= 0.5 AND rating <= 5 AND (rating * 2) = FLOOR(rating * 2));
