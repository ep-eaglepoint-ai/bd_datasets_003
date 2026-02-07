import { context } from '@redwoodjs/graphql-server'
import { db } from '../../lib/db'

export const services = ({ providerId }: { providerId?: number }) => {
    return db.service.findMany({
        where: providerId ? { providerId } : undefined,
    })
}

export const service = ({ id }: { id: number }) => {
    return db.service.findUnique({ where: { id } })
}

export const createService = async ({ input }: { input: any }) => {
    if (!context.currentUser) throw new Error('Not authenticated')

    const provider = await db.providerProfile.findUnique({
        where: { userId: (context.currentUser as any)?.id },
    })

    if (!provider) throw new Error('Provider profile not found')

    return db.service.create({
        data: {
            ...input,
            providerId: provider.id,
        },
    })
}
