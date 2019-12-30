function initialize() {
    var input = document.getElementById('google_search_location');
    new google.maps.places.Autocomplete(input);
}
google.maps.event.addDomListener(window, 'load', initialize);