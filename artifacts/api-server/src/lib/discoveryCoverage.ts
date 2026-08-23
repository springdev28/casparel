/**
 * @fileOverview Backend domain role: centralizes Discovery Coverage logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
/**
 * Coverage rules shared by every AI content-discovery pass.
 *
 * Named platforms are examples, not an allow-list. The final instruction is
 * deliberately open-ended so regional, federated and newly indexed networks
 * are eligible without requiring a code change for every domain.
 */
export function discoveryCoverageInstructions(page: number) {
  const depthRule =
    page > 1
      ? "This is a long-tail page: avoid repeating the obvious domains and find additional niche, local, specialist, community, creator and archival matches."
      : "Cover every applicable lane before choosing the final set; do not stop after finding mainstream platforms.";

  return `${depthRule}
Run multiple targeted web searches across all applicable lanes:
1. Academic and official: universities, schools, libraries, museums, government agencies, journals, repositories and faculty course pages.
2. Open education: OER repositories, open textbooks, public courseware, lesson banks and reusable teaching collections.
3. Learning documents: class and lecture notes, study guides, worksheets, problem sets, worked examples, practice exams, answer keys, slides, handouts, lab manuals and public PDFs or documents.
4. Public social and community knowledge: relevant public posts, threads, pages, channels, profiles and attachments across Reddit, YouTube, TikTok, Instagram, X/Twitter, Facebook, LinkedIn, Bluesky, Mastodon and the wider Fediverse, Threads, Tumblr, Pinterest, Twitch, public Telegram or Discord surfaces, specialist forums, Q&A sites, study groups, educator communities, and any other publicly indexed social or community platform.
5. Archives and libraries: Internet Archive, national and university libraries, historical collections, public-domain works and cached institutional collections.
6. Independent educators and media: educator websites, video and streaming platforms, podcasts, newsletters, blogs, tutorials, creator storefronts and small specialist publishers.
7. Practical resources: GitHub or GitLab repositories, notebooks, simulations, datasets, calculators, interactive labs and educational software.
8. Books and research: textbooks, monographs, papers, preprints, theses, reports and reference works.
Use exact phrases, filetype:pdf, platform-specific site: searches, site:github.com, site:archive.org and relevant academic or government domains where useful. Do not treat the named platforms as a closed list: search other indexed networks and regional platforms when relevant to the query and requested language. A social or community result is eligible when its direct page is public without joining a private group, lawful, directly relevant and safe. Exclude private or login-only posts, leaked exams, pirated copies, unsafe downloads, link farms, SEO spam, generic search pages and pages whose real content does not match the title.`;
}

export function filterDiscoveryLanguage<
  T extends { language?: string | null },
>(items: T[], language: string): T[] {
  if (language === "any") return items;
  return items.filter(
    (item) => item.language === language || item.language === "multilingual",
  );
}
