from pydantic import BaseModel
from typing import List, Tuple
import math

class Point(BaseModel):
    x: float
    y: float

    def distance_to(self, other: 'Point') -> float:
        return math.sqrt((self.x - other.x)**2 + (self.y - other.y)**2)

class Segment(BaseModel):
    p1: Point
    p2: Point
    id: int # To track original order if needed

    def length(self) -> float:
        return self.p1.distance_to(self.p2)
