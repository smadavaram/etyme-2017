$('.ss').on('click', function (e) {
    $('#ts_tag').val($(this).data("tab"));
    $('#salaries').submit();
});
$('.ts_for').on('change', function (e) {
    $('#timesheets').submit();
});
$('.cmc').on('click', function (e) {
    $('.cmc').removeClass('active');
    $(this).addClass('active');
    $('#ss_cycle').val(($(this).data("month")));
    $('#ts_tag').val($('.ss.active').data("tab"));
    $('.p_date').val(null);
    $('#salaries').submit();
});

$('.cc_form_submitter').on('click',function(e){
   $('#cc_form').submit();
});