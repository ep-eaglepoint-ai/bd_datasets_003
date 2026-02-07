import { RedwoodProvider } from '@redwoodjs/web'
import { RedwoodApolloProvider } from '@redwoodjs/web/apollo'
import { Toaster } from '@redwoodjs/web/toast'

import Routes from 'src/Routes'
import { AuthProvider, useAuth } from 'src/auth/AuthContext'

import './styles/globals.css'

const App = () => (
  <RedwoodProvider>
    <AuthProvider>
      <RedwoodApolloProvider useAuth={useAuth}>
        <Routes />
        <Toaster
          toastOptions={{
            className:
              'rw-toast bg-white border border-gray-200 text-gray-900 shadow-lg rounded-lg',
            duration: 4000,
          }}
        />
      </RedwoodApolloProvider>
    </AuthProvider>
  </RedwoodProvider>
)

export default App
