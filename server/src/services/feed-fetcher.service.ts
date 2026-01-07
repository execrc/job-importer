import { parseXmlToJobs, ParsedJob, sleep } from '../utils/index.js';

const MAX_RETRIES = 3;

export async function fetchFeed(url: string): Promise<ParsedJob[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`📥 Fetching feed: ${url} (attempt ${attempt}/${MAX_RETRIES})`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'JobImporter/1.0',
          Accept: 'application/xml, application/rss+xml, text/xml',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      const jobs = parseXmlToJobs(xmlText);

      console.log(`✅ Fetched ${jobs.length} jobs from feed`);
      return jobs;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`⚠️ Fetch attempt ${attempt} failed: ${lastError.message}`);

      // exponential backoff: 1s, 2s, 4s
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Failed to fetch feed');
}
