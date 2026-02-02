from pydantic import BaseModel, field_validator
from typing import List, Optional

class PollCreate(BaseModel):
    title: str
    options: List[str]

    @field_validator('options')
    def validate_options(cls, v):
        if len(v) < 2:
            raise ValueError('Poll must have at least 2 options')
        return v

class VoteRequest(BaseModel):
    option_id: str

class PollResponse(BaseModel):
    id: str
    title: str
    options: List[str]
    status: str # active/closed
