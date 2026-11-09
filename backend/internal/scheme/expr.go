package scheme

import (
	"fmt"
	"math/big"
	"sort"
	"strings"
)

// An expression combines component values into a subject result (Part
// 4.2). It is compiled and checked when the scheme is saved. Only the
// whitelisted functions exist; there is no input or output, no clock and
// no randomness. Arithmetic is exact. Rounding happens only where the
// scheme declares it.

// Functions are the whitelist, with how many arguments each takes.
var Functions = map[string]struct{ min, max int }{
	"sum": {1, -1}, "avg": {1, -1}, "min": {1, -1}, "max": {1, -1},
	"best_n":        {2, 2}, // best_n([A, B, C], n): the average of the best n
	"scale":         {3, 3}, // scale(v, from_max, to_max)
	"clamp":         {3, 3}, // clamp(v, lo, hi)
	"round_half_up": {2, 2}, // round_half_up(v, places)
	"pct":           {2, 2}, // pct(v, max)
	"coalesce":      {2, 2}, // coalesce(a, b): a, or b when a was left out
}

// FunctionNames lists the whitelist in a stable order, for messages.
func FunctionNames() []string {
	out := make([]string, 0, len(Functions))
	for f := range Functions {
		out = append(out, f)
	}
	sort.Strings(out)
	return out
}

// ExprError says where an expression is wrong. Pos counts from 1.
type ExprError struct {
	Pos int
	Msg string
}

func (e *ExprError) Error() string { return fmt.Sprintf("at character %d: %s", e.Pos, e.Msg) }

type node interface{ pos() int }

type (
	numNode struct {
		v  *big.Rat
		at int
	}
	refNode struct {
		name string
		at   int
	}
	listNode struct {
		items []node
		at    int
	}
	callNode struct {
		fn   string
		args []node
		at   int
	}
	binNode struct {
		op   byte
		l, r node
		at   int
	}
	negNode struct {
		x  node
		at int
	}
)

func (n numNode) pos() int  { return n.at }
func (n refNode) pos() int  { return n.at }
func (n listNode) pos() int { return n.at }
func (n callNode) pos() int { return n.at }
func (n binNode) pos() int  { return n.at }
func (n negNode) pos() int  { return n.at }

// Expr is a compiled expression.
type Expr struct {
	src  string
	root node
	refs map[string]bool
}

// Refs are the variables the expression reads.
func (e *Expr) Refs() map[string]bool { return e.refs }

type token struct {
	kind byte // n number, i identifier, or the operator character; 0 at the end
	text string
	at   int
}

func tokens(src string) ([]token, error) {
	var out []token
	for i := 0; i < len(src); {
		c := src[i]
		switch {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r':
			i++
		case c >= '0' && c <= '9' || c == '.':
			j := i
			for j < len(src) && (src[j] >= '0' && src[j] <= '9' || src[j] == '.') {
				j++
			}
			out = append(out, token{'n', src[i:j], i + 1})
			i = j
		case c == '_' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z':
			j := i
			for j < len(src) && (src[j] == '_' || src[j] >= 'a' && src[j] <= 'z' || src[j] >= 'A' && src[j] <= 'Z' || src[j] >= '0' && src[j] <= '9') {
				j++
			}
			out = append(out, token{'i', src[i:j], i + 1})
			i = j
		case strings.IndexByte("+-*/(),[]", c) >= 0:
			out = append(out, token{c, string(c), i + 1})
			i++
		default:
			return nil, &ExprError{i + 1, fmt.Sprintf("%q cannot be used here. Use numbers, component codes, + - * / and the listed functions.", string(c))}
		}
	}
	return append(out, token{0, "", len(src) + 1}), nil
}

type parser struct {
	toks []token
	i    int
	vars map[string]bool
	refs map[string]bool
}

func (p *parser) peek() token { return p.toks[p.i] }
func (p *parser) next() token { t := p.toks[p.i]; p.i++; return t }

func (p *parser) expect(k byte, what string) error {
	if t := p.next(); t.kind != k {
		return &ExprError{t.at, "expected " + what}
	}
	return nil
}

// Compile parses src and checks every name in it: a function must be on
// the whitelist with the right number of arguments, and a variable must be
// one of vars (AT-v3-12).
func Compile(src string, vars map[string]bool) (*Expr, error) {
	if strings.TrimSpace(src) == "" {
		return nil, &ExprError{1, "the expression is empty"}
	}
	toks, err := tokens(src)
	if err != nil {
		return nil, err
	}
	p := &parser{toks: toks, vars: vars, refs: map[string]bool{}}
	root, err := p.sum()
	if err != nil {
		return nil, err
	}
	if t := p.peek(); t.kind != 0 {
		return nil, &ExprError{t.at, fmt.Sprintf("unexpected %q", t.text)}
	}
	if _, ok := root.(listNode); ok {
		return nil, &ExprError{1, "a list [ ] can only be given to a function such as sum or best_n"}
	}
	return &Expr{src: src, root: root, refs: p.refs}, nil
}

