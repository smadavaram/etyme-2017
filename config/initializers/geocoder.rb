Geocoder.configure(
  lookup: :nominatim,            # name of geocoding service (symbol)
  ip_lookup: :ipinfo_io,      # name of IP address geocoding service (symbol)
  use_https: true,           # use HTTPS for lookup requests? (if supported)
  api_key: nil,               # API key for geocoding service
  units: :km,                 # :km for kilometers or :mi for miles
  http_headers: { "User-Agent" => "Etyme (asad.sarfraz@etyme.com)" }
)
