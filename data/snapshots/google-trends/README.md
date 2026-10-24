# Google Trends snapshots

Google blocks automated requests to Trends, so these are downloaded by hand and imported by the
`google_trends` connector (`lib/sources/google-trends.ts`).

For each keyword in `data/curation/keywords.csv`:
1. Open `https://trends.google.com/trends/explore?geo=US&date=today%203-m&q=<keyword>`
   (region and time range as in keywords.csv; past 3 months is the default).
2. On the "Interest over time" chart, click the download (↓) button.
3. Save the CSV here. Any file name works; one keyword per file keeps values comparable.

Then open the app's Sources page and click "Run now".
