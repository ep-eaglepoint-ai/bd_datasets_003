export type CubeState = number[] // 54 elements

export enum Face {
    U = 0,
    D = 1,
    L = 2,
    R = 3,
    F = 4,
    B = 5,
}

const SOLVED_STATE: CubeState = Array.from({ length: 54 }, (_, i) => Math.floor(i / 9))

const COORDS: [number, number, number][] = [
    // U
    [-1, 1, -1], [0, 1, -1], [1, 1, -1],
    [-1, 1, 0], [0, 1, 0], [1, 1, 0],
    [-1, 1, 1], [0, 1, 1], [1, 1, 1],
    // D
    [-1, -1, 1], [0, -1, 1], [1, -1, 1],
    [-1, -1, 0], [0, -1, 0], [1, -1, 0],
    [-1, -1, -1], [0, -1, -1], [1, -1, -1],
    // L
    [-1, 1, -1], [-1, 1, 0], [-1, 1, 1],
    [-1, 0, -1], [-1, 0, 0], [-1, 0, 1],
    [-1, -1, -1], [-1, -1, 0], [-1, -1, 1],
    // R
    [1, 1, 1], [1, 1, 0], [1, 1, -1],
    [1, 0, 1], [1, 0, 0], [1, 0, -1],
    [1, -1, 1], [1, -1, 0], [1, -1, -1],
    // F
    [-1, 1, 1], [0, 1, 1], [1, 1, 1],
    [-1, 0, 1], [0, 0, 1], [1, 0, 1],
    [-1, -1, 1], [0, -1, 1], [1, -1, 1],
    // B
    [1, 1, -1], [0, 1, -1], [-1, 1, -1],
    [1, 0, -1], [0, 0, -1], [-1, 0, -1],
    [1, -1, -1], [0, -1, -1], [-1, -1, -1]
]

const ALL_MOVES = [
    'U', "U'", 'U2', 'D', "D'", 'D2',
    'L', "L'", 'L2', 'R', "R'", 'R2',
    'F', "F'", 'F2', 'B', "B'", 'B2'
]

/**
 * Standard 3x3 Rubik's Cube logic.
 * Face mapping (9 indices per face):
 * U (Up): 0-8
 * D (Down): 9-17
 * L (Left): 18-26
 * R (Right): 27-35
 * F (Front): 36-44
 * B (Back): 45-53
 */
export class RubikCube {
    state: CubeState

    constructor(state: CubeState = [...SOLVED_STATE]) {
        this.state = state
    }

    isSolved(): boolean {
        for (let i = 0; i < 54; i++) {
            if (this.state[i] !== Math.floor(i / 9)) return false
        }
        return true
    }

    static fromScramble(scramble: string): RubikCube {
        const cube = new RubikCube()
        const moves = scramble.trim().split(/\s+/)
        for (const move of moves) {
            if (move) cube.move(move)
        }
        return cube
    }

    getHeuristic(): number {
        let sum = 0
        for (let i = 0; i < 54; i++) {
            const color = this.state[i]
            if (color === Math.floor(i / 9)) continue

            // Find any position on the target face for this color
            // A slightly better heuristic: find the closest sticker on target face
            let minMd = 100
            const targetOffset = color * 9
            const current = COORDS[i]

            for (let j = 0; j < 9; j++) {
                const target = COORDS[targetOffset + j]
                const md = Math.abs(current[0] - target[0]) +
                    Math.abs(current[1] - target[1]) +
                    Math.abs(current[2] - target[2])
                if (md < minMd) minMd = md
            }
            sum += minMd
        }
        // sum / 12 is a safe admissible factor for 3D Manhattan sum 
        return Math.ceil(sum / 12)
    }

    solve(): string[] | null {
        if (this.isSolved()) return []

        for (let depth = 0; depth <= 20; depth++) {
            const path: string[] = []
            if (this.idaStar(0, depth, path, null)) {
                return path
            }
        }
        return null
    }

    private idaStar(
        g: number,
        limit: number,
        path: string[],
        lastMove: string | null
    ): boolean {
        const h = this.getHeuristic()
        if (g + h > limit) return false
        if (this.isSolved()) return true

        for (const m of ALL_MOVES) {
            // Pruning: don't reverse last move or move same face twice
            if (lastMove && m[0] === lastMove[0]) continue

            const prevState = [...this.state]
            this.move(m)
            path.push(m)

            if (this.idaStar(g + 1, limit, path, m)) return true

            path.pop()
            this.state = prevState
        }

        return false
    }

