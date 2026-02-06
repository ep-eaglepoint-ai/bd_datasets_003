import { RubikCube } from '../../lib/rubik'

export const solveCube = ({ scramble }: { scramble: string }) => {
    const cube = RubikCube.fromScramble(scramble)
    const result = cube.solve()
    if (!result) {
        throw new Error('Solution not found within depth limit')
    }
    return result
}
