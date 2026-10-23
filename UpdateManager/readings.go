package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func (r *ReadingsFile) load(path string) error {
	contents, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read readings file: %w", err)
	}
	if err := json.Unmarshal(contents, r); err != nil {
		return fmt.Errorf("parse readings file: %w", err)
	}
	return nil
}

func (r *ReadingsFile) UnmarshalJSON(data []byte) error {
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if token != json.Delim('{') {
		return errors.New("readings root must be an object")
	}

	var entries []ReadingEntry
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return err
		}
		key, ok := keyToken.(string)
		if !ok {
			return errors.New("reading key must be a string")
		}
		var rawReadings []json.RawMessage
		if err := decoder.Decode(&rawReadings); err != nil {
			return fmt.Errorf("readings for %q: %w", key, err)
		}
		readings := make([]Reading, 0, len(rawReadings))
		for _, raw := range rawReadings {
			var pair []json.RawMessage
			if err := json.Unmarshal(raw, &pair); err != nil || len(pair) != 2 {
				return fmt.Errorf("invalid reading pair for %q", key)
			}
			var solved int
			var timestamp float64
			if err := json.Unmarshal(pair[0], &solved); err != nil {
				return fmt.Errorf("invalid solved count for %q: %w", key, err)
			}
			if err := json.Unmarshal(pair[1], &timestamp); err != nil {
				return fmt.Errorf("invalid timestamp for %q: %w", key, err)
			}
			readings = append(readings, Reading{SolvedCount: solved, TimestampSeconds: timestamp})
		}
		entries = append(entries, ReadingEntry{Key: key, Readings: readings})
	}
	if _, err := decoder.Token(); err != nil {
		return err
	}
	if decoder.More() {
		return errors.New("unexpected trailing readings data")
	}
	r.Entries = entries
	return nil
}

func (r ReadingsFile) MarshalJSON() ([]byte, error) {
	var builder strings.Builder
	builder.WriteString("{\n")
	for i, entry := range r.Entries {
		if i > 0 {
			builder.WriteString(",\n")
		}
		key, err := json.Marshal(entry.Key)
		if err != nil {
			return nil, err
		}
		builder.WriteString("    ")
		builder.Write(key)
		builder.WriteString(": [\n")
		for j, reading := range entry.Readings {
			if j > 0 {
				builder.WriteString(",\n")
			}
			builder.WriteString("        [")
			builder.WriteString(strconv.Itoa(reading.SolvedCount))
			builder.WriteString(", ")
			builder.WriteString(strconv.FormatFloat(reading.TimestampSeconds, 'f', -1, 64))
			builder.WriteString("]")
		}
		builder.WriteString("\n    ]")
	}
	builder.WriteString("\n}\n")
	return []byte(builder.String()), nil
}

func (r ReadingsFile) save(path string) error {
	contents, err := r.MarshalJSON()
	if err != nil {
		return fmt.Errorf("serialize readings: %w", err)
	}
	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0755); err != nil {
		return fmt.Errorf("create readings directory: %w", err)
	}
	temporary, err := os.CreateTemp(parent, ".readings-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary readings file: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(contents); err != nil {
		temporary.Close()
		return fmt.Errorf("write temporary readings file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary readings file: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace readings file: %w", err)
	}
	return nil
}
