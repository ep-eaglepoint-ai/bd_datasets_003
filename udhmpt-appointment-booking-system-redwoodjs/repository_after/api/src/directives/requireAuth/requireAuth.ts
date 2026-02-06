import { createValidatorDirective } from '@redwoodjs/graphql-server'

export const schema = gql`
  directive @requireAuth(roles: [String]) on FIELD_DEFINITION
`

const validate = ({ directiveArgs, context }) => {
  const { currentUser } = context

  if (!currentUser) {
    throw new Error('Not authenticated')
  }

  const { roles } = directiveArgs
  if (roles && roles.length > 0) {
    const userRole = currentUser.role
    if (!roles.includes(userRole)) {
      throw new Error('Forbidden')
    }
  }
}

export const requireAuth = createValidatorDirective(schema, validate)
