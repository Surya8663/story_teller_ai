import os
from dotenv import load_dotenv

# Force reload of the .env file
load_dotenv(override=True)

key = os.getenv("GROQ_API_KEY")

print("\n--- DIAGNOSTIC REPORT ---")
if not key:
    print("❌ FAILURE: Python cannot find 'GROQ_API_KEY'.")
    print("Check: Did you name the file '.env' exactly? Is it in the same folder?")
elif not key.startswith("gsk_"):
    print(f"⚠️ WARNING: Your key looks weird. It starts with '{key[:4]}...'")
    print("Groq keys normally start with 'gsk_'. Check for typos.")
else:
    print("✅ SUCCESS: Key found!")
    print(f"Key loaded: {key[:10]}... (hidden)")
print("-------------------------\n")