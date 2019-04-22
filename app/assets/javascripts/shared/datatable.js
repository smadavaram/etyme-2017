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
            {"data": "groups",
              searchable: false,
              orderable: false},
            {"data": "reminder_note",
              searchable: false,
              orderable: false},
            {"data": "actions",
                searchable: false,
                orderable: false}
        ]

    });
});