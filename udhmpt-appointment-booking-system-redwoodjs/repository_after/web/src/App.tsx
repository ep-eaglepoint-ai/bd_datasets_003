import { RedwoodProvider } from '@redwoodjs/web'
import { RedwoodApolloProvider } from '@redwoodjs/web/apollo'

import Routes from 'src/Routes'
import { AuthProvider, useAuth } from 'src/auth/AuthContext'

import './styles/globals.css'

const App = () => (
  <RedwoodProvider>
    <AuthProvider>
      <RedwoodApolloProvider useAuth={useAuth}>
        <Routes />
      </RedwoodApolloProvider>
    </AuthProvider>
  </RedwoodProvider>
)

export default App
