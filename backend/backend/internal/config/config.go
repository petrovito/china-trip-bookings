package config

import "os"

type Config struct {
	DatabaseURL   string
	WritePassword string
	UnsplashKey   string
}

func Load() Config {
	return Config{
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		WritePassword: os.Getenv("WRITE_PASSWORD"),
		UnsplashKey:   os.Getenv("UNSPLASH_ACCESS_KEY"),
	}
}
