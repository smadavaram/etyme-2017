//= require static/js/modernizr-custom
//= require static/js/jQuery-2.1.4.min
//= require jquery-ui

//= require static/js/bootstrap.min
//= require static/js/waypoints.min
//= require static/js/jquery.animateNumbers
//= require static/js/jquery.flexslider-min
//= require plugin/bootstrap-timepicker/bootstrap-timepicker.min
//= require static/js/kafe.flexslider
//= require static/js/jquery.appear
//= require static/js/jquery.easypiechart
//= require static/js/vegas/vegas
//= require static/js/vegas/jquery.appear
//= require static/js/kafe
// require jquery.amaran
// require plugin/select2/select2.min
//= require tinymce-jquery
//= require plugin/jquery-validate/jquery.validate.min
//= require notification/SmartNotification.min.js
//=require cable
//=require addevent
//= require load_more_chat
//= require conversation/chat
// = require_tree ./clean_admin/.
//= require shared/uploader
//= require custom
//= require trix
function display_file_name(event) {
    // alert(event.fpfile.filename );
    $('.uploaded_file_name').text(event.fpfile.filename)
}
