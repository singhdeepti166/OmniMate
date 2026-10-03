from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
print("API Key found:", bool(api_key))

client = genai.Client(api_key=api_key)

print("\nAvailable models:\n")

try:
    for model in client.models.list():
        print(model.name)
except Exception as e:
    print("Error:", e)