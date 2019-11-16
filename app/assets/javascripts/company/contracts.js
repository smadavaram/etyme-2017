function toogle_consultant(target,selector){
    if(target.value == "yes"){
        $(selector).show()
    }else{
        $(selector).hide()
    }
}

function toogle_seller(target,selector){
    if(target.value == "yes"){
        $(selector).show()
    }else{
        $(selector).hide()
    }
}

function initialize() {
    var input = document.getElementById('google_search_location');
    new google.maps.places.Autocomplete(input);
}

google.maps.event.addDomListener(window, 'load', initialize);
$(function() {
    $('#change_rate_from_date , #change_rate_to_date, #job_end_date,#job_start_date').datepicker({
        dateFormat : 'yy/mm/dd',
        prevText : '<i class="fa fa-chevron-left"></i>',
        nextText : '<i class="fa fa-chevron-right"></i>',
    });



});
