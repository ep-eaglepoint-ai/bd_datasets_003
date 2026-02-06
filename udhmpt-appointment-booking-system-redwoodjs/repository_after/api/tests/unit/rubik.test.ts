import { RubikCube } from '../../src/lib/rubik'

describe('RubikCube', () => {
    it('identifies a solved cube', () => {
        const cube = new RubikCube()
        expect(cube.isSolved()).toBe(true)
    })

    it('performs moves correctly', () => {
        const cube = new RubikCube()
        cube.move('U')
        expect(cube.isSolved()).toBe(false)
        cube.move("U'")
        expect(cube.isSolved()).toBe(true)
    })

    it('solves a 1-move scramble', () => {
        const cube = RubikCube.fromScramble('R')
        const solution = cube.solve()
        expect(solution).toEqual(["R'"])
    })

    it('solves a 2-move scramble', () => {
        const scramble = 'U R'
        const cube = RubikCube.fromScramble(scramble)
        const solution = cube.solve()
        expect(solution?.length).toBe(2)

        // Verification requires a fresh cube with the same scramble
        const verifyCube = RubikCube.fromScramble(scramble)
        for (const m of solution!) {
            verifyCube.move(m)
        }
        expect(verifyCube.isSolved()).toBe(true)
    })

    it('solves a 3-move scramble', () => {
        const scramble = 'U R F'
        const cube = RubikCube.fromScramble(scramble)
        const solution = cube.solve()
        expect(solution?.length).toBeLessThanOrEqual(3)

        const verifyCube = RubikCube.fromScramble(scramble)
        for (const m of solution!) {
            verifyCube.move(m)
        }
        expect(verifyCube.isSolved()).toBe(true)
    })

    it('calculates a valid heuristic', () => {
        const cube = new RubikCube()
        expect(cube.getHeuristic()).toBe(0)
        cube.move('U')
        expect(cube.getHeuristic()).toBeGreaterThan(0)
    })
})
