-- Allow authenticated users to update catalog items (required for genre refresh / upsert)
CREATE POLICY "Authenticated users can update items"
  ON items FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