func (p *parser) sum() (node, error) {
	l, err := p.product()
	if err != nil {
		return nil, err
	}
	for t := p.peek(); t.kind == '+' || t.kind == '-'; t = p.peek() {
		p.next()
		r, err := p.product()
		if err != nil {
			return nil, err
		}
		l = binNode{t.kind, l, r, t.at}
	}
	return l, nil
}

func (p *parser) product() (node, error) {
	l, err := p.unary()
	if err != nil {
		return nil, err
	}
	for t := p.peek(); t.kind == '*' || t.kind == '/'; t = p.peek() {
		p.next()
		r, err := p.unary()
		if err != nil {
			return nil, err
		}
		l = binNode{t.kind, l, r, t.at}
	}
	return l, nil
}

func (p *parser) unary() (node, error) {
	if t := p.peek(); t.kind == '-' {
		p.next()
		x, err := p.unary()
		if err != nil {
			return nil, err
		}
		return negNode{x, t.at}, nil
	}
	return p.atom()
}

func (p *parser) atom() (node, error) {
	t := p.next()
	switch t.kind {
	case 'n':
		v, ok := rat(t.text)
		if !ok {
			return nil, &ExprError{t.at, fmt.Sprintf("%q is not a number", t.text)}
		}
		return numNode{v, t.at}, nil
	case '(':
		x, err := p.sum()
		if err != nil {
			return nil, err
		}
		return x, p.expect(')', "a closing )")
	case '[':
		var items []node
		for {
			x, err := p.sum()
			if err != nil {
				return nil, err
			}
			items = append(items, x)
			if p.peek().kind != ',' {
				break
			}
			p.next()
		}
		return listNode{items, t.at}, p.expect(']', "a closing ]")
	case 'i':
		if p.peek().kind == '(' {
			return p.call(t)
		}
		if _, isFn := Functions[t.text]; isFn {
			return nil, &ExprError{t.at, fmt.Sprintf("%s is a function: write %s( ... )", t.text, t.text)}
		}
		if !p.vars[t.text] {
			return nil, &ExprError{t.at, fmt.Sprintf("%q is not a component code of this scheme", t.text)}
		}
		p.refs[t.text] = true
		return refNode{t.text, t.at}, nil
	case 0:
		return nil, &ExprError{t.at, "the expression ends too early"}
	}
	return nil, &ExprError{t.at, fmt.Sprintf("unexpected %q", t.text)}
}

func (p *parser) call(name token) (node, error) {
	arity, ok := Functions[name.text]
	if !ok {
		return nil, &ExprError{name.at, fmt.Sprintf("%q is not an allowed function. Use one of %s.", name.text, strings.Join(FunctionNames(), ", "))}
	}
	p.next() // (
	var args []node
	if p.peek().kind != ')' {
		for {
			x, err := p.sum()
			if err != nil {
				return nil, err
			}
			args = append(args, x)
			if p.peek().kind != ',' {
				break
			}
			p.next()
		}
	}
	if err := p.expect(')', "a closing )"); err != nil {
		return nil, err
	}
	if len(args) < arity.min || arity.max >= 0 && len(args) > arity.max {
		want := fmt.Sprintf("%d", arity.min)
		if arity.max < 0 {
			want = fmt.Sprintf("at least %d", arity.min)
		}
		return nil, &ExprError{name.at, fmt.Sprintf("%s takes %s argument(s), not %d", name.text, want, len(args))}
	}
	for i, a := range args {
		_, isList := a.(listNode)
		switch name.text {
		case "sum", "avg", "min", "max":
		case "best_n":
			if i == 0 && !isList {
				return nil, &ExprError{a.pos(), "best_n takes a list first, for example best_n([PT1, PT2, PT3], 2)"}
			}
			if i == 1 && !wholeLiteral(a, 1, 99) {
				return nil, &ExprError{a.pos(), "best_n takes a whole number of items second, for example 2"}
			}
			continue
		case "round_half_up":
			if i == 1 && !wholeLiteral(a, 0, 4) {
				return nil, &ExprError{a.pos(), "round_half_up takes a number of places from 0 to 4 second"}
			}
		}
		if isList && name.text != "sum" && name.text != "avg" && name.text != "min" && name.text != "max" {
			return nil, &ExprError{a.pos(), fmt.Sprintf("%s does not take a list", name.text)}
		}
	}
	return callNode{name.text, args, name.at}, nil
}

func wholeLiteral(n node, lo, hi int64) bool {
	v, ok := n.(numNode)
	return ok && v.v.IsInt() && v.v.Num().Int64() >= lo && v.v.Num().Int64() <= hi
}

