export interface SearchResultItem {
  id: string;
  name: string;
  color?: string;
  meta: string;
  type: 'industry' | 'subdomain' | 'company';
  industryId?: string;
  subdomainId?: string;
  companyId?: string;
}

class TrieNode {
  children = new Map<string, TrieNode>();
  exactItems: SearchResultItem[] = [];
  prefixItems: SearchResultItem[] = [];
  containsItems: SearchResultItem[] = [];
}

export class SearchTrie {
  root = new TrieNode();

  insert(name: string, item: SearchResultItem) {
    if (!name) return;
    const lower = name.toLowerCase();

    // 1. Exact match
    let node = this.root;
    for (let i = 0; i < lower.length; i++) {
      const char = lower[i];
      let child = node.children.get(char);
      if (!child) {
        child = new TrieNode();
        node.children.set(char, child);
      }
      node = child;
    }
    node.exactItems.push(item);

    // 2. Prefix match
    node = this.root;
    for (let i = 0; i < lower.length; i++) {
      const char = lower[i];
      let child = node.children.get(char);
      if (!child) {
        child = new TrieNode();
        node.children.set(char, child);
      }
      node = child;
      node.prefixItems.push(item);
    }

    // 3. Contains match (Suffixes)
    for (let i = 1; i < lower.length; i++) {
      let suffixNode = this.root;
      for (let j = i; j < lower.length; j++) {
        const char = lower[j];
        let child = suffixNode.children.get(char);
        if (!child) {
          child = new TrieNode();
          suffixNode.children.set(char, child);
        }
        suffixNode = child;
        suffixNode.containsItems.push(item);
      }
    }
  }

  search(query: string, limit: number = 50): (SearchResultItem & { score: number })[] {
    if (!query) return [];
    const lower = query.toLowerCase();

    let node = this.root;
    for (let i = 0; i < lower.length; i++) {
      const char = lower[i];
      const child = node.children.get(char);
      if (!child) return [];
      node = child;
    }

    const resultsMap = new Map<SearchResultItem, number>();

    // Priority 3: Exact matches
    for (const item of node.exactItems) {
      if (item.name.toLowerCase() === lower) {
        resultsMap.set(item, 3);
      }
    }

    // Priority 2: Prefix matches
    for (const item of node.prefixItems) {
      if (!resultsMap.has(item)) {
        resultsMap.set(item, 2);
      }
    }

    // Priority 1: Contains matches
    for (const item of node.containsItems) {
      if (!resultsMap.has(item)) {
        resultsMap.set(item, 1);
      }
    }

    const results = Array.from(resultsMap.entries()).map(([item, score]) => ({
      ...item,
      score,
    }));

    // Sort descending by score, then alphabetically
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });

    return results.slice(0, limit);
  }
}
