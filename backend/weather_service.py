import logging
import httpx

logger = logging.getLogger(__name__)


def get_weather(city: str = "Delhi") -> str:
    city = (city or "Delhi").strip()
    if not city:
        city = "Delhi"

    try:
        geo_response = httpx.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": city, "count": 1, "language": "en"},
            timeout=12,
        )
        geo_data = geo_response.json()

        results = geo_data.get("results") or []
        if not results:
            return f'Weather: Could not find location "{city}".'

        place = results[0]
        lat = place.get("latitude")
        lon = place.get("longitude")
        name = place.get("name") or city
        country = place.get("country") or ""

        weather_response = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current_weather": True,
            },
            timeout=12,
        )
        weather_data = weather_response.json()
        current = weather_data.get("current_weather") or {}

        temp = current.get("temperature")
        wind = current.get("windspeed")
        code = current.get("weathercode")

        condition = _weather_code_to_text(code)

        location_label = f"{name}, {country}".strip().strip(",")

        return (
            f"Weather in {location_label}:\n"
            f"- Condition: {condition}\n"
            f"- Temperature: {temp}°C\n"
            f"- Wind speed: {wind} km/h\n"
            f"Use this live weather data to answer the user."
        )
    except Exception:
        logger.exception("Weather fetch failed.")
        return "Weather service is currently unavailable."


def _weather_code_to_text(code):
    mapping = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        71: "Slight snow",
        73: "Moderate snow",
        75: "Heavy snow",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        95: "Thunderstorm",
    }
    try:
        return mapping.get(int(code), "Unknown")
    except Exception:
        return "Unknown"