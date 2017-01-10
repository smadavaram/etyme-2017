function flash(color , msg , icon){
    $.smallBox({
        title : msg,
        // content : "<i class='fa fa-clock-o'></i> <i>2 seconds ago...</i>",
        color : color,
        iconSmall : icon+" bounce animated",
        timeout : 4000
    });
}
function flash_error(msg)
{
    $error    = '#D04B2B';
    flash($error,msg , 'fa fa-exclamation-triangle');
}
function flash_success(msg)
{
    var $success  = '#80C14B';
    flash($success,msg , 'fa fa-check');
}
function flash_info(msg)
{
    var $info     = '#35A4DA';
    flash($info,msg , 'fa fa-info');
}
function flash_notice(msg)
{
    var $notice   = '#80C14B';
    flash($notice,msg , 'fa fa-thumbs');
}
function flash_alert(msg)
{
    var $alert    = '#FFC333';
    flash($alert,msg , 'fa fa-exclamation-triangle');
}

    $( document ).ready(function() {
        $(".multi-select2").select2({
            placeholder: $('#'+$('.multi-select2').attr('id')).attr('placeholder'),
            tokenSeparators: [',', ' ']
        })
        $("#comment_body").keypress(function(event) {
            if (event.which == 13) {
                event.preventDefault();
                $("#new_comment").submit();
            }
        });
        if($('#container-chart').length > 0) {
        $('#container-chart').highcharts({
            colors: ['#53C986','#334A5E','#ffc333','#fb6b5b'],
            chart: {
                type: 'column'
            },
            title: {
                text: 'Timesheet'
            },
            tooltip: {
                pointFormat: '<span>{series.name}</span>: <b>{point.y}</b><br/>'
            },
            subtitle: {
                text: 'Approved Hours / Day'
            },
            xAxis: {
                categories: ['19th Dec','21th Dec','22th Dec','23th Dec','24th Dec','25th Dec','26th Dec','27th Dec']
            },
            plotOptions: {
                series: {
                    minPointLength: 0,
                    dataLabels: {
                        enabled: true,

                    },
                }
            },
            yAxis: {
                title: {
                    text: 'Days'
                }

            },
            series: [{
                name: 'Total Hours ',
                data: [4,7,5,7,10,7,10,4.4],
                color: '#2196F3'
            }]
        })
    }
    });

