package main

import "strings"

type Reading struct {
	SolvedCount      int
	TimestampSeconds float64
}

type ReadingEntry struct {
	Key      string
	Readings []Reading
}

type ReadingsFile struct {
	Entries []ReadingEntry
}

func (r *ReadingsFile) entry(key string) (*ReadingEntry, bool) {
	for i := range r.Entries {
		if r.Entries[i].Key == key {
			return &r.Entries[i], true
		}
	}
	return nil, false
}

func (r *ReadingsFile) ensureKeys(keys []string) {
	for _, key := range keys {
		key = strings.ToLower(key)
		if _, ok := r.entry(key); !ok {
			r.Entries = append(r.Entries, ReadingEntry{Key: key, Readings: []Reading{}})
		}
	}
}
