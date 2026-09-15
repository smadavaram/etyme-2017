$('#show_type').change(function(){
    $.ajax({
        url: "dashboard?search_by="+$('#search-term').val(),
        type: "GET",
        data: {value: $('#show_type option:selected').text()},
    })
});
$("#search-term").on("keypress", function (e) {

    if (e.keyCode == 13) {
        var sval = $('#search-term').val();
        $.get('/dashboard?search_by='+sval);
    }
});
$('#custom_range').daterangepicker({
    startDate: moment().startOf('month'),
    endDate: moment().endOf('month'),
    locale: {
        format: 'DD/MM/YYYY'
    }
});

$("#custom_range").change(function(){
    url = "/filter_data/period?start_date=" + $(this).val().replace(/\s+/g, "").split('-').join("&end_date=")
    $.get(url);
});
$(".directory-search").on('keydown',function () {
    var txt = $('.directory-search').val();
    if(!!txt.trim()){
        $('.toggleable').each(function(){
            if($(this).find('.user-title').text().toLowerCase().includes(txt.toLowerCase())){
                $(this).show();
            }else{
                $(this).hide();
            }
        });
    }else{
        $('.toggleable').show()
    }
});
