import { PrismaConfig } from '@prisma/config'

const config: PrismaConfig = {
  datasources: {
    db: {
      url: 'file:./dev.db'
    }
  }
}

export default config
