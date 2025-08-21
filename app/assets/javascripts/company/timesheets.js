
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
function time_line_filter(tab,cycle_selector,contract_selector){
    let cycle = $(cycle_selector).val();
    let contract = $(contract_selector).val();
    $.get(`/timesheets/client_timesheets.js?cycle_id=${cycle}&&contract_id=${contract}&&tab=${tab}`);
}
flash_success('Celandar Rendered Successfully');
$('.cycle-type').change(function(){
    $.get(`/timesheets/client_timesheets.js?cycle_id=${false}&&contract_id=${false}&&tab=open_timesheets&&cycle_frequency=${$(this).val()}`);
});
$('.select-contract').change(function() {
    $.get(`/api/candidate/candidates/contract_cycles.json?contract_type=SellContract&contract_id=${$(this).val()}`).then(function(data) {
        $('.select-time-cycle').empty().append($("<option>").val("all").text("Select Cycle"));
        data.forEach(function(cycle) {
            $('.select-time-cycle').append($("<option>").val(cycle.id).text(cycle.range))
        });
        $('.select-time-cycle').removeAttr('disabled');
    })
});

$('.select-time-cycle').change(function(){
    let cycle = $(this).val();
    let contract = $('.select-contract').val();
    $.get(`/timesheets/client_timesheets.js?cycle_id=${cycle}&&contract_id=${contract}&&tab=open_timesheets`);
});

$(".all-select").on("change", function(){
    $( '.sin-select' ).prop('checked', this.checked)
});

$(".save-all-btn").on("click", function(){
    $('input[name=sin_select]:checked').each(function(){
        $(this).closest('form').submit();
    });
})