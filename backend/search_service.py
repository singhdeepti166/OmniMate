import logging
import re
import httpx

logger = logging.getLogger(__name__)


def _clean_text(text: str) -> str:
    text = re.sub(r"<.*?>", "", text or "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _search_duckduckgo_api(query: str, max_results: int = 5) -> list[dict]:
    results = []
    try:
        response = httpx.get(
            "https://api.duckduckgo.com/",
            params={
                "q": query,
                "format": "json",
                "no_html": 1,
                "skip_disambig": 1,
            },
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
        )
        data = response.json()

        if data.get("AbstractText"):
            results.append({
                "title": data.get("Heading") or query,
                "snippet": data.get("AbstractText"),
                "url": data.get("AbstractURL") or "",
            })

        for topic in data.get("RelatedTopics") or []:
            if len(results) >= max_results:
                break
            if isinstance(topic, dict) and topic.get("Text"):
                results.append({
                    "title": topic.get("Text", "")[:100],
                    "snippet": topic.get("Text", ""),
                    "url": topic.get("FirstURL") or "",
                })
            elif isinstance(topic, dict) and topic.get("Topics"):
                for sub in topic.get("Topics") or []:
                    if len(results) >= max_results:
                        break
                    if sub.get("Text"):
                        results.append({
                            "title": sub.get("Text", "")[:100],
                            "snippet": sub.get("Text", ""),
                            "url": sub.get("FirstURL") or "",
                        })
    except Exception:
        logger.exception("DuckDuckGo API failed.")
    return results


def _search_wikipedia(query: str) -> list[dict]:
    results = []
    try:
        response = httpx.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "list": "search",
                "srsearch": query,
                "utf8": 1,
                "format": "json",
                "srlimit": 3,
            },
            headers={"User-Agent": "AI-Assistant-Student-Project/1.0"},
            timeout=15,
        )
        data = response.json()
        for item in data.get("query", {}).get("search", []):
            title = item.get("title") or ""
            snippet = _clean_text(item.get("snippet") or "")
            results.append({
                "title": title,
                "snippet": snippet,
                "url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}" if title else "",
            })
    except Exception:
        logger.exception("Wikipedia search failed.")
    return results


def _search_duckduckgo_html(query: str, max_results: int = 5) -> list[dict]:
    results = []
    try:
        response = httpx.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=15,
            follow_redirects=True,
        )
        html = response.text
        titles = re.findall(r'class="result__a"[^>]*>(.*?)</a>', html, flags=re.I | re.S)
        snippets = re.findall(
            r'class="result__snippet"[^>]*>(.*?)</(?:a|td|div)>',
            html,
            flags=re.I | re.S,
        )
        links = re.findall(r'class="result__a"[^>]*href="([^"]+)"', html, flags=re.I)

        for i in range(min(len(titles), max_results)):
            results.append({
                "title": _clean_text(titles[i]) if i < len(titles) else query,
                "snippet": _clean_text(snippets[i]) if i < len(snippets) else "",
                "url": links[i] if i < len(links) else "",
            })
    except Exception:
        logger.exception("DuckDuckGo HTML failed.")
    return results


def _search_google_news(query: str, max_results: int = 5) -> list[dict]:
    results = []
    try:
        response = httpx.get(
            "https://news.google.com/rss/search",
            params={
                "q": query,
                "hl": "en-IN",
                "gl": "IN",
                "ceid": "IN:en",
            },
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
        )
        xml = response.text

        items = re.findall(r"<item>(.*?)</item>", xml, flags=re.I | re.S)
        for item in items[:max_results]:
            title_match = re.search(r"<title>(.*?)</title>", item, flags=re.I | re.S)
            link_match = re.search(r"<link>(.*?)</link>", item, flags=re.I | re.S)
            desc_match = re.search(
                r"<description>(.*?)</description>", item, flags=re.I | re.S
            )

            title = _clean_text(title_match.group(1) if title_match else "")
            link = _clean_text(link_match.group(1) if link_match else "")
            desc = _clean_text(desc_match.group(1) if desc_match else "")

            if title:
                results.append({
                    "title": title,
                    "snippet": desc or title,
                    "url": link,
                })
    except Exception:
        logger.exception("Google News RSS failed.")
    return results


def web_search(query: str, max_results: int = 5) -> list[dict]:
    query = (query or "").strip()
    if not query:
        return []

    results = []
    lower_q = query.lower()

    is_news_query = any(
        word in lower_q
        for word in ["news", "latest", "today", "current", "breaking", "headline"]
    )

    if is_news_query:
        results.extend(_search_google_news(query, max_results=max_results))

    if len(results) < 2:
        results.extend(_search_duckduckgo_api(query, max_results=max_results))

    if len(results) < 2:
        results.extend(_search_wikipedia(query))

    if len(results) < 2:
        results.extend(_search_duckduckgo_html(query, max_results=max_results))

    unique = []
    seen = set()
    for item in results:
        key = (item.get("title") or "").lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(item)

    return unique[:max_results]


def format_search_context(query: str, results: list[dict]) -> str:
    if not results:
        return (
            f'No reliable web results found for: "{query}". '
            "Answer carefully using general knowledge and mention uncertainty if needed."
        )

    lines = [
        f'Web search results for: "{query}"',
        "Use these results as primary context.",
        "If sources conflict, mention that.",
        "Cite useful links when possible.",
        "",
    ]

    for i, r in enumerate(results, start=1):
        lines.append(f"{i}. {r.get('title') or 'Result'}")
        if r.get("snippet"):
            lines.append(f"   {r['snippet']}")
        if r.get("url"):
            lines.append(f"   Source: {r['url']}")
        lines.append("")

    return "\n".join(lines)