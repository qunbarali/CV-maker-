export interface KeywordResult { word: string; found: boolean; frequency: number; kind: 'phrase' | 'term' }
const STOPWORDS = new Set('the and for with from you our are will this that have has your not all can who what job role about work years ability team into their they them then than also using use used such when where which while been being'.split(' '));
const SYNONYMS: Record<string, string[]> = {
  javascript: ['js'], typescript: ['ts'], 'user experience': ['ux'], 'user interface': ['ui'], 'project management': ['project manager'],
  'customer service': ['customer support'], 'data analysis': ['analytics'], 'search engine optimization': ['seo'], 'continuous integration': ['ci'], 'continuous delivery': ['cd']
};
function tokens(text: string) { return (text.toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}/g) ?? []).map(t => t.replace(/[.-]+$/g, '')).filter(t => t.length >= 3 && !STOPWORDS.has(t)); }
export function analyzeJobKeywords(jobDescription: string, resumeText: string): KeywordResult[] {
  const job = jobDescription.toLowerCase();
  const resume = resumeText.toLowerCase();
  if (!job.trim()) return [];
  const words = tokens(job);
  const frequencies = new Map<string, number>();
  for (const word of words) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const phrases = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (phrase.length > 7) phrases.add(phrase);
  }
  const results: KeywordResult[] = [];
  for (const [word, frequency] of frequencies) {
    const aliases = SYNONYMS[word] ?? [];
    results.push({ word, frequency, found: resume.includes(word) || aliases.some(alias => resume.includes(alias)), kind: 'term' });
  }
  for (const phrase of phrases) {
    if (results.some(r => r.word === phrase)) continue;
    const aliases = SYNONYMS[phrase] ?? [];
    results.push({ word: phrase, frequency: 1, found: resume.includes(phrase) || aliases.some(alias => resume.includes(alias)), kind: 'phrase' });
  }
  return results.sort((a, b) => Number(a.found) - Number(b.found) || b.frequency - a.frequency || a.word.localeCompare(b.word)).slice(0, 30);
}
