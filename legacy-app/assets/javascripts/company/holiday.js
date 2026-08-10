$(document).on('click', '.add_holiday', function (e) {
    $.ajax({
        url: '/holidays',
        data: {holiday: {date: moment().format("Y-MM-D")}},
        method: 'POST',
        async: false,
        dataType: 'json'
    }).success(function (e) {
        $('#holidays-datatable tbody').append($("<tr>").attr("data-id", e.id)
            .append($("<td>").attr('tabindex', '1').text(moment(e.date).format("Y")))
            .append($("<td>").attr('tabindex', '1').text(moment(e.date).format("Y-MM-D")))
            .append($("<td>").attr('tabindex', '1').text(e.name))
            .append($("<td>").attr('tabindex', '1').append($("<a>").attr("href", `/holidays/${e.id}`).attr("data-confirm", "Are you sure?").attr("data-method", "delete").append($("<i>").attr("class","fa fa-trash")))))
        }).error(function (e) {
            flash_error(e.responseJSON.errors.toString());
        });
});