// val is a number, or a component left out of this result (excluded or
// exempt): it counts as nothing in a sum and is skipped by avg, min, max
// and best_n, and coalesce replaces it.
type val struct {
	r       *big.Rat
	missing bool
}

// Eval works the expression out over the given component values.
func (e *Expr) Eval(vars map[string]val) (val, error) { return eval(e.root, vars) }

func eval(n node, vars map[string]val) (val, error) {
	switch n := n.(type) {
	case numNode:
		return val{r: n.v}, nil
	case refNode:
		v, ok := vars[n.name]
		if !ok {
			return val{}, &ExprError{n.at, n.name + " has no value"}
		}
		if v.r == nil {
			v.r = zero()
		}
		return v, nil
	case negNode:
		x, err := eval(n.x, vars)
		if err != nil {
			return val{}, err
		}
		return val{r: new(big.Rat).Neg(x.r), missing: x.missing}, nil
	case binNode:
		l, err := eval(n.l, vars)
		if err != nil {
			return val{}, err
		}
		r, err := eval(n.r, vars)
		if err != nil {
			return val{}, err
		}
		out := val{missing: l.missing && r.missing}
		switch n.op {
		case '+':
			out.r = add(l.r, r.r)
		case '-':
			out.r = sub(l.r, r.r)
		case '*':
			out.r = mul(l.r, r.r)
		case '/':
			if r.r.Sign() == 0 {
				return val{}, &ExprError{n.at, "divides by zero"}
			}
			out.r = quo(l.r, r.r)
		}
		return out, nil
	case callNode:
		return call(n, vars)
	}
	return val{}, &ExprError{n.pos(), "a list [ ] can only be given to a function"}
}

func call(n callNode, vars map[string]val) (val, error) {
	var items []val // the arguments, with lists spread out
	for i, a := range n.args {
		if n.fn == "best_n" && i == 1 {
			break
		}
		if l, ok := a.(listNode); ok {
			for _, x := range l.items {
				v, err := eval(x, vars)
				if err != nil {
					return val{}, err
				}
				items = append(items, v)
			}
			continue
		}
		v, err := eval(a, vars)
		if err != nil {
			return val{}, err
		}
		items = append(items, v)
	}
	present := make([]*big.Rat, 0, len(items))
	for _, v := range items {
		if !v.missing {
			present = append(present, v.r)
		}
	}
	none := val{r: zero(), missing: true}
	switch n.fn {
	case "sum":
		if len(present) == 0 {
			return none, nil
		}
		s := zero()
		for _, r := range present {
			s = add(s, r)
		}
		return val{r: s}, nil
	case "avg":
		if len(present) == 0 {
			return none, nil
		}
		s := zero()
		for _, r := range present {
			s = add(s, r)
		}
		return val{r: quo(s, whole(int64(len(present))))}, nil
	case "min", "max":
		if len(present) == 0 {
			return none, nil
		}
		best := present[0]
		for _, r := range present[1:] {
			if n.fn == "min" && r.Cmp(best) < 0 || n.fn == "max" && r.Cmp(best) > 0 {
				best = r
			}
		}
		return val{r: best}, nil
	case "best_n":
		if len(present) == 0 {
			return none, nil
		}
		k := int(n.args[1].(numNode).v.Num().Int64())
		sorted := append([]*big.Rat(nil), present...)
		sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Cmp(sorted[j]) > 0 })
		if k > len(sorted) {
			k = len(sorted)
		}
		s := zero()
		for _, r := range sorted[:k] {
			s = add(s, r)
		}
		return val{r: quo(s, whole(int64(k)))}, nil
	case "scale":
		if items[1].r.Sign() == 0 {
			return val{}, &ExprError{n.at, "scale divides by a maximum of zero"}
		}
		return val{r: mul(quo(items[0].r, items[1].r), items[2].r), missing: items[0].missing}, nil
	case "clamp":
		v := items[0].r
		if v.Cmp(items[1].r) < 0 {
			v = items[1].r
		}
		if v.Cmp(items[2].r) > 0 {
			v = items[2].r
		}
		return val{r: v, missing: items[0].missing}, nil
	case "round_half_up":
		places := int(n.args[1].(numNode).v.Num().Int64())
		return val{r: round(items[0].r, places), missing: items[0].missing}, nil
	case "pct":
		if items[1].r.Sign() == 0 {
			return val{}, &ExprError{n.at, "pct divides by a maximum of zero"}
		}
		return val{r: percent(items[0].r, items[1].r), missing: items[0].missing}, nil
	case "coalesce":
		if items[0].missing {
			return items[1], nil
		}
		return items[0], nil
	}
	return val{}, &ExprError{n.at, n.fn + " is not an allowed function"}
}
