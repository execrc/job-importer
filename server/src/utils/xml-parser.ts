import { XMLParser } from 'fast-xml-parser';

export interface ParsedJob {
  externalId: string;
  title: string;
  company: string;
  location: string;
  jobType: string;
  description: string;
  content: string;
  link: string;
  imageUrl?: string;
  publishedAt: Date;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '_text',
});

// parse RSS/XML feed into job objects
export function parseXmlToJobs(xmlText: string): ParsedJob[] {
  const parsed = parser.parse(xmlText);
  const channel = parsed?.rss?.channel;

  if (!channel) {
    throw new Error('Invalid XML: missing rss/channel structure');
  }

  const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];

  return items.map((item: any) => {
    // try multiple sources for ID
    const externalId = item.id || item.guid?.['_text'] || item.guid || item.link;

    // jobicy-specific namespaced fields
    const location = item['job_listing:location'] || '';
    const jobType = item['job_listing:job_type'] || '';
    const company = item['job_listing:company'] || '';
    const imageUrl = item['media:content']?.['@_url'] || undefined;

    return {
      externalId: String(externalId),
      title: item.title || '',
      company,
      location,
      jobType,
      description: item.description || '',
      content: item['content:encoded'] || item.description || '',
      link: item.link || '',
      imageUrl,
      publishedAt: new Date(item.pubDate || Date.now()),
    };
  });
}
