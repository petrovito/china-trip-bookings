package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/petrovito/china-trip-bookings/backend/internal/services"
)

func GetSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := services.ComputeFullSummary(r.Context())
	if err != nil {
		writeJSONError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}
