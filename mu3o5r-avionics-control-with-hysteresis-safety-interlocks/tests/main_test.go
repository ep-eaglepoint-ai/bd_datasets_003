package main

import (
	"firecontrol"
)

func CreateTelemetry(altitude, humidity, temperature float64) firecontrol.Telemetry {
	return firecontrol.Telemetry{
		Altitude:         altitude,
		RelativeHumidity: humidity,
		Temperature:      temperature,
	}
}
