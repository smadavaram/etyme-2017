
$('.ts').on('click', function (e) {
    $('#ts_tag').val(e.target.text);
    $('#timesheets').submit();
});

$('.ts_for').on('change', function (e) {
    $('#timesheets').submit();
});

$('#ts_select_all').on('click', function(e){
    $('input[id=ts_ids]').each(function () {
        $(this).prop('checked', e.target.checked);
    });
});