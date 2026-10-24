-- More free trend sources: Wikipedia readership and six open museum collections (all official,
-- keyless or public-demo-key APIs; checked 2026-10-24). Cooper Hewitt's own API is gone; its
-- collection now arrives through the Smithsonian connector.
insert into sources (key, name, enabled, licensed, terms_url, terms_notes) values
  ('wikipedia_pageviews', 'Wikipedia readership', true, false, 'https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews', 'Official Wikimedia pageview API, no key; public-domain counts. Hand-mapped fashion articles only'),
  ('vam_museum', 'V&A collections', true, false, 'https://developers.vam.ac.uk/guide/v2/welcome.html', 'Official V&A API, no key; reuse with credit; images linked, not copied'),
  ('art_institute_chicago', 'Art Institute of Chicago', true, false, 'https://www.artic.edu/open-access/public-api', 'Official API, no key; CC0 records; public-domain textiles only'),
  ('cleveland_museum', 'Cleveland Museum of Art', true, false, 'https://openaccess-api.clevelandart.org/', 'Official Open Access API, no key; CC0 textiles only'),
  ('europeana', 'Europeana', true, false, 'https://pro.europeana.eu/page/terms-of-use', 'Official Search API with the public demo key; openly reusable records only'),
  ('smithsonian', 'Smithsonian (incl. Cooper Hewitt)', true, false, 'https://www.si.edu/openaccess', 'Official Open Access API with api.data.gov DEMO_KEY (low hourly limit); CC0 records')
on conflict (key) do nothing;

update sources set enabled = true, terms_notes = 'Official API (v1.1 search), no key; public-domain Costume Institute objects only'
where key = 'met_museum';

update sources set enabled = false, terms_notes = 'Own API retired (checked 2026-10-24); collection now comes through the Smithsonian source'
where key = 'cooper_hewitt';
