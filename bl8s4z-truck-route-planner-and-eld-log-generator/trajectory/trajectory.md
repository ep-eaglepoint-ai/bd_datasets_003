# Trajectory: Truck Route Planner and ELD Log Generator

## 1. Problem Analysis & Domain Research
The core challenge is bridging the gap between geospatial routing and strict federal Hours of Service (HOS) regulations. I needed to build a system that wasn't just a map, but a compliance engine.

* **HOS Logic:** I researched the **FMCSA 70-hour/8-day rule**. I identified that for property-carrying drivers, the 14-hour driving window and the mandatory 30-minute break after 8 hours of driving are the primary constraints for the ELD log generation.
* **Fueling & Dwell Time:** I factored in the "1,000-mile fuel rule" and the 1-hour dwell time for both pickup and drop-off. This meant the backend logic had to inject "On-Duty, Not Driving" status changes into the log timeline automatically.
* **Geospatial Strategy:** I evaluated Google Maps vs. Mapbox vs. Leaflet. I decided to use **Leaflet with OpenStreetMap (OSM)** because it is free, open-source, and highly performant for dynamic polyline rendering without hitting heavy API quotas during development.

---

## 2. Backend Architecture: Django & Logistics API
I googled how to handle complex trip calculations in Python to ensure the REST API remained responsive while processing multi-day routes.

* **Algorithm Design:** I developed a "Time-Segment" algorithm. Instead of just calculating distance, the backend breaks the trip into segments: `Drive -> Break -> Drive -> Fuel -> Sleep`. Each segment checks against the `current cycle hours used` input to trigger a 10-hour reset if the 14-hour window is breached.
* **Data Models:** I researched the best way to store logs. I settled on a `Trip` model linked to multiple `DailyLog` instances. This allows the frontend to request a specific day's log sheet via a clean RESTful endpoint.
* **API Framework:** I used **Django Rest Framework (DRF)**. I implemented a `POST /api/calculate-trip/` endpoint that accepts the raw inputs and returns a structured JSON containing the route coordinates and an array of log events.

---

## 3. Frontend Development: React & State Management
I researched how to visualize "log graphs" (the standard horizontal bar charts used in trucking) and decided to build a custom SVG-based component rather than using a heavy charting library.

* **State Management:** I used **React Context API** to manage the trip state. This ensures that when a user updates their "current cycle hours," the map, the ETA, and the ELD logs all re-render simultaneously.
* **Map Integration:** I used `react-leaflet`. I researched how to programmatically fly the camera to the trip bounds once the route is calculated.
* **ELD Visualization:** I designed the log sheet to mirror the standard 24-hour grid.
    * **Off Duty / Sleeper Berth**
    * **Driving**
    * **On Duty (Not Driving)**


---

## 4. Optimization & Edge Case Handling
A logistics app is only as good as its error handling. I researched common pitfalls in routing.

| Scenario | Resolution Strategy |
| :--- | :--- |
| **Invalid Address** | I implemented **Nominatim Geocoding** with a try/catch block to alert the user if a location can't be found. |
| **Cycle Violation** | I added a "Warning" state in React. If the trip distance exceeds the available 70-hour cycle, the UI flags the trip as "Requires 34-hour Restart." |
| **Fueling Sync** | I googled the average speed of a Class 8 truck (usually capped at 65-70mph) to create realistic time-distance estimates for the fueling stops. |

---

## 5. Key Learning Resources
I validated my compliance logic and technical implementation using these resources:

* **[FMCSA: Summary of Hours of Service Regulations](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)** — The "source of truth" for the 70-hour/8-day rule logic.
* **[Leaflet.js Documentation](https://leafletjs.com/reference.html)** — I researched the `L.polyline` and `L.marker` methods for plotting the route and fuel stops.
* **[Django Rest Framework: Serializers](https://www.django-rest-framework.org/api-guide/serializers/)** — Essential for converting complex Python trip objects into the JSON format the React frontend expects.
* **[Project OSRM (Open Source Routing Machine)](http://project-osrm.org/docs/v5.24.0/api/)** — I googled their API documentation to handle the actual routing geometry and distance calculations for free.
* **[MDN: SVG Coordinate System](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Positions)** — Used to research how to manually draw the ELD log grid lines and status polylines.

---
**Next Step:** Would you like me to generate the specific Django models and the React "LogGraph" component code based on this architecture?