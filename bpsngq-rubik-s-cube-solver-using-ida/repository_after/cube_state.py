class CubeState:
    """
    Represents the state of a Rubik's Cube using permutation and orientation vectors.
    
    cp: Corner Permutation (8 elements, 0-7)
    co: Corner Orientation (8 elements, 0-2)
    ep: Edge Permutation (12 elements, 0-11)
    eo: Edge Orientation (12 elements, 0-1)
    """
    def __init__(self, cp, co, ep, eo):
        self.cp = list(cp)
        self.co = list(co)
        self.ep = list(ep)
        self.eo = list(eo)

    @staticmethod
    def solved_state():
        """Returns a CubeState representing the solved cube."""
        return CubeState(
            cp=list(range(8)),
            co=[0] * 8,
            ep=list(range(12)),
            eo=[0] * 12
        )

    def is_solved(self) -> bool:
        """Returns True if the cube is in the solved state."""
        return (self.cp == list(range(8)) and
                self.co == [0] * 8 and
                self.ep == list(range(12)) and
                self.eo == [0] * 12)

    def copy(self):
        """Returns a deep copy of the current cube state."""
        return CubeState(
            cp=list(self.cp),
            co=list(self.co),
            ep=list(self.ep),
            eo=list(self.eo)
        )
