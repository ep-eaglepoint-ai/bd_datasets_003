// Main page component for Parcel Locker Access Portal
// Provides interfaces for both couriers and residents

import CourierCheckIn from './components/CourierCheckIn';
import ResidentPinPad from './components/ResidentPinPad';
import StateRevalidator from './components/StateRevalidator';

export default function Home() {
  return (
    <>
      <StateRevalidator />
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              SwiftDrop Parcel Locker Access Portal
            </h1>
            <p className="text-gray-600">
              Secure package management for couriers and residents
            </p>
          </header>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <CourierCheckIn />
            </div>
            <div>
              <ResidentPinPad />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
