import { createValidatorDirective } from '@redwoodjs/graphql-server'
import { enforceAuth } from 'src/lib/auth'

export const schema = gql`
  directive @requireAuth(roles: [String]) on FIELD_DEFINITION
`

const validate = ({ directiveArgs, context }) => {
  const { roles } = directiveArgs
  enforceAuth(context.currentUser, roles)
}

export const requireAuth = createValidatorDirective(schema, validate)
