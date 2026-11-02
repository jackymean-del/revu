// Package terminology resolves institution words on the server (PDFs,
// emails, generated text) exactly as the app does. The key list and presets
// are frontend/src/lib/terminology/presets.json, copied here as
// presets.gen.json by npm run gen:terms (make gen); a test fails when the
// copy is stale.
package terminology

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
)

//go:embed presets.gen.json
var raw []byte

// Forms are the singular and plural of a word.
type Forms struct {
	One   string `json:"one"`
	Other string `json:"other"`
}

// Override is an institution's own word for a key. BranchID "" covers the
// whole organisation.
type Override struct {
	Key      string
	BranchID string
	Forms
}

var data struct {
	Keys    map[string]string           `json:"keys"`
	Presets map[string]map[string]Forms `json:"presets"`
}

// Keys lists every key, sorted.
var Keys []string

func init() {
	if err := json.Unmarshal(raw, &data); err != nil {
		panic("terminology: presets.gen.json: " + err.Error())
	}
	for k := range data.Keys {
		Keys = append(Keys, k)
	}
	slices.Sort(Keys)
}

// IsKey reports whether key exists.
func IsKey(key string) bool { _, ok := data.Keys[key]; return ok }

// IsPreset reports whether p names a preset.
func IsPreset(p string) bool { _, ok := data.Presets[p]; return ok }

// Resolve returns the forms for key: a branch override, then an
// organisation override, then the preset, then the school preset. An unknown
// key is an error, never a blank.
func Resolve(preset string, overrides []Override, branchID, key string) (Forms, error) {
	if !IsKey(key) {
		return Forms{}, fmt.Errorf("terminology: unknown key %q", key)
	}
	if branchID != "" {
		for _, o := range overrides {
			if o.Key == key && o.BranchID == branchID {
				return o.Forms, nil
			}
		}
	}
	for _, o := range overrides {
		if o.Key == key && o.BranchID == "" {
			return o.Forms, nil
		}
	}
	if !IsPreset(preset) {
		preset = "school"
	}
	return data.Presets[preset][key], nil
}

// Word is Resolve picking the form for count.
func Word(preset string, overrides []Override, branchID, key string, count int) (string, error) {
	f, err := Resolve(preset, overrides, branchID, key)
	if count == 1 {
		return f.One, err
	}
	return f.Other, err
}
