from pydantic import BaseModel
from typing import List, Optional

class StoryRequest(BaseModel):
    premise: str
    genre: str
    context: Optional[str] = "" # New field: The story so far

class StoryResponse(BaseModel):
    title: str
    content: str
    next_choices: List[str]