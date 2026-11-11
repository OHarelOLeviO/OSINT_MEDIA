# The Dispatch

A static, UTC-based public-source briefing built with Astro and TypeScript.

## Preview

Install Node.js 22.19 or newer, then run:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Astro. Development serves a visibly labeled fictional sample. To preview current feed data, run `npm run refresh`, `npm run build`, and `npm run preview`. Build and preview with the same `BASE_PATH` if testing a repository subpath. Production uses only `data/live.json` unless you explicitly build with `PUBLIC_SAMPLE=1`.

## Deploy to GitHub Pages

1. Create a GitHub repository. Put the contents of this project at its root, including the hidden `.github` directory, and push to the default branch. Exclude `node_modules`, `dist`, and `.env`.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. In **Actions → Refresh and publish**, click **Run workflow** and select the default branch. Open the deployment URL shown in the deploy job.
4. The workflow runs every six hours at minute 17 UTC. GitHub may delay scheduled runs. The topic rail shows the last run with at least one successful feed.

The workflow derives the base path from the repository name. A repository named `OWNER.github.io` uses the root path. A different name uses `/REPOSITORY/`. Set `BASE_PATH` in your shell to override this locally. The example environment file documents the optional setting.

## Sources and editorial policy

Edit `config/topics.json` and `config/sources.json`. The six launch topics are enabled. To add a topic, enable it and add its RSS or Atom source. The Sources page lists the exact endpoints. BBC News World, Politics, Business, Technology, BBC Sport, GovInfo Congressional Bills, SEC press releases and NASA news releases each returned parseable, dated entries during the local refresh.

All starter feeds are public and require zero keys. Each source gets one request per run and at most one retry after transient failure. HTTP 403 and 429 stop attempts for that source. No contractual quota is assumed. BBC feeds are configured for personal, noncommercial use with publisher credit and links. Business use requires permission. Review [BBC RSS terms](https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_31March2022english.pdf), [GovInfo feeds](https://www.govinfo.gov/feeds), [SEC developer guidance](https://www.sec.gov/about/developer-resources), and [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) before changing your use. Feed headlines, short excerpts and publication times are attributed. Third-party photos and full articles are excluded. Sports and finance launch with reporting feeds. Dedicated score and quote providers, event timestamps and provider delays depend on future integrations.

The five leads are selected by recency with topic diversity. The baseline deliberately uses attributed source excerpts and labels headline-only coverage. Exact canonical URLs and matching normalized headlines within 72 hours are merged. Different headlines can describe the same event and remain separate. Cross-source links are retained. Event time displays when supplied explicitly. Publication time comes from the feed. There is no AI integration or API key. Store future provider credentials only in GitHub Actions secrets.

## Archive and recovery

`data/live.json` is the durable archive and refresh ledger. Refreshes write a temporary sibling before replacing it. The workflow builds before committing the ledger to the default branch, then deploys the static artifact. An interrupted run before the commit leaves the prior archive available. A run interrupted after the commit can be rerun from that persisted state. The current UTC edition can change during the day. Older edition IDs persist. Source errors keep previously collected entries and retain the last successful source timestamp.

If the workflow fails to push, check write permissions for GitHub Actions and branch protection. After a concurrent branch edit, rerun from the latest default branch. If a feed fails, check its URL, response format and access terms. If Pages renders without styling or routes return 404, confirm the repository base path and Pages source. If Actions shows an empty edition, check feed counts in the refresh job.

### Coverage editions

Every enabled topic supports Global and Israel filters. Global is general coverage and may include Israel. Israel uses selected publisher feeds and headline matching for local relevance. This can miss stories that use unfamiliar names or describe their Israel connection only in the article. Headlines retain the original language. Added sources publish headlines, publisher credit, publication times and links only. They require no keys. Configure them in `config/sources.json` with an `edition`, and optionally `headlineMatch` and `localMatch`. Israel space coverage uses a filtered Hayadan search feed and may be sparse.

### Social sources and Hebrew coverage

YouTube (NASA and BBC News), Bluesky (The Verge) and Mastodon (ESA) use public feeds. Add further known public feed URLs in config/sources.json. Feed metadata does not establish what a video says, so the YouTube cards show the published title and link to the video. Other cards show the first sentence of an available excerpt and the briefing shows the full stored excerpt.

The Israel edition displays Hebrew headlines and right-to-left briefings. English-language Israeli sources remain available in All coverage, Search and the archive. This is source-language selection. There is no automatic translation.

Automated Instagram, TikTok and X ingestion is not configured. Start with the public handles or individual post links you want to follow. Any required developer credentials belong in GitHub Actions secrets.

Cards consolidate matching or very similar headlines within the same topic and retain links to the contributing reports. Different headlines can still describe the same event and remain separate. YouTube thumbnails use the image supplied by the channel feed.

### Hebrew translation

The combined feed shows native Hebrew stories and cached Hebrew translations. To automatically translate more headlines and excerpts, enable Google Cloud Translation Basic and add GOOGLE_TRANSLATE_API_KEY as a GitHub Actions repository secret. For local refresh, export the same variable in your shell. Each run translates up to 120 uncached strings, newest first. If the service is unavailable, the refresh retains prior translations and publishes native Hebrew stories. Original links can lead to other languages.
