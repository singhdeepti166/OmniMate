import logging
import httpx
from urllib.parse import quote

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "AI-Assistant-Student-Project/1.0"
}


def geocode_place(place: str):
    place = (place or "").strip()
    if not place:
        return None

    try:
        response = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": place,
                "format": "json",
                "limit": 1,
            },
            headers=HEADERS,
            timeout=15,
        )
        data = response.json()
        if not data:
            return None

        item = data[0]
        return {
            "name": item.get("display_name", place),
            "lat": item.get("lat"),
            "lon": item.get("lon"),
        }
    except Exception:
        logger.exception("Geocode failed.")
        return None


def nearby_places(place: str, category: str = "restaurant", limit: int = 5) -> str:
    geo = geocode_place(place)
    if not geo:
        return f'Could not find location: "{place}".'

    try:
        query = f"{category} near {place}"
        response = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": query,
                "format": "json",
                "limit": limit,
            },
            headers=HEADERS,
            timeout=15,
        )
        data = response.json()
        if not data:
            return f'No nearby "{category}" found around {place}.'

        lines = [
            f"Nearby {category} results near {place}:",
            f"Center location: {geo['name']}",
            "",
        ]

        for i, item in enumerate(data, start=1):
            name = item.get("display_name", "Unknown place")
            lat = item.get("lat")
            lon = item.get("lon")
            map_link = f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=16/{lat}/{lon}"
            lines.append(f"{i}. {name}")
            lines.append(f"   Map: {map_link}")
            lines.append("")

        return "\n".join(lines)
    except Exception:
        logger.exception("Nearby search failed.")
        return "Maps service is currently unavailable."


def get_directions(from_place: str, to_place: str) -> str:
    from_place = (from_place or "").strip()
    to_place = (to_place or "").strip()

    if not from_place or not to_place:
        return "Please provide both starting point and destination."

    google = (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={quote(from_place)}"
        f"&destination={quote(to_place)}"
    )
    osm = (
        "https://www.openstreetmap.org/directions?"
        f"engine=fossgis_osrm_car&route={quote(from_place)}%3B{quote(to_place)}"
    )

    return (
        f"Directions from {from_place} to {to_place}:\n"
        f"- Google Maps: {google}\n"
        f"- OpenStreetMap: {osm}\n"
        "Open any link to see route, distance, and travel options."
    )


def maps_helper(text: str) -> str | None:
    if not text:
        return None

    lower = text.lower()

    # directions
    if any(w in lower for w in ["direction", "directions", "route", "raasta", "kaise jaun", "how to go"]):
        # simple patterns: from X to Y
        import re
        match = re.search(r"from\s+(.+?)\s+to\s+(.+)", text, flags=re.I)
        if match:
            return get_directions(match.group(1), match.group(2))

        match = re.search(r"(.+?)\s+se\s+(.+?)(?:\s+ka|\s+tak|\s+jao|\s+jaun|$)", text, flags=re.I)
        if match:
            return get_directions(match.group(1), match.group(2))

        return "Please ask like: directions from Delhi to Agra"

    # nearby
    if any(w in lower for w in ["nearby", "near me", "paas", "aaspaas", "hospital", "restaurant", "atm", "school", "library"]):
        import re

        category = "restaurant"
        if "hospital" in lower:
            category = "hospital"
        elif "atm" in lower or "bank" in lower:
            category = "atm"
        elif "school" in lower:
            category = "school"
        elif "library" in lower:
            category = "library"
        elif "hotel" in lower:
            category = "hotel"

        place = "Delhi"
        match = re.search(r"(?:in|at|near|paas)\s+([A-Za-z][A-Za-z\s]{1,40})", text, flags=re.I)
        if match:
            place = match.group(1).strip(" ?.!,")

        return nearby_places(place, category=category)

    # plain map of place
    if any(w in lower for w in ["map", "location", "kahan hai", "where is"]):
        import re
        match = re.search(r"(?:map of|location of|where is|kahan hai)\s+(.+)", text, flags=re.I)
        place = match.group(1).strip(" ?.!,") if match else text
        geo = geocode_place(place)
        if not geo:
            return f'Could not find map for "{place}".'
        link = f"https://www.openstreetmap.org/?mlat={geo['lat']}&mlon={geo['lon']}#map=14/{geo['lat']}/{geo['lon']}"
        return (
            f"Location found: {geo['name']}\n"
            f"Map link: {link}"
        )

    return None