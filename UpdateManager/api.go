package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
)

type APIClient struct {
	BaseURL string
	Client  *http.Client
}

func newAPIClient(baseURL string) *APIClient {
	transport := &http.Transport{
		DialContext: (&net.Dialer{Timeout: connectTimeout}).DialContext,
	}
	return &APIClient{
		BaseURL: strings.TrimRight(baseURL, "/") + "/",
		Client:  &http.Client{Transport: transport, Timeout: readTimeout},
	}
}

func (c *APIClient) getUserJSON(ctx context.Context, username string) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+username, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	response, err := c.Client.Do(request)
	if err != nil {
		return "", fmt.Errorf("fetch user JSON for %q: %w", username, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 501))
		snippet := string(body)
		if len(snippet) > 500 {
			snippet = snippet[:500] + "..."
		}
		if snippet != "" {
			return "", fmt.Errorf("HTTP %d fetching %s: response body: %s", response.StatusCode, c.BaseURL+username, snippet)
		}
		return "", fmt.Errorf("HTTP %d fetching %s", response.StatusCode, c.BaseURL+username)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	return string(body), nil
}

func parseTotalSolved(body string) (int, error) {
	var payload json.RawMessage
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return 0, fmt.Errorf("invalid API JSON: %w", err)
	}
	value, ok := findTotalSolved(payload)
	if !ok {
		return 0, errors.New("totalSolved is missing")
	}
	var solved int
	if err := json.Unmarshal(value, &solved); err != nil {
		return 0, fmt.Errorf("invalid totalSolved: %w", err)
	}
	return solved, nil
}

func findTotalSolved(value json.RawMessage) (json.RawMessage, bool) {
	var object map[string]json.RawMessage
	if json.Unmarshal(value, &object) == nil {
		if candidate, ok := object["totalSolved"]; ok {
			return candidate, true
		}
		for _, child := range object {
			if candidate, ok := findTotalSolved(child); ok {
				return candidate, true
			}
		}
	}
	var array []json.RawMessage
	if json.Unmarshal(value, &array) == nil {
		for _, child := range array {
			if candidate, ok := findTotalSolved(child); ok {
				return candidate, true
			}
		}
	}
	return nil, false
}
