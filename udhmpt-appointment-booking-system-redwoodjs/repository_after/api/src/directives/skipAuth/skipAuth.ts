import { createValidatorDirective } from '@redwoodjs/graphql-server'

export const schema = gql`
  directive @skipAuth on FIELD_DEFINITION
`

const validate = () => {
    // skipAuth doesn't need to do anything
}

export const skipAuth = createValidatorDirective(schema, validate)
