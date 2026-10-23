package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestParseTotalSolved(t *testing.T) {
	tests := []struct {
		name string
		body string
		want int
	}{
		{"valid", `{"totalSolved": 123}`, 123},
		{"nested", `{"data":{"totalSolved": 456}}`, 456},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseTotalSolved(test.body)
			if err != nil || got != test.want {
				t.Fatalf("parseTotalSolved() = %d, %v; want %d", got, err, test.want)
			}
		})
	}
	for _, body := range []string{`{}`, `{"totalSolved":"123"}`, `not json`} {
		if _, err := parseTotalSolved(body); err == nil {
			t.Errorf("parseTotalSolved(%q) succeeded; want error", body)
		}
	}
}

func TestReadingsPreserveOrderAndRejectMalformedInput(t *testing.T) {
	var readings ReadingsFile
	if err := json.Unmarshal([]byte(`{"z":[[2,3]],"a":[]}`), &readings); err != nil {
		t.Fatal(err)
	}
	readings.ensureKeys([]string{"A", "new_user"})
	wantKeys := []string{"z", "a", "new_user"}
	var gotKeys []string
	for _, entry := range readings.Entries {
		gotKeys = append(gotKeys, entry.Key)
	}
	if !reflect.DeepEqual(gotKeys, wantKeys) {
		t.Fatalf("keys = %v; want %v", gotKeys, wantKeys)
	}
	if err := json.Unmarshal([]byte(`{"a":[[1]]}`), &ReadingsFile{}); err == nil {
		t.Fatal("malformed pair was accepted")
	}
}

func TestUpdaterAppendsOnlyIncreasesAndSavesAfterSuccess(t *testing.T) {
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/second" {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(`{"totalSolved": 3}`))
	}))
	defer server.Close()

	directory := t.TempDir()
	path := filepath.Join(directory, "readings.json")
	if err := os.WriteFile(path, []byte("{\n    \"first\": [[2, 10]]\n}\n"), 0600); err != nil {
		t.Fatal(err)
	}
	sleeps := 0
	u := updater{
		API:      &APIClient{BaseURL: server.URL + "/", Client: server.Client()},
		Attempts: 1,
		Now:      func() float64 { return 20.5 },
		Sleep:    func(context.Context, time.Duration) error { sleeps++; return nil },
	}
	if err := u.update(context.Background(), path, []string{"first"}); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "[3, 20.5]") {
		t.Fatalf("saved readings missing appended point: %s", contents)
	}
	if sleeps != 0 || !reflect.DeepEqual(calls, []string{"/first"}) {
		t.Fatalf("sleeps/calls = %d/%v", sleeps, calls)
	}
}

func TestUpdaterDoesNotOverwriteMalformedHistory(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"totalSolved": 3}`))
	}))
	defer server.Close()
	path := filepath.Join(t.TempDir(), "readings.json")
	original := []byte("not json")
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	u := updater{API: &APIClient{BaseURL: server.URL + "/", Client: server.Client()}, Attempts: 1}
	if err := u.update(context.Background(), path, []string{"first"}); err == nil {
		t.Fatal("malformed history was accepted")
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(contents, original) {
		t.Fatalf("malformed history changed to %q", contents)
	}
}

func TestUpdaterRetriesBeforeAppending(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(`{"totalSolved": 4}`))
	}))
	defer server.Close()

	path := filepath.Join(t.TempDir(), "readings.json")
	sleeps := 0
	u := updater{
		API:      &APIClient{BaseURL: server.URL + "/", Client: server.Client()},
		Attempts: 2,
		Now:      func() float64 { return 30 },
		Sleep:    func(context.Context, time.Duration) error { sleeps++; return nil },
	}
	if err := u.update(context.Background(), path, []string{"first"}); err != nil {
		t.Fatal(err)
	}
	if attempts != 2 || sleeps != 1 {
		t.Fatalf("attempts/sleeps = %d/%d; want 2/1", attempts, sleeps)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "[4, 30]") {
		t.Fatalf("saved readings missing retry result: %s", contents)
	}
}

func TestUpdaterRejectsInvalidAttemptCount(t *testing.T) {
	u := updater{Attempts: 0}
	if err := u.update(context.Background(), filepath.Join(t.TempDir(), "readings.json"), nil); err == nil {
		t.Fatal("invalid attempt count was accepted")
	}
}
