import { Router, Route } from '@redwoodjs/router'

import LoginPage from 'src/auth/LoginPage'

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
