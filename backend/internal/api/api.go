// Package api holds the request and response types generated from
// contracts/openapi.yaml. Run make gen (or go generate ./...) after changing
// the contract; never edit types.gen.go by hand.
package api

//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.1 -config oapi.yaml ../../../contracts/openapi.yaml
