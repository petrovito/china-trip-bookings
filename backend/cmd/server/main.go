package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/petrovito/china-trip-bookings/backend/internal/auth"
	"github.com/petrovito/china-trip-bookings/backend/internal/config"
	"github.com/petrovito/china-trip-bookings/backend/internal/db"
	"github.com/petrovito/china-trip-bookings/backend/internal/handlers"
)

func main() {
	cfg := config.Load()
	db.Init(cfg.DatabaseURL)
	defer db.Close()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://china-trip-bookings.vercel.app", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Mcp-Session-Id"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Public
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	r.Get("/api/bookings", handlers.ListBookings)
	r.Get("/api/transport", handlers.ListTransport)
	r.Get("/api/accommodation", handlers.ListAccommodation)
	r.Get("/api/experiences", handlers.ListExperiences)
	r.Get("/api/segments", handlers.ListSegments)
	r.Get("/api/todos", handlers.ListTodos)
	r.Get("/api/summary", handlers.GetSummary)
	r.Get("/api/unsplash", handlers.GetUnsplash)

	// Write-protected
	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware)
		r.Post("/api/bookings", handlers.CreateBooking)
		r.Put("/api/bookings/{id}", handlers.UpdateBooking)
		r.Patch("/api/bookings/{id}", handlers.PatchBooking)
		r.Delete("/api/bookings/{id}", handlers.DeleteBooking)

		r.Post("/api/transport", handlers.CreateTransport)
		r.Put("/api/transport/{id}", handlers.UpdateTransport)
		r.Post("/api/accommodation", handlers.CreateAccommodation)
		r.Put("/api/accommodation/{id}", handlers.UpdateAccommodation)
		r.Post("/api/experiences", handlers.CreateExperience)
		r.Put("/api/experiences/{id}", handlers.UpdateExperience)

		r.Post("/api/segments", handlers.CreateSegment)
		r.Patch("/api/segments/{id}", handlers.PatchSegment)
		r.Delete("/api/segments/{id}", handlers.DeleteSegment)

		r.Post("/api/todos", handlers.CreateTodo)
		r.Patch("/api/todos/{id}", handlers.PatchTodo)
		r.Delete("/api/todos/{id}", handlers.DeleteTodo)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
