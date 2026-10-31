# Build from the repository root (docker build -f backend/Dockerfile .) so the
# image carries database/migrations, which the server applies at start.
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server  && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /out/worker /app/
COPY database/migrations /migrations
ENV MIGRATIONS_DIR=/migrations
EXPOSE 8080
ENTRYPOINT ["/app/server"]
