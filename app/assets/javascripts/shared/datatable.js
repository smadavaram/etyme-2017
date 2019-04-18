$(document).ready(function () {

    $('#company-contacts-datatable').dataTable({
        processing: true,
        serverSide: true,
        ajax: $('#company-contacts-datatable').data('source'),
        columns: [
            {"data": "logo"},
            {"data": "first_name"},
            {"data": "last_name"},
            {"data": "title"},
            {"data": "email"},
            {"data": "phone"},
            {"data": "actions",
                searchable: false,
                orderable: false}
        ]

    });
});