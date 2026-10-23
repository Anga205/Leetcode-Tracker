package main

import "time"

const (
	apiBaseURL       = "https://leetcode-api-faisalshohag.anga.codes"
	readingsPath     = "ProgressViewer/public/readings.json"
	connectTimeout   = 15 * time.Second
	readTimeout      = 20 * time.Second
	retryDelay       = 30 * time.Second
	betweenUserDelay = 5 * time.Second
	maxAttempts      = 4
)

var trackedUsers = []string{
	"Anga205",
	"munish42",
	"shakirth-anisha",
	"prayasha_nanda",
	"sashshaikh12",
	"siri_n_shetty",
}
