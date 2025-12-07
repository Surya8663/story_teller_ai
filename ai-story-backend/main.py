import os
import json
import requests
import urllib.parse
import random
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
from openai import OpenAI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.environ.get("GROQ_API_KEY")
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StoryRequest(BaseModel):
    premise: str
    genre: str
    context: Optional[str] = ""

class StoryResponse(BaseModel):
    title: str
    content: str
    next_choices: List[str]

def clean_json_string(text: str) -> str:
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1:
        return text[start:end+1]
    return text

@app.post("/generate", response_model=StoryResponse)
async def generate_story(request: StoryRequest):
    try:
        system_instruction = """
        You are a creative story engine.
        Return your response strictly as a VALID JSON object.
        The JSON must follow this exact schema:
        {
            "title": "Story Title",
            "content": "The story text...",
            "next_choices": ["Option 1", "Option 2", "Option 3"]
        }
        """

        if request.context:
            user_prompt = f"Genre: {request.genre}\nPREVIOUS STORY:\n{request.context}\nACTION: {request.premise}\nContinue naturally."
        else:
            user_prompt = f"Genre: {request.genre}\nPremise: {request.premise}\nWrite an opening."

        print(f"DEBUG: Generating story for {request.genre}...")
        
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"} 
        )

        raw_content = completion.choices[0].message.content
        data = json.loads(clean_json_string(raw_content))
        return data

    except Exception as e:
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/image-proxy")
async def proxy_image(prompt: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    # 1. ATTEMPT PRIMARY (AI IMAGE)
    try:
        encoded_prompt = urllib.parse.quote(prompt)
        ai_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=512&nologo=true"
        print(f"DEBUG: Trying AI Image: {ai_url}")
        
        response = requests.get(ai_url, headers=headers, timeout=5) # 5s timeout
        
        if response.status_code == 200:
            return Response(content=response.content, media_type="image/jpeg")
        else:
            print(f"WARNING: AI Image failed ({response.status_code}). Switching to Backup.")
    except Exception as e:
        print(f"WARNING: AI Image Connection Error: {e}")

    # 2. FAILOVER TO STOCK PHOTO (If AI fails)
    try:
        # Extract the first word (Genre) to use as a search keyword
        keyword = prompt.split(" ")[0] if " " in prompt else "fantasy"
        # Add a random lock to prevent caching the same stock photo
        random_lock = random.randint(1, 1000)
        
        backup_url = f"https://loremflickr.com/1024/512/{keyword}?lock={random_lock}"
        print(f"DEBUG: Fetching Backup Image: {backup_url}")
        
        backup_response = requests.get(backup_url, headers=headers, timeout=5)
        
        if backup_response.status_code == 200:
            return Response(content=backup_response.content, media_type="image/jpeg")
        
    except Exception as e:
        print(f"CRITICAL: Backup failed too: {e}")

    # 3. FINAL RESORT (Return a 404 only if EVERYTHING fails)
    return Response(status_code=404)