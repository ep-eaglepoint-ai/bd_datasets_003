import { RedwoodProvider } from '@redwoodjs/web'
import { RedwoodApolloProvider } from '@redwoodjs/web/apollo'

import Routes from 'src/Routes'

import './index.css'

const App = () => (
  <RedwoodProvider>
    <RedwoodApolloProvider>
      <Routes />
    </RedwoodApolloProvider>
  </RedwoodProvider>
)

export default App
