package db

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Init(dsn string) {
	if dsn == "" {
		log.Fatal("DATABASE_URL not set")
	}
	var err error
	Pool, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
}

func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
