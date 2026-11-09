package scheme

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"

	"go.yaml.in/yaml/v3"
)

// A board pack is a folder with a manifest, a scheme and grade bands
// (Part 4.8). Packs carry codes and short paraphrased labels only. The
// packs shipped with revU are fictional examples, clearly named so.

//go:embed packs
var shipped embed.FS

// Pack is a board pack, read and checked.
type Pack struct {
	Key         string     `json:"key"` // board-stage@version, the import key
	Board       string     `json:"board"`
	Name        string     `json:"name"`
	Stage       string     `json:"stage"`
	Version     int        `json:"version"`
	Description string     `json:"description"`
	Definition  Definition `json:"definition"`
}

// PackError is one problem in a pack, by file and line.
type PackError struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Message string `json:"message"`
}

// PackErrors is every problem found; a pack with any imports nothing.
type PackErrors []PackError

func (p PackErrors) Error() string {
	parts := make([]string, len(p))
	for i, e := range p {
		parts[i] = fmt.Sprintf("%s:%d: %s", e.File, e.Line, e.Message)
	}
	return strings.Join(parts, "; ")
}

type manifest struct {
	Board       string `yaml:"board"`
	Name        string `yaml:"name"`
	Stage       string `yaml:"stage"`
	Version     int    `yaml:"version"`
	Description string `yaml:"description"`
	Files       struct {
		Scheme string `yaml:"scheme"`
		Bands  string `yaml:"bands"`
	} `yaml:"files"`
}

// Packs are the packs shipped with revU.
func Packs() ([]Pack, error) {
	dirs, err := fs.ReadDir(shipped, "packs")
	if err != nil {
		return nil, err
	}
	var out []Pack
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		p, err := LoadPack(shipped, path.Join("packs", d.Name()))
		if err != nil {
			return nil, fmt.Errorf("pack %s: %w", d.Name(), err)
		}
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}

// ShippedPack is the shipped pack with this key.
func ShippedPack(key string) (Pack, bool) {
	ps, err := Packs()
	if err != nil {
		return Pack{}, false
	}
	for _, p := range ps {
		if p.Key == key {
			return p, true
		}
	}
	return Pack{}, false
}

// LoadPack reads the pack in dir and checks every file against its
// schema. Any problem is returned with its file and line (AT-v3-11).
func LoadPack(fsys fs.FS, dir string) (Pack, error) {
	var errs PackErrors
	fail := func(file string, line int, msg string, args ...any) {
		errs = append(errs, PackError{file, line, fmt.Sprintf(msg, args...)})
	}

	var m manifest
	if root, ok := readYAML(fsys, dir, "manifest.yaml", fail); ok {
		dec := yaml.NewDecoder(bytes.NewReader(root.raw))
		dec.KnownFields(true)
		if err := dec.Decode(&m); err != nil {
			fail("manifest.yaml", lineOf(err), "%s", yamlMessage(err))
		}
		for field, empty := range map[string]bool{"board": m.Board == "", "name": m.Name == "", "stage": m.Stage == "", "files.scheme": m.Files.Scheme == "", "files.bands": m.Files.Bands == ""} {
			if empty {
				fail("manifest.yaml", root.line(field), "%s is required", field)
			}
		}
		if m.Version < 1 {
			fail("manifest.yaml", root.line("version"), "version is a whole number from 1")
		}
	}
	if len(errs) > 0 {
		sortErrs(errs)
		return Pack{}, errs
	}

	scheme, ok1 := readYAML(fsys, dir, m.Files.Scheme, fail)
	bands, ok2 := readYAML(fsys, dir, m.Files.Bands, fail)
	if !ok1 || !ok2 {
		sortErrs(errs)
		return Pack{}, errs
	}
	var def map[string]any
	var grading any
	if err := scheme.node.Decode(&def); err != nil || def == nil {
		fail(m.Files.Scheme, 1, "a scheme is a mapping of schema, rounding, components and subject")
	}
	if err := bands.node.Decode(&grading); err != nil {
		fail(m.Files.Bands, 1, "the bands file is a mapping of from and bands")
	}
	if len(errs) > 0 {
		sortErrs(errs)
		return Pack{}, errs
	}
	if _, has := def["grading"]; has {
		fail(m.Files.Scheme, scheme.line("grading"), "grades belong in %s", m.Files.Bands)
	}
	def["grading"] = grading
	raw, err := json.Marshal(def)
	if err != nil {
		fail(m.Files.Scheme, 1, "%s", err.Error())
	}
	d, err := Parse(raw)
	if ps, ok := err.(Problems); ok {
		for _, p := range ps {
			if rest, inBands := strings.CutPrefix(p.Path, "grading"); inBands {
				fail(m.Files.Bands, bands.line(strings.TrimPrefix(rest, ".")), "%s: %s", p.Path, p.Message)
			} else {
				fail(m.Files.Scheme, scheme.line(p.Path), "%s", messageAt(p))
			}
		}
	} else if err != nil {
		fail(m.Files.Scheme, 1, "%s", err.Error())
	}
	if len(errs) > 0 {
		sortErrs(errs)
		return Pack{}, errs
	}
	return Pack{Key: fmt.Sprintf("%s-%s@%d", m.Board, m.Stage, m.Version), Board: m.Board, Name: m.Name, Stage: m.Stage,
		Version: m.Version, Description: m.Description, Definition: d}, nil
}

