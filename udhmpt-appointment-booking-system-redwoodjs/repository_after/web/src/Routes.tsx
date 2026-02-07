import { Router, Route } from '@redwoodjs/router'

import LoginPage from 'src/auth/LoginPage'
import BookingsPage from 'src/pages/BookingsPage/BookingsPage'
import ProviderCalendarPage from 'src/pages/ProviderCalendarPage/ProviderCalendarPage'
import ProviderOnboardingPage from 'src/pages/ProviderOnboardingPage/ProviderOnboardingPage'
import NotFoundPage from 'src/pages/NotFoundPage/NotFoundPage'

const Routes = () => {
    return (
        <Router>
            <Route path="/login" page={LoginPage} name="login" />
            <Route path="/bookings" page={BookingsPage} name="bookings" />
            <Route path="/calendar" page={ProviderCalendarPage} name="calendar" />
            <Route path="/provider" page={ProviderCalendarPage} name="provider" />
            <Route path="/provider/onboarding" page={ProviderOnboardingPage} name="providerOnboarding" />
            <Route path="/" page={BookingsPage} name="home" />
            <Route notfound page={NotFoundPage} />
        </Router>
    )
}

export default Routes