    move(m: string) {
        switch (m) {
            case 'U': this.rotateU(); break;
            case "U'": this.rotateU(); this.rotateU(); this.rotateU(); break;
            case 'U2': this.rotateU(); this.rotateU(); break;
            case 'D': this.rotateD(); break;
            case "D'": this.rotateD(); this.rotateD(); this.rotateD(); break;
            case 'D2': this.rotateD(); this.rotateD(); break;
            case 'L': this.rotateL(); break;
            case "L'": this.rotateL(); this.rotateL(); this.rotateL(); break;
            case 'L2': this.rotateL(); this.rotateL(); break;
            case 'R': this.rotateR(); break;
            case "R'": this.rotateR(); this.rotateR(); this.rotateR(); break;
            case 'R2': this.rotateR(); this.rotateR(); break;
            case 'F': this.rotateF(); break;
            case "F'": this.rotateF(); this.rotateF(); this.rotateF(); break;
            case 'F2': this.rotateF(); this.rotateF(); break;
            case 'B': this.rotateB(); break;
            case "B'": this.rotateB(); this.rotateB(); this.rotateB(); break;
            case 'B2': this.rotateB(); this.rotateB(); break;
            default: throw new Error(`Invalid move: ${m}`);
        }
    }

    private rotateFace(f: Face) {
        const s = this.state
        const offset = f * 9
        const old = s.slice(offset, offset + 9)
        // 012    630
        // 345 -> 741
        // 678    852
        s[offset + 0] = old[6]
        s[offset + 1] = old[3]
        s[offset + 2] = old[0]
        s[offset + 3] = old[7]
        s[offset + 4] = old[4]
        s[offset + 5] = old[1]
        s[offset + 6] = old[8]
        s[offset + 7] = old[5]
        s[offset + 8] = old[2]
    }

    private rotateU() {
        this.rotateFace(Face.U)
        const s = this.state
        const tmp = [s[36], s[37], s[38]] // F top
        s[36] = s[27]; s[37] = s[28]; s[38] = s[29] // F <- R
        s[27] = s[45]; s[28] = s[46]; s[29] = s[47] // R <- B
        s[45] = s[18]; s[46] = s[19]; s[47] = s[20] // B <- L
        s[18] = tmp[0]; s[19] = tmp[1]; s[20] = tmp[2] // L <- F
    }

    private rotateD() {
        this.rotateFace(Face.D)
        const s = this.state
        const tmp = [s[42], s[43], s[44]] // F bottom
        s[42] = s[18 + 6]; s[43] = s[18 + 7]; s[44] = s[18 + 8] // F <- L
        s[18 + 6] = s[45 + 6]; s[18 + 7] = s[45 + 7]; s[18 + 8] = s[45 + 8] // L <- B
        s[45 + 6] = s[27 + 6]; s[45 + 7] = s[27 + 7]; s[45 + 8] = s[27 + 8] // B <- R
        s[27 + 6] = tmp[0]; s[27 + 7] = tmp[1]; s[27 + 8] = tmp[2] // R <- F
    }

    private rotateL() {
        this.rotateFace(Face.L)
        const s = this.state
        const tmp = [s[0], s[3], s[6]] // U left
        s[0] = s[36]; s[3] = s[39]; s[6] = s[42] // U <- F
        s[36] = s[9]; s[39] = s[12]; s[42] = s[15] // F <- D
        s[9] = s[53]; s[12] = s[50]; s[15] = s[47] // D <- B reversed
        s[53] = tmp[0]; s[50] = tmp[1]; s[47] = tmp[2] // B <- U reversed
    }

    private rotateR() {
        this.rotateFace(Face.R)
        const s = this.state
        const tmp = [s[2], s[5], s[8]] // U right
        s[2] = s[38]; s[5] = s[41]; s[8] = s[44] // U <- F
        s[38] = s[11]; s[41] = s[14]; s[44] = s[17] // F <- D
        s[11] = s[51]; s[14] = s[48]; s[17] = s[45] // D <- B reversed
        s[51] = tmp[0]; s[48] = tmp[1]; s[45] = tmp[2] // B <- U reversed
    }

    private rotateF() {
        this.rotateFace(Face.F)
        const s = this.state
        const tmp = [s[6], s[7], s[8]] // U bottom
        s[6] = s[26]; s[7] = s[23]; s[8] = s[20] // U <- L reversed
        s[26] = s[9]; s[23] = s[10]; s[20] = s[11] // L <- D
        s[9] = s[27]; s[10] = s[30]; s[11] = s[33] // D <- R reversed
        s[27] = tmp[0]; s[30] = tmp[1]; s[33] = tmp[2] // R <- U
    }

    private rotateB() {
        this.rotateFace(Face.B)
        const s = this.state
        const tmp = [s[0], s[1], s[2]] // U top
        s[0] = s[29]; s[1] = s[32]; s[2] = s[35] // U <- R
        s[29] = s[17]; s[32] = s[16]; s[35] = s[15] // R <- D reversed
        s[17] = s[18]; s[16] = s[21]; s[15] = s[24] // D <- L
        s[18] = tmp[2]; s[21] = tmp[1]; s[24] = tmp[0] // L <- U reversed
    }
}