func messageAt(p Problem) string {
	if p.Path == "" {
		return p.Message
	}
	return p.Path + ": " + p.Message
}

func sortErrs(errs PackErrors) {
	sort.SliceStable(errs, func(i, j int) bool {
		if errs[i].File != errs[j].File {
			return errs[i].File < errs[j].File
		}
		return errs[i].Line < errs[j].Line
	})
}

type yamlDoc struct {
	raw   []byte
	node  *yaml.Node
	lines map[string]int // path -> line
}

// line is the line of path, or of the nearest enclosing path that exists.
func (d yamlDoc) line(p string) int {
	for {
		if l, ok := d.lines[p]; ok {
			return l
		}
		i := strings.LastIndexAny(p, ".[")
		if i < 0 {
			return d.lines[""]
		}
		p = p[:i]
	}
}

func readYAML(fsys fs.FS, dir, name string, fail func(string, int, string, ...any)) (yamlDoc, bool) {
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "\\") {
		fail("manifest.yaml", 1, "%q is not a file in the pack", name)
		return yamlDoc{}, false
	}
	raw, err := fs.ReadFile(fsys, path.Join(dir, name))
	if err != nil {
		fail(name, 0, "missing from the pack")
		return yamlDoc{}, false
	}
	var root yaml.Node
	if err := yaml.Unmarshal(raw, &root); err != nil {
		fail(name, lineOf(err), "%s", yamlMessage(err))
		return yamlDoc{}, false
	}
	if len(root.Content) == 0 {
		fail(name, 1, "the file is empty")
		return yamlDoc{}, false
	}
	doc := yamlDoc{raw: raw, node: root.Content[0], lines: map[string]int{}}
	walk(doc.node, "", doc.lines)
	return doc, true
}

func walk(n *yaml.Node, p string, lines map[string]int) {
	lines[p] = n.Line
	switch n.Kind {
	case yaml.MappingNode:
		for i := 0; i+1 < len(n.Content); i += 2 {
			key := n.Content[i].Value
			child := key
			if p != "" {
				child = p + "." + key
			}
			lines[child] = n.Content[i].Line
			walk(n.Content[i+1], child, lines)
			lines[child] = n.Content[i].Line
		}
	case yaml.SequenceNode:
		for i, c := range n.Content {
			walk(c, fmt.Sprintf("%s[%d]", p, i), lines)
		}
	}
}

// lineOf finds the line yaml reports in an error ("yaml: line 3: ...").
func lineOf(err error) int {
	var line int
	msg := err.Error()
	if i := strings.Index(msg, "line "); i >= 0 {
		fmt.Sscanf(msg[i:], "line %d", &line)
	}
	return line
}

func yamlMessage(err error) string {
	msg := strings.TrimPrefix(err.Error(), "yaml: ")
	msg = strings.TrimPrefix(msg, "unmarshal errors:\n  ")
	return msg
}
