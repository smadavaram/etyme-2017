$(document).ready(function () {

    $('#company-contacts-datatable').dataTable({
        processing: true,
        serverSide: true,
        order: [[ 1, "desc" ]],
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false,
            'render': function (data, type, full, meta) {
                return '<input type="checkbox" name="id[]" value="' + full.id + '">';
            }
        }],
        ajax: $('#company-contacts-datatable').data('source'),
        columns: [
            {
                data: "id",
                searchable: false,
                orderable: false

            },
            {data: "logo"},
            {data: "first_name"},
            {data: "title"},
            {data: "contact"},
            {
                data: "groups",
                searchable: false,
                orderable: false
            },
            {
                data: "reminder_note",
                searchable: false,
                orderable: false
            },
            {
                data: "actions",
                searchable: false,
                orderable: false
            }
        ]

    });
});