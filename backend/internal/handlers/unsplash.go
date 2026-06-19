package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/petrovito/china-trip-bookings/backend/internal/config"
)

func GetUnsplash(w http.ResponseWriter, r *http.Request) {
	location := r.URL.Query().Get("location")
	if location == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(400)
		w.Write([]byte(`{"error":"location required"}`))
		return
	}
	cfg := config.Load()
	if cfg.UnsplashKey == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		w.Write([]byte(`{"error":"UNSPLASH_ACCESS_KEY not set"}`))
		return
	}

	q := location + " China landscape travel"
	apiURL := "https://api.unsplash.com/search/photos?query=" + url.QueryEscape(q) +
		"&per_page=1&orientation=landscape&client_id=" + cfg.UnsplashKey

	resp, err := http.Get(apiURL)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		w.Write([]byte(`{"error":"` + err.Error() + `"}`))
		return
	}
	defer resp.Body.Close()

	var data struct {
		Results []struct {
			Urls struct {
				Regular string `json:"regular"`
			} `json:"urls"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		w.Write([]byte(`{"error":"` + err.Error() + `"}`))
		return
	}
	if len(data.Results) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(404)
		w.Write([]byte(`{"error":"no image found"}`))
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": data.Results[0].Urls.Regular})
}
