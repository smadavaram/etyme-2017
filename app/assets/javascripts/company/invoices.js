$(document).ready(function() {
    $(".best_in_place").best_in_place();
    $(".best_in_place").bind("ajax:success", function(){ location.reload() });
});