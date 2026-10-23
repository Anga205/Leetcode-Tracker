package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type updater struct {
	API         *APIClient
	Attempts    int
	RetryDelay  time.Duration
	BetweenWait time.Duration
	Now         func() float64
	Sleep       func(context.Context, time.Duration) error
}

func defaultUpdater() updater {
	return updater{
		API:         newAPIClient(apiBaseURL),
		Attempts:    maxAttempts,
		RetryDelay:  retryDelay,
		BetweenWait: betweenUserDelay,
		Now:         func() float64 { return float64(time.Now().UnixNano()) / 1e9 },
		Sleep:       sleep,
	}
}

func sleep(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (u updater) update(ctx context.Context, path string, users []string) error {
	if u.Attempts < 1 {
		return errors.New("updater attempts must be at least 1")
	}
	var readings ReadingsFile
	if err := readings.load(path); err != nil {
		return err
	}
	readings.ensureKeys(users)
	for index, username := range users {
		var solved int
		var err error
		for attempt := 1; attempt <= u.Attempts; attempt++ {
			var body string
			body, err = u.API.getUserJSON(ctx, username)
			if err == nil {
				solved, err = parseTotalSolved(body)
			}
			if err == nil {
				break
			}
			if attempt < u.Attempts {
				if sleepErr := u.Sleep(ctx, u.RetryDelay); sleepErr != nil {
					return sleepErr
				}
			}
		}
		if err != nil {
			return fmt.Errorf("updating %s after %d attempts: %w", username, u.Attempts, err)
		}
		key := strings.ToLower(username)
		entry, _ := readings.entry(key)
		if len(entry.Readings) == 0 || solved > entry.Readings[len(entry.Readings)-1].SolvedCount {
			entry.Readings = append(entry.Readings, Reading{SolvedCount: solved, TimestampSeconds: u.Now()})
		}
		if index < len(users)-1 {
			if err := u.Sleep(ctx, u.BetweenWait); err != nil {
				return err
			}
		}
	}
	return readings.save(path)
}

func main() {
	if err := defaultUpdater().update(context.Background(), readingsPath, trackedUsers); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
